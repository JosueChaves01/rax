import type { Id } from "@/types/domain";
import type { Notification, NotificationKind } from "@/types/b2b";
import type { ServiceDeps } from "./base";
import { pendingContract } from "./contract";

/**
 * Notificaciones del panel (campana). Las crea el servidor; cada persona lee y marca las suyas.
 * Dueño: Dev B (plan técnico §6.2). Dev A llama a `notify` desde inviteClient. Contrato de Fase 0.
 */

export async function notify(
  d: ServiceDeps,
  profileId: Id,
  kind: NotificationKind,
  payload: Record<string, unknown>,
): Promise<Notification> {
  return pendingContract("notify", d, profileId, kind, payload);
}

export async function listNotifications(d: ServiceDeps, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<Notification[]> {
  return pendingContract("listNotifications", d, opts);
}

export async function markNotificationRead(d: ServiceDeps, id: Id): Promise<void> {
  return pendingContract("markNotificationRead", d, id);
}
