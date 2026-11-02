/** Archivos que se pueden subir al conocimiento de un proyecto (también desde el chat). Sirve en cliente y servidor. */
export const ACCEPTED_UPLOADS = ".pdf,.docx,.xlsx,.csv,.tsv,.txt,.md,.markdown,.json";

export interface UploadedDocument {
  id: string;
  title: string;
  filename: string;
  tokenCount: number;
}

export interface ExtractedUpload {
  title: string;
  filename: string;
  kind: "pdf" | "docx" | "xlsx" | "csv" | "text";
  fileType: "markdown" | "text" | "csv" | "code" | "pdf" | "json";
  content?: string;
  detail: string;
  truncated: boolean;
}

export type UploadResult =
  | { ok: true; extracted: ExtractedUpload; document?: UploadedDocument }
  | { ok: false; error: string };

/**
 * Sube un archivo para sacar su texto. Con projectId, además queda guardado en los documentos del proyecto.
 * Los archivos de texto plano no hace falta subirlos: el navegador los lee directo.
 */
export async function uploadForText(file: File, projectId?: string): Promise<UploadResult> {
  const form = new FormData();
  form.set("archivo", file);
  if (projectId) form.set("proyecto", projectId);
  try {
    const res = await fetch("/api/documentos/extraer", { method: "POST", body: form });
    const json = (await res.json().catch(() => null)) as { error?: string; extracted?: ExtractedUpload; document?: UploadedDocument } | null;
    if (!res.ok || !json?.extracted) return { ok: false, error: json?.error ?? "No se pudo leer el archivo." };
    return { ok: true, extracted: json.extracted, document: json.document };
  } catch {
    return { ok: false, error: "No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo." };
  }
}

const KIND_LABEL: Record<ExtractedUpload["kind"], string> = { pdf: "PDF", docx: "Word", xlsx: "Excel", csv: "CSV", text: "texto" };

/** Lo que se agrega al mensaje del chat para que el agente sepa qué archivo revisar. */
export function attachmentNote(e: ExtractedUpload, documentTitle: string): string {
  return `📎 Adjunté «${documentTitle}» (${KIND_LABEL[e.kind]}, ${e.detail}${e.truncated ? ", recortado" : ""}).`;
}
