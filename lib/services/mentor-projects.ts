import type { Id, Project } from "@/types/domain";
import type { ProjectInvitation, ProjectMode } from "@/types/b2b";
import type { ServiceDeps } from "./base";
import { pendingContract } from "./contract";

/**
 * Proyectos que crea el mentor e invitaciones que envía (por correo, se aceptan desde el panel).
 * Dueño: Dev A (plan técnico §2.4 y §6.2). Contrato de Fase 0: todavía sin implementación.
 */

export interface CreateProjectAsMentorInput {
  name: string;
  description: string;
  mode: ProjectMode;
  clientEmails: string[];
}

export async function createProjectAsMentor(
  d: ServiceDeps,
  input: CreateProjectAsMentorInput,
): Promise<{ project: Project; invitations: ProjectInvitation[] }> {
  return pendingContract("createProjectAsMentor", d, input);
}

/**
 * Invita a una persona por correo. Si ya tiene cuenta se le notifica al instante (`notify` de
 * notifications.ts); si no, la notificación se crea cuando entra (`syncPendingInvitations`).
 */
export async function inviteClient(
  d: ServiceDeps,
  projectId: Id,
  email: string,
): Promise<{ invitation: ProjectInvitation; notified: boolean }> {
  return pendingContract("inviteClient", d, projectId, email);
}

export async function revokeInvitation(d: ServiceDeps, invitationId: Id): Promise<void> {
  return pendingContract("revokeInvitation", d, invitationId);
}

/** «Contexto faltante» que completa el mentor al revisar el brief (projects.client_context). */
export async function setClientContext(d: ServiceDeps, projectId: Id, text: string): Promise<void> {
  return pendingContract("setClientContext", d, projectId, text);
}

/** Único punto donde Dev A escribe el estado del intake: lo marca como revisado. */
export async function markIntakeReviewed(d: ServiceDeps, projectId: Id, clientId?: Id): Promise<void> {
  return pendingContract("markIntakeReviewed", d, projectId, clientId);
}
