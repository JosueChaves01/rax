import "server-only";
import type { AiUsageKind } from "@/lib/data/repository";
import { rateLimited } from "@/lib/errors";
import { sysRepo, type ServiceDeps } from "./base";

/**
 * Límite diario de uso de IA por persona. Los modelos gratis de OpenRouter y la transcripción de Groq
 * tienen un cupo compartido por toda la plataforma: sin esto, una sola persona puede agotarlo para todos.
 * Se configura por variable de entorno; 0 desactiva el límite.
 */
const DEFAULTS: Record<AiUsageKind, { env: string; fallback: number }> = {
  /** Mensajes al agente por persona y día. */
  agent_message: { env: "RAX_AI_DAILY_MESSAGES", fallback: 150 },
  /** Fragmentos de audio (~15 s) transcritos por persona y día: 720 ≈ 3 horas de llamada. */
  audio_chunk: { env: "RAX_AUDIO_DAILY_CHUNKS", fallback: 720 },
};

export function aiDailyLimit(kind: AiUsageKind): number {
  const raw = process.env[DEFAULTS[kind].env];
  const n = raw === undefined || raw.trim() === "" ? DEFAULTS[kind].fallback : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULTS[kind].fallback;
}

const MESSAGE: Record<AiUsageKind, string> = {
  agent_message: "Llegaste al límite diario de mensajes al asistente. Se renueva mañana; lo que ya conversaste quedó guardado.",
  audio_chunk: "Llegaste al límite diario de transcripción de llamadas. La llamada sigue, pero lo que se diga desde ahora no se transcribe hasta mañana.",
};

/**
 * Suma un uso y corta si se pasó del límite del día (UTC). Si la base todavía no tiene la tabla de uso
 * (migración sin aplicar) o el conteo falla, no bloquea: el límite protege el cupo, no es un permiso.
 */
export async function enforceAiQuota(d: ServiceDeps, kind: AiUsageKind, amount = 1): Promise<void> {
  const limit = aiDailyLimit(kind);
  if (limit === 0) return;
  const add = sysRepo(d).fn.addAiUsage;
  if (!add) return;
  let total: number;
  try {
    total = await add(d.actor.id, kind, d.now().slice(0, 10), amount);
  } catch (e) {
    console.warn("[ai-quota] No se pudo registrar el uso:", e instanceof Error ? e.message : e);
    return;
  }
  if (total > limit) throw rateLimited(MESSAGE[kind]);
}
