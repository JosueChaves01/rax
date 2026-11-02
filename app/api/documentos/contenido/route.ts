import { NextResponse, type NextRequest } from "next/server";
import { getDeps } from "@/lib/runtime";
import { isDomainError } from "@/lib/errors";
import { documentSourceFromQuery } from "../source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contenido de un documento para verlo dentro de la app (mismos parámetros que /api/documentos, sin formato).
 * El visor lo muestra como texto con formato o, si viene de un Excel o CSV, como tablas.
 */
export async function GET(req: NextRequest) {
  const d = await getDeps();
  if (!d) return NextResponse.json({ error: "Inicia sesión para ver el documento." }, { status: 401 });
  try {
    const source = await documentSourceFromQuery(d, req.nextUrl.searchParams);
    if (!source) return NextResponse.json({ error: "Falta indicar qué documento ver." }, { status: 400 });
    return NextResponse.json(
      { title: source.title, subtitle: source.subtitle ?? null, content: source.content, fileType: source.fileType ?? "markdown", filename: source.filename ?? null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    if (isDomainError(e)) {
      const status = e.code === "not_found" ? 404 : e.code === "forbidden" ? 403 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    console.error("[documentos/contenido] No se pudo leer el documento:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo abrir el documento." }, { status: 500 });
  }
}
