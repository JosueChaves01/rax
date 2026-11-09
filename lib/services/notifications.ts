import type { Id } from "@/types/domain";
import type { Notification, NotificationKind } from "@/types/b2b";
import { assertCan } from "@/lib/authz";
import { notFound, validation } from "@/lib/errors";
import { sysRepo, type ServiceDeps } from "./base";

/**
 * Notificaciones del panel (campana). Las crea el servidor; cada persona lee y marca las suyas.
 * Dueño: Dev B (plan técnico §6.2). Dev A llama a `notify` desde inviteClient.
 *
 * Payload acordado por tipo (lo lee la campana; todo es opcional salvo lo marcado):
 * - project_invitation: { invitationId*, projectId*, projectName?, mentorName? }
 * - session_scheduled:  { projectId*, sessionId*, kind?, scheduledAt? }
 * - resource_published: { projectId*, documentId*, title? }
 * - comment_added:      { projectId*, targetType*, targetId*, authorName? }
 * - session_closed:     { projectId*, sessionId*, kind?, sessionNumber?, nextSessionId?, projectName? }
 * - session_confirmed:  { projectId*, sessionId*, clientName?, scheduledAt?, projectName? }
 * - assessment_published: { projectId*, assessmentId*, title?, projectName?, dueAt? }
 * - assessment_submitted: { projectId*, assessmentId*, submissionId*, title?, clientName?, projectName? }
 * - assessment_reviewed:  { projectId*, assessmentId*, submissionId*, title?, score?, projectName? }
 */

export const NOTIFICATION_KINDS: readonly NotificationKind[] = ["project_invitation", "resource_published", "session_scheduled", "comment_added", "session_closed", "session_confirmed", "assessment_published", "assessment_submitted", "assessment_reviewed"];

const MAX_PAYLOAD_CHARS = 4000;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * Crea una notificación para una persona. La escribe el sistema (RLS: nadie inserta notificaciones
 * desde la API): cualquier servicio puede avisarle a cualquier perfil DESPUÉS de verificar su propio
 * permiso para la acción que la origina.
 */
export async function notify(d: ServiceDeps, profileId: Id, kind: NotificationKind, payload: Record<string, unknown>): Promise<Notification> {
  if (!profileId) throw validation("Falta a quién notificar.");
  if (!NOTIFICATION_KINDS.includes(kind)) throw validation("Tipo de notificación no válido.");
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  if (JSON.stringify(body).length > MAX_PAYLOAD_CHARS) throw validation("La notificación es demasiado grande.");
  return sysRepo(d).notifications.insert({ id: d.newId("ntf"), profileId, kind, payload: body, createdAt: d.now() });
}

/** Las notificaciones de quien tiene la sesión, de la más nueva a la más vieja. */
export async function listNotifications(d: ServiceDeps, opts: { unreadOnly?: boolean; limit?: number } = {}): Promise<Notification[]> {
  assertCan(d.actor, "notification.read");
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
  const rows = await d.repo.notifications.list({ profileId: d.actor.id });
  return rows
    .filter((n) => n.profileId === d.actor.id && (!opts.unreadOnly || !n.readAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Marca una notificación propia como leída. Repetirlo no cambia la fecha de lectura. */
export async function markNotificationRead(d: ServiceDeps, id: Id): Promise<void> {
  assertCan(d.actor, "notification.read");
  const n = await d.repo.notifications.get(id);
  if (!n || n.profileId !== d.actor.id) throw notFound("Esta notificación no existe.");
  if (n.readAt) return;
  await d.repo.notifications.update(id, { readAt: d.now() });
}

/** Marca como leídas las notificaciones propias que cumplan el filtro (p. ej. las de una invitación). */
export async function markNotificationsReadWhere(
  d: ServiceDeps,
  kind: NotificationKind,
  match: (payload: Record<string, unknown>) => boolean,
): Promise<number> {
  const rows = await d.repo.notifications.list({ profileId: d.actor.id, kind });
  let n = 0;
  for (const row of rows) {
    if (row.profileId !== d.actor.id || row.readAt || !match(row.payload ?? {})) continue;
    await d.repo.notifications.update(row.id, { readAt: d.now() });
    n++;
  }
  return n;
}
