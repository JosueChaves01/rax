/**
 * Tablas de datos (hojas de Excel, CSV) guardadas como Markdown en el conocimiento del proyecto, y los
 * cálculos que el agente hace sobre ellas. Los números los calcula el código, no el modelo: así un total
 * de ventas o un promedio no dependen de que la IA sume bien.
 */

export type Cell = string | number | null;

export interface DataTable {
  /** Nombre de la hoja o de la sección del documento. */
  name: string;
  columns: string[];
  rows: Cell[][];
}

/* ───────────── Lectura de números y CSV ───────────── */

/**
 * Interpreta un número escrito como texto: «₡1.234,50», «$1,234.50», «12 %», «(300)», «1 500».
 * Si aparecen punto y coma, el último es el decimal. Con un solo separador, solo es de miles cuando
 * agrupa de a tres cifras: con coma desde un grupo; con punto desde dos («1.234» se lee 1,234) o desde
 * uno si lleva moneda («₡10.000» son diez mil).
 */
export function parseNumber(value: Cell): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null) return null;
  let s = value.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s\u00a0]/g, "");
  const money = /^[-+]?(?:[₡$€£¥]|CRC|USD|EUR)|(?:[₡$€£¥]|CRC|USD|EUR)$/i.test(s);
  s = s.replace(/^([-+]?)(?:[₡$€£¥]|CRC|USD|EUR)/i, "$1").replace(/(?:[₡$€£¥%]|CRC|USD|EUR)$/i, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    normalized = s.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    normalized = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot >= 0) {
    // Con moneda, «₡10.000» son diez mil (así se escribe en Costa Rica); sin moneda, «1.234» es decimal.
    normalized = (money ? /^\d{1,3}(\.\d{3})+$/ : /^\d{1,3}(\.\d{3}){2,}$/).test(s) ? s.replace(/\./g, "") : s;
  } else normalized = s;
  if ((normalized.match(/\./g) ?? []).length > 1) return null;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Separa un CSV (coma, punto y coma o tabulador, el que más aparezca en la primera línea) respetando comillas. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1] as const);
  const delimiter = counts.reduce((best, c) => (c[1] > best[1] ? c : best))[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Arma una tabla desde filas crudas: la primera fila no vacía es el encabezado; los nombres repetidos o vacíos se numeran. */
export function tableFromRows(name: string, raw: Cell[][]): DataTable | null {
  const rows = raw.filter((r) => r.some((c) => c !== null && String(c).trim() !== ""));
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((r) => r.length));
  const seen = new Map<string, number>();
  const columns = Array.from({ length: width }, (_, i) => {
    const base = String(rows[0][i] ?? "").trim() || `Columna ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });
  const body = rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => normalizeCell(r[i])));
  // Se quitan las columnas completamente vacías (bordes de la hoja).
  const keep = columns.map((_, i) => rows[0][i] != null && String(rows[0][i]).trim() !== "" || body.some((r) => r[i] !== null));
  return {
    name,
    columns: columns.filter((_, i) => keep[i]),
    rows: body.map((r) => r.filter((_, i) => keep[i])),
  };
}

function normalizeCell(v: Cell | undefined): Cell {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.trim();
  return s === "" ? null : s;
}

/* ───────────── Markdown ───────────── */

const escapeCell = (v: Cell) => (v === null ? "" : String(v).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " "));

export function tableToMarkdown(table: DataTable, maxRows = Infinity): string {
  const rows = table.rows.slice(0, maxRows);
  return [
    `| ${table.columns.map(escapeCell).join(" | ")} |`,
    `|${table.columns.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function splitMarkdownRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "\\" && (inner[i + 1] === "|" || inner[i + 1] === "\\")) {
      cur += inner[i + 1];
      i++;
    } else if (ch === "|") {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const SEPARATOR = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;

/** Encuentra las tablas Markdown de un documento. Cada una toma el nombre del título que tiene arriba («## Hoja: Ventas» → «Ventas»). */
export function parseMarkdownTables(content: string): DataTable[] {
  const lines = content.split(/\r?\n/);
  const tables: DataTable[] = [];
  // «## Hoja: X» nombra lo que sigue (sus «### Columnas» y «### Datos») hasta el próximo título de nivel 1 o 2.
  let sheet = "";
  let heading = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const text = h[2].trim();
      if (/^Hoja:/i.test(text)) sheet = text.replace(/^Hoja:\s*/i, "").replace(/\s*\(\d[^)]*\)\s*$/, "").trim();
      else if (h[1].length <= 2) sheet = "";
      heading = text;
      continue;
    }
    if (!line.startsWith("|") || !SEPARATOR.test(lines[i + 1]?.trim() ?? "")) continue;
    const columns = splitMarkdownRow(line);
    const rows: Cell[][] = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].trim().startsWith("|"); j++) {
      const cells = splitMarkdownRow(lines[j]);
      rows.push(columns.map((_, k) => (cells[k] ?? "") || null));
    }
    tables.push({ name: sheet || heading || `Tabla ${tables.length + 1}`, columns, rows });
    i = j - 1;
  }
  return tables;
}

/* ───────────── Cálculos ───────────── */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Busca una columna por nombre sin importar mayúsculas ni tildes; acepta también una coincidencia parcial única. */
export function findColumn(table: DataTable, wanted: string): number {
  const w = fold(wanted);
  const exact = table.columns.findIndex((c) => fold(c) === w);
  if (exact >= 0) return exact;
  const partial = table.columns.map((c, i) => [fold(c), i] as const).filter(([c]) => c.includes(w) || w.includes(c));
  return partial.length === 1 ? partial[0][1] : -1;
}

/** Elige la tabla por nombre (o la única/la primera si no se indica). */
export function pickTable(tables: DataTable[], wanted?: string): DataTable | null {
  if (tables.length === 0) return null;
  if (!wanted?.trim()) return tables[0];
  const w = fold(wanted);
  return tables.find((t) => fold(t.name) === w) ?? tables.find((t) => fold(t.name).includes(w)) ?? null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface ColumnSummary {
  name: string;
  type: "number" | "text";
  filled: number;
  empty: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
  distinct?: number;
  top?: Array<{ value: string; count: number }>;
}

/** Una columna es numérica si al menos el 80 % de sus celdas con dato se leen como número. */
export function summarizeColumn(table: DataTable, index: number): ColumnSummary {
  const values = table.rows.map((r) => r[index]).filter((v): v is string | number => v !== null && String(v).trim() !== "");
  const nums = values.map(parseNumber).filter((n): n is number => n !== null);
  const base = { name: table.columns[index], filled: values.length, empty: table.rows.length - values.length };
  if (values.length > 0 && nums.length / values.length >= 0.8) {
    const sum = nums.reduce((a, b) => a + b, 0);
    return { ...base, type: "number", sum: round(sum), avg: round(sum / nums.length), min: Math.min(...nums), max: Math.max(...nums) };
  }
  const counts = new Map<string, number>();
  for (const v of values) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => ({ value, count }));
  return { ...base, type: "text", distinct: counts.size, top };
}

export function describeTable(table: DataTable) {
  return {
    table: table.name,
    rows: table.rows.length,
    columns: table.columns.map((_, i) => summarizeColumn(table, i)),
    sample: table.rows.slice(0, 5).map((r) => Object.fromEntries(table.columns.map((c, i) => [c, r[i]]))),
  };
}

export type Aggregation = "sum" | "avg" | "count" | "min" | "max";
export interface TableFilter {
  column: string;
  op?: "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte";
  value: string | number;
}
export interface AggregateRequest {
  groupBy?: string;
  metric?: string;
  aggregation?: Aggregation;
  filters?: TableFilter[];
  limit?: number;
}

function matches(cell: Cell, f: TableFilter): boolean {
  const op = f.op ?? "eq";
  if (op === "gt" || op === "gte" || op === "lt" || op === "lte") {
    const a = parseNumber(cell);
    const b = parseNumber(typeof f.value === "number" ? f.value : String(f.value));
    if (a === null || b === null) return false;
    return op === "gt" ? a > b : op === "gte" ? a >= b : op === "lt" ? a < b : a <= b;
  }
  const a = fold(cell === null ? "" : String(cell));
  const b = fold(String(f.value));
  if (op === "contains") return a.includes(b);
  const numA = parseNumber(cell);
  const numB = parseNumber(String(f.value));
  const equal = numA !== null && numB !== null ? numA === numB : a === b;
  return op === "neq" ? !equal : equal;
}

/**
 * Filtra, agrupa y calcula: «total de ventas por producto», «promedio de precio donde canal = Instagram».
 * Lanza un Error con un mensaje para el agente si una columna no existe.
 */
export function aggregateTable(table: DataTable, req: AggregateRequest) {
  const aggregation: Aggregation = req.aggregation ?? (req.metric ? "sum" : "count");
  const col = (name: string) => {
    const i = findColumn(table, name);
    if (i < 0) throw new Error(`No existe la columna «${name}» en «${table.name}». Columnas: ${table.columns.join(", ")}.`);
    return i;
  };
  const metricIndex = req.metric ? col(req.metric) : -1;
  if (aggregation !== "count" && metricIndex < 0) throw new Error(`Para calcular ${aggregation} hace falta indicar la columna (metric).`);
  const groupIndex = req.groupBy ? col(req.groupBy) : -1;
  const filters = (req.filters ?? []).map((f) => ({ ...f, index: col(f.column) }));

  const rows = table.rows.filter((r) => filters.every((f) => matches(r[f.index], f)));
  // Por grupo: cuántas filas cayeron y los valores numéricos de la columna medida.
  const groups = new Map<string, { rows: number; values: number[] }>();
  let withValue = 0;
  for (const r of rows) {
    const key = groupIndex >= 0 ? (r[groupIndex] === null ? "(vacío)" : String(r[groupIndex])) : "Total";
    const g = groups.get(key) ?? { rows: 0, values: [] };
    g.rows++;
    if (metricIndex >= 0) {
      const n = parseNumber(r[metricIndex]);
      if (n !== null) {
        g.values.push(n);
        withValue++;
      }
    }
    groups.set(key, g);
  }

  const compute = ({ rows: n, values: vals }: { rows: number; values: number[] }) => {
    if (aggregation === "count") return n;
    if (vals.length === 0) return null;
    if (aggregation === "sum") return round(vals.reduce((a, b) => a + b, 0));
    if (aggregation === "avg") return round(vals.reduce((a, b) => a + b, 0) / vals.length);
    return aggregation === "min" ? Math.min(...vals) : Math.max(...vals);
  };
  const results = [...groups.entries()]
    .map(([group, g]) => ({ group, value: compute(g), rows: g.rows }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const limit = Math.min(Math.max(req.limit ?? 25, 1), 100);
  return {
    table: table.name,
    aggregation,
    metric: metricIndex >= 0 ? table.columns[metricIndex] : undefined,
    groupBy: groupIndex >= 0 ? table.columns[groupIndex] : undefined,
    filters: filters.map(({ column, op, value }) => ({ column: table.columns[findColumn(table, column)], op: op ?? "eq", value })),
    rowsMatched: rows.length,
    ...(metricIndex >= 0 ? { rowsWithNumber: withValue } : {}),
    groups: results.length,
    results: results.slice(0, limit),
    ...(results.length > limit ? { omittedGroups: results.length - limit } : {}),
  };
}
