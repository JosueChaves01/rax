import type { Id } from "@/types/domain";
import type { MentorProfile } from "@/types/b2b";
import type { ServiceDeps } from "./base";
import { pendingContract } from "./contract";

/**
 * Perfil del mentor: presentación, metodología, guía de entrevista de intake y tono del asistente.
 * Dueño: Dev A (plan técnico §2.4). Contrato de Fase 0: todavía sin implementación.
 */

export type MentorProfileInput = Partial<Omit<MentorProfile, "mentorId" | "updatedAt">>;

/** Perfil del mentor indicado o, sin `mentorId`, el de quien tiene la sesión. */
export async function getMentorProfile(d: ServiceDeps, mentorId?: Id): Promise<MentorProfile> {
  return pendingContract("getMentorProfile", d, mentorId);
}

/** Guarda los cambios del perfil del mentor que tiene la sesión. */
export async function saveMentorProfile(d: ServiceDeps, input: MentorProfileInput): Promise<MentorProfile> {
  return pendingContract("saveMentorProfile", d, input);
}
