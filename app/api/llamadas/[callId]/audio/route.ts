import { NextResponse, type NextRequest } from "next/server";
import { getDeps } from "@/lib/runtime";
import { isDomainError } from "@/lib/errors";
import { TranscriptionUnavailableError } from "@/lib/ai/transcription";
import { transcribeCallAudio } from "@/lib/services/session-calls";
import * as V from "@/lib/validation/inputs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav" };

/**
 * Recibe un trozo (unos 15 s) del micrófono de quien llama, lo transcribe con Groq Whisper y lo
 * guarda en la llamada. Cuerpo multipart: audio (archivo) y offsetMs (ms desde que empezó la llamada).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ callId: string }> }) {
  const d = await getDeps();
  if (!d) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  try {
    const { callId } = await ctx.params;
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) return NextResponse.json({ error: "Falta el audio." }, { status: 400 });
    const offsetMs = Number(form.get("offsetMs") ?? 0);
    const base = (audio.type || "audio/webm").split(";")[0];
    const segment = await transcribeCallAudio(
      d,
      V.parse(V.Ids, callId),
      { data: audio, filename: `fragmento.${EXT[base] ?? "webm"}` },
      Number.isFinite(offsetMs) ? offsetMs : 0,
    );
    return NextResponse.json({ segment: segment ? { ...segment, speakerName: d.actor.name } : null });
  } catch (e) {
    if (e instanceof TranscriptionUnavailableError) return NextResponse.json({ error: e.message, code: "transcription_unavailable" }, { status: 503 });
    if (isDomainError(e)) {
      const status = e.code === "not_found" ? 404 : e.code === "forbidden" ? 403 : 400;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("[llamadas] No se pudo transcribir el fragmento:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "No se pudo transcribir este fragmento." }, { status: 502 });
  }
}
