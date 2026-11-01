import type { SessionCallSegment } from "@/types/domain";
import type { ServiceDeps } from "./base";

/** Utilidades de transcripción compartidas por las llamadas y la síntesis pos-sesión. */

const MAX_TRANSCRIPT_FOR_AI = 24_000;

export async function names(d: ServiceDeps, ids: string[]) {
  const out = new Map<string, string>();
  for (const id of new Set(ids)) {
    const p = await d.repo.profiles.get(id).catch(() => undefined);
    if (p) out.set(id, p.name);
  }
  return out;
}

export const bySpeech = (a: SessionCallSegment, b: SessionCallSegment) => a.offsetMs - b.offsetMs || a.createdAt.localeCompare(b.createdAt);

const clock = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

/** Texto de la transcripción, una línea por fragmento: «[mm:ss] Nombre: texto». */
export function transcriptLines(segments: SessionCallSegment[], speakerName: (id: string) => string): string[] {
  return [...segments].sort(bySpeech).map((s) => `[${clock(s.offsetMs)}] ${speakerName(s.speakerId)}: ${s.body}`);
}

/**
 * Transcripción de las llamadas terminadas de una sesión, para la síntesis pos-sesión.
 * Si la migración de llamadas no está aplicada devuelve vacío (la síntesis sigue con las notas).
 */
export async function sessionTranscriptForAi(d: ServiceDeps, sessionId: string): Promise<string | undefined> {
  try {
    const calls = (await d.repo.sessionCalls.list({ sessionId })).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const parts: string[] = [];
    for (const c of calls) {
      const segments = await d.repo.sessionCallSegments.list({ callId: c.id });
      if (!segments.length) continue;
      const people = await names(d, segments.map((s) => s.speakerId));
      parts.push(transcriptLines(segments, (id) => people.get(id) ?? "Otra persona").join("\n"));
    }
    const text = parts.join("\n\n— nueva llamada —\n\n").trim();
    if (!text) return undefined;
    // Para modelos gratuitos con contexto corto: se conserva el comienzo y, sobre todo, el cierre (acuerdos).
    if (text.length <= MAX_TRANSCRIPT_FOR_AI) return text;
    const head = text.slice(0, MAX_TRANSCRIPT_FOR_AI * 0.3);
    const tail = text.slice(-MAX_TRANSCRIPT_FOR_AI * 0.7);
    return `${head}\n[… parte central omitida por longitud …]\n${tail}`;
  } catch (err) {
    console.warn("[session-calls] No se pudo leer la transcripción de la sesión:", err instanceof Error ? err.message : err);
    return undefined;
  }
}

