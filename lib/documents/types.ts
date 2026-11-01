export type DocumentFormat = "pdf" | "docx";

export const DOCUMENT_FORMATS: DocumentFormat[] = ["pdf", "docx"];

export const DOCUMENT_MIME: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const DOCUMENT_FORMAT_LABEL: Record<DocumentFormat, string> = { pdf: "PDF", docx: "Word" };

/** Lo que hace falta para armar el archivo: el contenido vive en Markdown y el formato se elige al bajarlo. */
export interface DocumentSource {
  title: string;
  subtitle?: string;
  content: string;
}

export const isDocumentFormat = (v: unknown): v is DocumentFormat => v === "pdf" || v === "docx";

/** Nombre de archivo seguro a partir del título («Plan de estudio: SQL» → «plan-de-estudio-sql»). */
export function documentSlug(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "documento";
}
