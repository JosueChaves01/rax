import { NextResponse, type NextRequest } from "next/server";
import { getDeps } from "@/lib/runtime";
import { isDomainError } from "@/lib/errors";
import { renderDocument } from "@/lib/documents";
import { isDocumentFormat } from "@/lib/documents/types";
import { documentSourceFromQuery } from "./source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Descarga de documentos en PDF o Word, armados al momento a partir de su contenido:
 * - del agente: ?mensaje=<id>&artefacto=<id>&formato=pdf|docx
 * - del conocimiento del proyecto: ?proyecto=<id>&documento=<id>&formato=pdf|docx
 * - de la biblioteca metodológica: ?recurso=<id>&formato=pdf|docx
 * Con «ver=1» el PDF se abre en el navegador (el visor lo muestra en un iframe) en vez de descargarse.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const format = q.get("formato") ?? "pdf";
  if (!isDocumentFormat(format)) return NextResponse.json({ error: "Formato no válido: usa pdf o docx." }, { status: 400 });

  const d = await getDeps();
  if (!d) return NextResponse.json({ error: "Inicia sesión para descargar el documento." }, { status: 401 });

  try {
    const source = await documentSourceFromQuery(d, q);
    if (!source) return NextResponse.json({ error: "Falta indicar qué documento descargar." }, { status: 400 });

    const file = await renderDocument(source, format);
    return new NextResponse(new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `${q.get("ver") === "1" ? "inline" : "attachment"}; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    if (isDomainError(e)) {
      const status = e.code === "not_found" ? 404 : e.code === "forbidden" ? 403 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    console.error("[documentos] No se pudo generar el archivo:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo generar el archivo." }, { status: 500 });
  }
}
