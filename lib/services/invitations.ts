import type { Id } from "@/types/domain";
import type { InvitationStatus, MyInvitation } from "@/types/b2b";
import type { ServiceDeps } from "./base";
import { pendingContract } from "./contract";

/**
 * Lado de la persona invitada: ver, aceptar o rechazar invitaciones desde el panel (sin link).
 * Dueño: Dev B (plan técnico §6.2, reemplaza a acceptInvitation(d, token)). Contrato de Fase 0.
 */

/** Invitaciones pendientes para el correo de quien tiene la sesión. */
export async function listMyInvitations(d: ServiceDeps): Promise<MyInvitation[]> {
  return pendingContract("listMyInvitations", d);
}

/** Acepta (alta como cliente del proyecto) o rechaza una invitación pendiente. */
export async function respondInvitation(
  d: ServiceDeps,
  invitationId: Id,
  accept: boolean,
): Promise<{ projectId: Id; status: InvitationStatus }> {
  return pendingContract("respondInvitation", d, invitationId, accept);
}

/**
 * Al iniciar sesión: crea las notificaciones de invitaciones pendientes que llegaron antes de que
 * la persona tuviera cuenta. Devuelve cuántas notificaciones creó.
 */
export async function syncPendingInvitations(d: ServiceDeps): Promise<number> {
  return pendingContract("syncPendingInvitations", d);
}
