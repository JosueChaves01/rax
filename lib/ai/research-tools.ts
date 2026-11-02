import "server-only";
import type { ServiceDeps } from "@/lib/services/base";
import type { ProjectKnowledgeDocument } from "@/types/domain";
import { listProjectDocuments } from "@/lib/services/project-knowledge";
import { enforceAiQuota } from "@/lib/services/ai-quota";
import { aggregateTable, describeTable, parseCsv, parseMarkdownTables, pickTable, tableFromRows, type Aggregation, type TableFilter } from "@/lib/documents/tables";
import { extractPdfText } from "@/lib/documents/extract";
import { readWebPage, webSearch, webSearchProvider, UnsafeUrlError } from "./web-search";
import type { WorkflowToolDefinition } from "./workflow-tools";

/**
 * Herramientas para que el agente investigue: buscar en la web, leer una página, leer un documento del
 * proyecto completo y calcular sobre las tablas (Excel/CSV) que se subieron.
 */

export const WEB_SEARCH_TOOL: WorkflowToolDefinition = {
  name: "web_search",
  description:
    "Busca en internet información actual: competidores, precios, tamaño de mercado, regulaciones, proveedores, tendencias. Devuelve títulos, enlaces y fragmentos. Cita las fuentes con sus enlaces en la respuesta.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Búsqueda concreta, con lugar y año si importan (p. ej. «precio café de especialidad 250 g Costa Rica 2026»)" },
      max_results: { type: "number", description: "Cuántos resultados (1 a 8, por defecto 5)" },
    },
    required: ["query"],
  },
};

export const READ_WEB_PAGE_TOOL: WorkflowToolDefinition = {
  name: "read_web_page",
  description: "Lee el texto de una página web pública (o un PDF en línea) para revisar un dato con más detalle que el fragmento de la búsqueda.",
  parameters: {
    type: "object",
    properties: { url: { type: "string", description: "Dirección completa (https://…), normalmente un resultado de web_search o un enlace que dio la persona" } },
    required: ["url"],
  },
};

export const READ_PROJECT_DOCUMENT_TOOL: WorkflowToolDefinition = {
  name: "read_project_document",
  description:
    "Lee un documento del conocimiento del proyecto (archivos subidos: PDF, Word, Excel, CSV, notas). Sin document, lista los documentos disponibles. Para documentos largos usa part para seguir leyendo.",
  parameters: {
    type: "object",
    properties: {
      document: { type: "string", description: "Título, nombre de archivo o id del documento. Omítelo para ver la lista." },
      part: { type: "number", description: "Parte a leer (1, 2, 3…), cada una de unos 10 000 caracteres. Por defecto 1." },
    },
  },
};

export const ANALYZE_TABLE_TOOL: WorkflowToolDefinition = {
  name: "analyze_table_data",
  description:
    "Calcula con exactitud sobre una tabla de un Excel o CSV subido al proyecto: describe columnas (sumas, promedios, mínimos, máximos, valores frecuentes) o agrega con filtros y agrupación (p. ej. total de ventas por producto en octubre). Úsala siempre que haya que dar números de un archivo, en vez de calcularlos tú.",
  parameters: {
    type: "object",
    properties: {
      document: { type: "string", description: "Título, nombre de archivo o id del documento con la tabla" },
      sheet: { type: "string", description: "Nombre de la hoja (si el Excel tiene varias). Por defecto la primera." },
      operation: { type: "string", enum: ["describe", "aggregate"], description: "describe para conocer columnas y totales; aggregate para un cálculo puntual" },
      metric: { type: "string", description: "Columna numérica a calcular (para aggregate)" },
      aggregation: { type: "string", enum: ["sum", "avg", "count", "min", "max"], description: "Cálculo. Por defecto sum si hay metric, count si no." },
      group_by: { type: "string", description: "Columna para agrupar (opcional)" },
      filters: {
        type: "array",
        description: "Filtros opcionales sobre las filas",
        items: {
          type: "object",
          properties: {
            column: { type: "string" },
            op: { type: "string", enum: ["eq", "neq", "contains", "gt", "gte", "lt", "lte"] },
            value: { type: "string" },
          },
          required: ["column", "value"],
        },
      },
      limit: { type: "number", description: "Máximo de grupos a devolver (por defecto 25)" },
    },
    required: ["document"],
  },
};

export const RESEARCH_TOOL_NAMES = new Set(["web_search", "read_web_page", "read_project_document", "analyze_table_data"]);

/** Las de documentos siempre; las de web solo si hay un proveedor de búsqueda configurado. */
export function researchTools(): WorkflowToolDefinition[] {
  return [READ_PROJECT_DOCUMENT_TOOL, ANALYZE_TABLE_TOOL, ...(webSearchProvider() ? [WEB_SEARCH_TOOL, READ_WEB_PAGE_TOOL] : [])];
}

export const RESEARCH_TOOL_STATUS: Record<string, string> = {
  web_search: "Buscando en internet…",
  read_web_page: "Leyendo la página…",
  read_project_document: "Leyendo el documento…",
  analyze_table_data: "Calculando sobre los datos…",
};

const PART_CHARS = 10_000;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function findDocument(docs: ProjectKnowledgeDocument[], wanted: string): ProjectKnowledgeDocument | null {
  const w = fold(wanted);
  const byId = docs.find((d) => d.id === wanted);
  if (byId) return byId;
  const exact = docs.find((d) => fold(d.title) === w || fold(d.filename) === w || fold(d.filename.replace(/\.[^.]+$/, "")) === w);
  if (exact) return exact;
  const partial = docs.filter((d) => fold(d.title).includes(w) || fold(d.filename).includes(w) || w.includes(fold(d.title)));
  return partial[0] ?? null;
}

const docList = (docs: ProjectKnowledgeDocument[]) =>
  docs.slice(0, 40).map((d) => ({ id: d.id, title: d.title, filename: d.filename, type: d.fileType, characters: d.content.length }));

export interface ResearchToolResult {
  summary: string;
  data: unknown;
}

export async function runResearchTool(
  d: ServiceDeps,
  projectId: string,
  name: string,
  args: Record<string, unknown>,
  deadline?: number,
): Promise<ResearchToolResult> {
  if (name === "web_search") {
    const query = str(args.query);
    if (!query) return { summary: "Falta qué buscar.", data: { error: "Indica la búsqueda en query." } };
    await enforceAiQuota(d, "web_search");
    const max = typeof args.max_results === "number" ? args.max_results : undefined;
    const { results, provider } = await webSearch(query.slice(0, 400), { maxResults: max, deadline });
    return {
      summary: `Busqué «${query}» en internet (${results.length} resultados).`,
      data: { query, provider, results, note: "Cita en la respuesta las fuentes que uses como [título](url). Si los fragmentos no alcanzan, lee la página con read_web_page." },
    };
  }

  if (name === "read_web_page") {
    const url = str(args.url);
    if (!url) return { summary: "Falta la dirección.", data: { error: "Indica la url." } };
    await enforceAiQuota(d, "web_search");
    try {
      const page = await readWebPage(url, { deadline, extractPdf: async (bytes) => (await extractPdfText(bytes)).text });
      return { summary: `Leí la página «${page.title}».`, data: page };
    } catch (e) {
      const message = e instanceof UnsafeUrlError || e instanceof Error ? e.message : "No se pudo leer la página.";
      return { summary: "No se pudo leer la página.", data: { url, error: message } };
    }
  }

  const docs = await listProjectDocuments(d, projectId);
  const wanted = str(args.document);
  if (!wanted) {
    return { summary: `El proyecto tiene ${docs.length} documentos.`, data: { documents: docList(docs) } };
  }
  const doc = findDocument(docs, wanted);
  if (!doc) {
    return { summary: `No encontré «${wanted}» en el proyecto.`, data: { error: `No hay un documento «${wanted}».`, documents: docList(docs) } };
  }

  if (name === "read_project_document") {
    const parts = Math.max(1, Math.ceil(doc.content.length / PART_CHARS));
    const part = Math.min(Math.max(Math.floor(typeof args.part === "number" ? args.part : 1), 1), parts);
    return {
      summary: `Leí «${doc.title}»${parts > 1 ? ` (parte ${part} de ${parts})` : ""}.`,
      data: { id: doc.id, title: doc.title, filename: doc.filename, part, parts, content: doc.content.slice((part - 1) * PART_CHARS, part * PART_CHARS) },
    };
  }

  // analyze_table_data
  let tables = parseMarkdownTables(doc.content);
  // Un CSV guardado tal cual (antes de que se convirtieran a tabla) también sirve.
  if (tables.length === 0 && doc.fileType === "csv") {
    const t = tableFromRows(doc.title, parseCsv(doc.content));
    if (t) tables = [t];
  }
  if (tables.length === 0) {
    return { summary: `«${doc.title}» no tiene tablas.`, data: { error: `«${doc.title}» no tiene tablas de datos. Sube el Excel o CSV original para calcular sobre él.` } };
  }
  const table = pickTable(tables, str(args.sheet));
  if (!table) {
    return { summary: "No encontré esa hoja.", data: { error: `No hay una hoja «${String(args.sheet)}».`, sheets: tables.map((t) => t.name) } };
  }
  const sheets = tables.length > 1 ? { sheets: tables.map((t) => t.name) } : {};
  if (args.operation !== "aggregate") {
    return { summary: `Revisé la tabla «${table.name}» de «${doc.title}».`, data: { document: doc.title, ...sheets, ...describeTable(table) } };
  }
  const filters: TableFilter[] = Array.isArray(args.filters)
    ? (args.filters as Array<Record<string, unknown>>)
        .filter((f) => f && typeof f.column === "string" && f.value !== undefined)
        .map((f) => ({ column: String(f.column), op: typeof f.op === "string" ? (f.op as TableFilter["op"]) : undefined, value: f.value as string | number }))
    : [];
  try {
    const result = aggregateTable(table, {
      metric: str(args.metric),
      groupBy: str(args.group_by),
      aggregation: typeof args.aggregation === "string" ? (args.aggregation as Aggregation) : undefined,
      filters,
      limit: typeof args.limit === "number" ? args.limit : undefined,
    });
    return { summary: `Calculé sobre «${table.name}» de «${doc.title}».`, data: { document: doc.title, ...sheets, ...result } };
  } catch (e) {
    return { summary: "No se pudo calcular.", data: { error: e instanceof Error ? e.message : "No se pudo calcular.", columns: table.columns } };
  }
}
