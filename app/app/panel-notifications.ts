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
    case "session_closed": {
      const n = typeof p.sessionNumber === "number" ? p.sessionNumber : undefined;
      return {
        ...base,
        kind: "session",
        title: `${n ? `Sesión ${n} cerrada` : "Sesión cerrada"}${project ? ` · ${project}` : ""}`,
        detail: "Tu mentor cerró la sesión. Revisa el resumen, tus compromisos y los temas de la próxima.",
        href: projectId ? `/app/p/${projectId}/sesiones` : "/app/sesiones",
      };
    }
    case "session_confirmed": {
      const at = str(p.scheduledAt);
      return {
        ...base,
        kind: "session",
        title: `Asistencia confirmada${project ? ` · ${project}` : ""}`,
        detail: `${str(p.clientName) || "Tu cliente"} confirmó que asistirá${at ? ` el ${formatDate(at)}` : ""}.`,
        href: projectId ? `/app/p/${projectId}/sesiones` : "/app/sesiones",
      };
    }
    case "resource_published":
      return {
        ...base,
        kind: "material",
        title: `Material nuevo${project ? ` · ${project}` : ""}`,
        detail: str(p.title) ? `Tu mentor publicó «${str(p.title)}».` : "Tu mentor publicó material nuevo.",
        href: projectId ? `/app/p/${projectId}/material` : "/app/documentos",
      };
    case "comment_added":
      return {
        ...base,
        kind: "review",
        title: `Comentario nuevo${project ? ` · ${project}` : ""}`,
        detail: `${str(p.authorName) || "Alguien"} comentó${str(p.title) ? ` «${str(p.title)}»` : ""}.`,
        href: projectId ? `/app/p/${projectId}/material` : "/app",
      };
    case "assessment_published": {
      const due = str(p.dueAt);
      return {
        ...base,
        kind: "task",
        title: `Evaluación nueva${project ? ` · ${project}` : ""}`,
        detail: `Tu mentor publicó «${str(p.title) || "una evaluación"}»${due ? `; respóndela antes del ${formatDate(due)}` : ""}.`,
        href: projectId && str(p.assessmentId) ? `/app/p/${projectId}/evaluaciones/${str(p.assessmentId)}` : "/app",
      };
    }
    case "assessment_submitted":
      return {
        ...base,
        kind: "review",
        title: `Evaluación respondida${project ? ` · ${project}` : ""}`,
        detail: `${str(p.clientName) || "Tu cliente"} respondió «${str(p.title) || "la evaluación"}». Revísala y déjale tu comentario.`,
        href: projectId && str(p.assessmentId) ? `/app/p/${projectId}/evaluaciones/${str(p.assessmentId)}` : "/app",
      };
    case "assessment_reviewed":
      return {
        ...base,
        kind: "review",
        title: `Evaluación revisada${project ? ` · ${project}` : ""}`,
        detail: `Tu mentor revisó «${str(p.title) || "tu evaluación"}»${typeof p.score === "number" ? `: ${p.score} pts` : ""}.`,
        href: projectId && str(p.assessmentId) ? `/app/p/${projectId}/evaluaciones/${str(p.assessmentId)}` : "/app",
      };
    default:
      return null;
  }
}
