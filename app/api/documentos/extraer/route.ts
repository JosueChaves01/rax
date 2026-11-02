import type { NextRequest } from "next/server";
import { getDeps } from "@/lib/runtime";
import { isDomainError } from "@/lib/errors";
import { ExtractionError, MAX_UPLOAD_BYTES, extractUploadedFile } from "@/lib/documents/extract";
import { addProjectDocument } from "@/lib/services/project-knowledge";
import { guard } from "@/lib/services/base";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sube un archivo (PDF, Word, Excel, CSV o texto) y devuelve su texto en Markdown.
 * Con el campo «proyecto», además lo guarda en el conocimiento de ese proyecto (lo que usa el adjunto del chat);
 * sin él solo extrae, y el formulario que lo pidió decide si guardarlo.
 */
export async function POST(req: NextRequest) {
  const d = await getDeps();
  if (!d) return Response.json({ error: "Tu sesión terminó. Vuelve a entrar." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("archivo");
  if (!form || !(file instanceof File)) return Response.json({ error: "Falta el archivo." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "El archivo pesa más de 10 MB." }, { status: 413 });
  const projectId = typeof form.get("proyecto") === "string" ? String(form.get("proyecto")) : "";

  try {
    // Antes de leer el archivo, se confirma que la persona tiene acceso al proyecto.
    if (projectId) await guard(d, projectId, "project.read");
    const extracted = await extractUploadedFile(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    if (!projectId) return Response.json({ extracted });
    const doc = await addProjectDocument(d, projectId, {
      title: extracted.title,
      filename: extracted.filename,
      content: extracted.content,
      fileType: extracted.fileType,
      source: "upload",
    });
    return Response.json({
      extracted: { ...extracted, content: undefined },
      document: { id: doc.id, title: doc.title, filename: doc.filename, tokenCount: doc.tokenCount },
    });
  } catch (e) {
    if (e instanceof ExtractionError) return Response.json({ error: e.message }, { status: 422 });
    if (isDomainError(e)) {
      const status = e.code === "not_found" ? 404 : e.code === "forbidden" ? 403 : 400;
      return Response.json({ error: e.message }, { status });
    }
    console.error("[documentos/extraer] No se pudo leer el archivo:", e instanceof Error ? e.message : e);
    return Response.json({ error: "No se pudo leer el archivo." }, { status: 500 });
  }
}
