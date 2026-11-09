import type { Id, MentorSession } from "@/types/domain";
import type { CycleSignals, CycleStage, SessionTopic } from "@/types/b2b";
import type { ServiceDeps } from "./base";
import { pendingContract } from "./contract";

/**
 * Motor del ciclo: intake → kickoff (Sesión 1) → cycle (Sesión 2..n) → closed.
 * Dueño: Dev B (plan técnico §2.4). Contrato de Fase 0: todavía sin implementación.
 */

export interface ScheduleCycleSessionInput {
  kind: "kickoff" | "follow_up";
  scheduledAt: string;
  agenda: SessionTopic[];
}

export async function scheduleCycleSession(d: ServiceDeps, projectId: Id, input: ScheduleCycleSessionInput): Promise<MentorSession> {
  return pendingContract("scheduleCycleSession", d, projectId, input);
}

/** Única función que escribe projects.cycle_stage. */
export async function advanceCycleStage(d: ServiceDeps, projectId: Id, to: CycleStage): Promise<void> {
  return pendingContract("advanceCycleStage", d, projectId, to);
}

export async function updateSessionAgenda(d: ServiceDeps, sessionId: Id, agenda: SessionTopic[]): Promise<void> {
  return pendingContract("updateSessionAgenda", d, sessionId, agenda);
}

/** Lo llama `closeSession` (Dev A) al final: avanza la etapa y sugiere la próxima sesión. */
export async function onSessionClosed(d: ServiceDeps, session: MentorSession): Promise<void> {
  return pendingContract("onSessionClosed", d, session);
}

/** Comentarios nuevos y resultados de evaluaciones para el briefing de la próxima sesión (briefing-history.ts). */
export async function cycleSignalsForBriefing(d: ServiceDeps, projectId: Id, opts: { since?: string } = {}): Promise<CycleSignals> {
  return pendingContract("cycleSignalsForBriefing", d, projectId, opts);
}
