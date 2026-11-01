import { renderDocx } from "./render-docx";
import { renderPdf } from "./render-pdf";
import { DOCUMENT_MIME, documentSlug, type DocumentFormat, type DocumentSource } from "./types";

export * from "./types";

/** Archivo listo para descargar en el formato pedido. */
export async function renderDocument(source: DocumentSource, format: DocumentFormat): Promise<{ body: Buffer; mime: string; filename: string }> {
  const body = format === "pdf" ? await renderPdf(source) : await renderDocx(source);
  return { body, mime: DOCUMENT_MIME[format], filename: `${documentSlug(source.title)}.${format}` };
}
