import "server-only";
import type { ServiceDeps } from "@/lib/services/base";
import type { Notification } from "@/types/b2b";
import { listMyInvitations, syncPendingInvitations } from "@/lib/services/invitations";
import { listNotifications } from "@/lib/services/notifications";
import { SESSION_KIND_LABEL } from "@/features/labels";
import { formatDate } from "@/shared/ui/primitives";
import type { NotificationItem } from "@/shared/ui/notification-drawer";
import type { MentorSessionKind } from "@/types/domain";

/**
 * Campana del flujo B2B: invitaciones pendientes (con Aceptar / Rechazar) y notificaciones sin leer.
 * Al cargar el panel se sincronizan las invitaciones que llegaron antes de que la persona tuviera
 * cuenta (syncPendingInvitations, idempotente). Cada parte falla por separado sin tumbar el panel.
 */
export async function loadPanelNotifications(d: ServiceDeps): Promise<NotificationItem[]> {
  try {
    await syncPendingInvitations(d);
  } catch (e) {
    console.error("[rax] no se pudieron sincronizar las invitaciones:", e instanceof Error ? e.message : e);
  }
  const [invitations, unread] = await Promise.all([
    listMyInvitations(d).catch((e) => {
      console.error("[rax] no se pudieron leer las invitaciones:", e instanceof Error ? e.message : e);
      return [];
    }),
    listNotifications(d, { unreadOnly: true }).catch((e) => {
      console.error("[rax] no se pudieron leer las notificaciones:", e instanceof Error ? e.message : e);
      return [] as Notification[];
    }),
  ]);

  const items: NotificationItem[] = invitations.map((inv) => ({
    id: `inv-${inv.id}`,
    invitationId: inv.id,
    kind: "invitation",
    title: `Invitación de ${inv.mentorName}`,
    detail: `Te invita a trabajar en «${inv.projectName}». Si aceptas, empiezas con una entrevista corta para preparar la primera sesión.`,
    timeAgo: formatDate(inv.createdAt),
    href: "/app",
  }));
  // Las invitaciones ya están arriba (pendientes de verdad); su notificación no se repite.
  for (const n of unread) {
    if (n.kind === "project_invitation") continue;
    const item = describe(n);
    if (item) items.push(item);
  }
  return items;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function describe(n: Notification): NotificationItem | null {
  const p = n.payload ?? {};
  const projectId = str(p.projectId);
  const project = str(p.projectName);
  const base = { id: `ntf-${n.id}`, notificationId: n.id, timeAgo: formatDate(n.createdAt) };
  switch (n.kind) {
    case "session_scheduled": {
      const kind = str(p.kind) as MentorSessionKind;
      const at = str(p.scheduledAt);
      return {
        ...base,
        kind: "session",
        title: `Sesión agendada${project ? ` · ${project}` : ""}`,
        detail: `${SESSION_KIND_LABEL[kind] ?? "Sesión"}${at ? ` el ${formatDate(at)}` : ""}.`,
        href: projectId ? `/app/p/${projectId}` : "/app/sesiones",
      };
    }
    case "resource_published":
      return {
        ...base,
        kind: "material",
        title: `Material nuevo${project ? ` · ${project}` : ""}`,
        detail: str(p.title) ? `Tu mentor publicó «${str(p.title)}».` : "Tu mentor publicó material nuevo.",
        href: "/app/documentos",
      };
    case "comment_added":
      return {
        ...base,
        kind: "review",
        title: `Comentario nuevo${project ? ` · ${project}` : ""}`,
        detail: str(p.authorName) ? `${str(p.authorName)} comentó.` : "Hay un comentario nuevo.",
        href: projectId ? `/app/p/${projectId}` : "/app",
      };
    default:
      return null;
  }
}
