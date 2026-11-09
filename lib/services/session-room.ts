import type { Id } from "@/types/domain";
import type { ServiceDeps } from "./base";
import { pendingContract } from "./contract";

/**
 * Sala del mentor durante la sesión: notas en vivo (autosave) además de la llamada.
 * Dueño: Dev A (plan técnico §2.4). Contrato de Fase 0: todavía sin implementación.
 */

/**
 * Guarda las notas en vivo. Con `expectedUpdatedAt`, si otra pestaña guardó después lanza
 * `conflict` (control de concurrencia por live_notes_updated_at).
 */
export async function saveLiveNotes(
  d: ServiceDeps,
  sessionId: Id,
  text: string,
  expectedUpdatedAt?: string,
): Promise<{ updatedAt: string }> {
  return pendingContract("saveLiveNotes", d, sessionId, text, expectedUpdatedAt);
}
