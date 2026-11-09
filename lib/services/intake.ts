import type { Id } from "@/types/domain";
import type { IntakeBrief, IntakeState } from "@/types/b2b";
import type { ServiceDeps } from "./base";
import { pendingContract } from "./contract";

/**
 * Entrevista de intake guiada por la guía del mentor y brief para la Sesión 1.
 * Dueño: Dev B (plan técnico §2.4 y §6.1). Contrato de Fase 0: todavía sin implementación.
 */

/**
 * Estado del intake de una persona del proyecto (por defecto, quien tiene la sesión). El brief solo
 * se incluye si quien consulta es el mentor.
 */
export async function getIntakeState(d: ServiceDeps, projectId: Id, clientId?: Id): Promise<IntakeState> {
  return pendingContract("getIntakeState", d, projectId, clientId);
}

export async function runIntakeTurn(d: ServiceDeps, projectId: Id, message: string): Promise<{ reply: string; state: IntakeState }> {
  return pendingContract("runIntakeTurn", d, projectId, message);
}

/** Genera el brief, deja el intake en `submitted` y crea la sesión kickoff pendiente. */
export async function submitIntake(d: ServiceDeps, projectId: Id): Promise<IntakeBrief> {
  return pendingContract("submitIntake", d, projectId);
}

/** Proyectos grupales: brief consolidado (fila con client_id vacío) a partir de los individuales. */
export async function buildGroupBrief(d: ServiceDeps, projectId: Id): Promise<IntakeBrief> {
  return pendingContract("buildGroupBrief", d, projectId);
}
