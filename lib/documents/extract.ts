import "server-only";
import type { ProjectDocumentFileType } from "@/types/domain";
import { describeTable, parseCsv, tableFromRows, tableToMarkdown, type Cell, type DataTable } from "./tables";

/** Tamaño máximo de archivo que se acepta para extraer su texto. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** El texto extraído cabe en un documento del conocimiento (que admite hasta 1 MB). */
const MAX_CONTENT_CHARS = 900_000;
/** Filas por hoja que se guardan; el resto se resume en las estadísticas de columnas. */
const MAX_ROWS_PER_SHEET = 5_000;

export type UploadKind = "pdf" | "docx" | "xlsx" | "csv" | "text";

export interface ExtractedFile {
  title: string;
  filename: string;
  kind: UploadKind;
  fileType: ProjectDocumentFileType;
  /** Texto en Markdown listo para el conocimiento del proyecto. */
  content: string;
  /** Detalle corto para mostrar: «3 páginas», «2 hojas, 340 filas». */
  detail: string;
  truncated: boolean;
}

export class ExtractionError extends Error {}

export function uploadKindOf(filename: string, mime = ""): UploadKind | null {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "docx" || mime.includes("wordprocessingml")) return "docx";
  if (ext === "xlsx" || mime.includes("spreadsheetml")) return "xlsx";
  if (ext === "csv" || ext === "tsv" || mime === "text/csv") return "csv";
  if (["txt", "md", "markdown", "json"].includes(ext) || mime.startsWith("text/")) return "text";
  return null;
}

const titleFrom = (filename: string) => filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 200) || "Documento";

function fit(content: string): { content: string; truncated: boolean } {
  if (content.length <= MAX_CONTENT_CHARS) return { content, truncated: false };
  return { content: `${content.slice(0, MAX_CONTENT_CHARS)}\n\n_(Documento recortado: era demasiado largo para guardarlo completo.)_`, truncated: true };
}

/** Saca el texto de un archivo subido (PDF, Word, Excel, CSV o texto) y lo deja en Markdown. */
export async function extractUploadedFile(bytes: Uint8Array, filename: string, mime = ""): Promise<ExtractedFile> {
  if (bytes.byteLength === 0) throw new ExtractionError("El archivo está vacío.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ExtractionError("El archivo pesa más de 10 MB. Prueba con una versión más liviana.");
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xls") || lower.endsWith(".doc")) {
    throw new ExtractionError("Ese formato es antiguo. Guárdalo como .xlsx (Excel) o .docx (Word) y vuelve a subirlo.");
  }
  const kind = uploadKindOf(filename, mime);
  if (!kind) throw new ExtractionError("Formato no admitido. Sube un PDF, Word (.docx), Excel (.xlsx), CSV o texto.");

  const base = { title: titleFrom(filename), filename: filename.slice(0, 255), kind };
  if (kind === "pdf") {
    const { text, pages } = await extractPdfText(bytes);
    return { ...base, fileType: "pdf", ...fit(text), detail: `${pages} ${pages === 1 ? "página" : "páginas"}` };
  }
  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = value.replace(/\n{3,}/g, "\n\n").trim();
    if (!text) throw new ExtractionError("El Word no tiene texto que se pueda leer.");
    return { ...base, fileType: "text", ...fit(text), detail: `${text.split(/\s+/).length} palabras` };
  }
  if (kind === "xlsx") {
    const tables = await readWorkbook(bytes);
    return { ...base, fileType: "csv", ...tablesDocument(tables) };
  }
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  if (kind === "csv") {
    const table = tableFromRows(base.title, parseCsv(text));
    if (!table) throw new ExtractionError("El CSV no tiene filas.");
    return { ...base, fileType: "csv", ...tablesDocument([table]) };
  }
  if (!text.trim()) throw new ExtractionError("El archivo está vacío.");
  const isJson = lower.endsWith(".json");
  return { ...base, fileType: isJson ? "json" : lower.endsWith(".txt") ? "text" : "markdown", ...fit(text.trim()), detail: `${text.trim().split(/\s+/).length} palabras` };
}

/** Texto de un PDF, página por página. Un PDF escaneado (solo imágenes) no tiene texto. */
export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const { getDocumentProxy, extractText } = await import("unpdf");
  let result: { totalPages: number; text: string[] };
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    result = await extractText(pdf, { mergePages: false });
  } catch {
    throw new ExtractionError("No se pudo abrir el PDF. Puede estar dañado o protegido con contraseña.");
  }
  const pages = result.text.map((t) => t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim());
  if (!pages.some((p) => p.length > 0)) {
    throw new ExtractionError("El PDF no tiene texto que se pueda leer (parece escaneado o una imagen).");
  }
  const text = pages.length === 1 ? pages[0] : pages.map((p, i) => `## Página ${i + 1}\n\n${p}`).join("\n\n");
  return { text, pages: result.totalPages };
}

function cellValue(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (v instanceof Date) return v.toISOString().slice(0, v.getUTCHours() || v.getUTCMinutes() ? 16 : 10).replace("T", " ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellValue(o.result);
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    if (typeof o.text === "string") return o.text;
    if ("error" in o) return null;
  }
  return String(v);
}

async function readWorkbook(bytes: Uint8Array): Promise<DataTable[]> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw new ExtractionError("No se pudo abrir el Excel. Revisa que sea un .xlsx sin contraseña.");
  }
  const tables: DataTable[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== "visible") continue;
    const raw: Cell[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as unknown[];
      raw.push(values.slice(1).map(cellValue));
    });
    const t = tableFromRows(ws.name, raw);
    if (t && t.rows.length > 0) tables.push(t);
  }
  if (tables.length === 0) throw new ExtractionError("El Excel no tiene hojas con datos.");
  return tables;
}

const fmt = (n: number | undefined) => (n === undefined ? "" : n.toLocaleString("es-CR", { maximumFractionDigits: 2 }));

/** Documento de una o varias tablas: por hoja, sus columnas con estadísticas y luego la tabla completa. */
function tablesDocument(tables: DataTable[]): Omit<ExtractedFile, "title" | "filename" | "kind" | "fileType"> {
  const totalRows = tables.reduce((a, t) => a + t.rows.length, 0);
  let truncated = false;
  const sections = tables.map((t) => {
    const summary = describeTable(t);
    const cols = summary.columns
      .map((c) =>
        c.type === "number"
          ? `- **${c.name}** (número): suma ${fmt(c.sum)}, promedio ${fmt(c.avg)}, mínimo ${fmt(c.min)}, máximo ${fmt(c.max)}${c.empty ? `, ${c.empty} vacías` : ""}`
          : `- **${c.name}** (texto): ${c.distinct} valores distintos${c.top?.length ? `; más frecuentes: ${c.top.slice(0, 3).map((x) => `${x.value} (${x.count})`).join(", ")}` : ""}`,
      )
      .join("\n");
    if (t.rows.length > MAX_ROWS_PER_SHEET) truncated = true;
    const shown = Math.min(t.rows.length, MAX_ROWS_PER_SHEET);
    return [
      `## Hoja: ${t.name} (${t.rows.length} filas, ${t.columns.length} columnas)`,
      `### Columnas\n\n${cols}`,
      `### Datos${shown < t.rows.length ? ` (primeras ${shown} filas)` : ""}\n\n${tableToMarkdown(t, MAX_ROWS_PER_SHEET)}`,
    ].join("\n\n");
  });
  const fitted = fit(sections.join("\n\n"));
  return {
    ...fitted,
    truncated: truncated || fitted.truncated,
    detail: `${tables.length === 1 ? "1 hoja" : `${tables.length} hojas`}, ${totalRows} filas`,
  };
}
