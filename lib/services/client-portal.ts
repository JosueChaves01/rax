import type { Comment, Id, MentorSession, Project } from "@/types/domain";
import type { ClientHome, ClientProjectCard, PublishedResource } from "@/types/b2b";
import { assertCan } from "@/lib/authz";
import { sysRepo, type ServiceDeps } from "./base";
import { pendingContract } from "./contract";
import { listMyInvitations } from "./invitations";
import { listNotifications } from "./notifications";

/**
 * Portal del cliente: material publicado, comentarios e inicio.
 * Dueño: Dev B (plan técnico §2.4).
 */

/** Material publicado para quien consulta (todo el grupo o esa persona). */
export async function listPublishedResources(d: ServiceDeps, projectId: Id): Promise<PublishedResource[]> {
  return pendingContract("listPublishedResources", d, projectId);
}

export async function commentOnResource(
  d: ServiceDeps,
  target: { type: "document" | "session"; id: Id },
  body: string,
): Promise<Comment> {
  return pendingContract("commentOnResource", d, target, body);
}

/**
 * «Material nuevo» mientras no exista registro de lectura por persona: lo publicado para la persona
 * (o para todo el grupo) en los últimos 7 días.
 */
export const NEW_RESOURCE_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

/** Próxima sesión: la agendada más cercana; si ninguna tiene fecha, la pendiente por agendar. */
export function nextSessionOf(sessions: MentorSession[]): MentorSession | undefined {
  const open = sessions.filter((s) => s.status !== "completed");
  const dated = open.filter((s) => s.scheduledAt).sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const live = open.find((s) => s.status === "in_progress");
  return live ?? dated[0] ?? open.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
}

async function projectCard(d: ServiceDeps, project: Project): Promise<ClientProjectCard> {
  const sys = sysRepo(d);
  const [mentor, briefs, sessions, docs] = await Promise.all([
    project.mentorId ? sys.profiles.get(project.mentorId) : Promise.resolve(undefined),
    sys.intakeBriefs.list({ projectId: project.id, clientId: d.actor.id }),
    sys.mentorSessions.list({ projectId: project.id }),
    sys.projectDocuments.list({ projectId: project.id }),
  ]);
  const since = new Date(Date.parse(d.now()) - NEW_RESOURCE_WINDOW_DAYS * DAY_MS).toISOString();
  const newResources = docs.filter(
    (doc) =>
      doc.visibility === "published" &&
      (!doc.audienceClientId || doc.audienceClientId === d.actor.id) &&
      !!doc.publishedAt &&
      doc.publishedAt >= since,
  ).length;
  const next = nextSessionOf(sessions);
  const mine = briefs.find((b) => b.clientId === d.actor.id);
  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      mode: project.mode ?? "individual",
      cycleStage: project.cycleStage ?? "intake",
    },
    mentorName: mentor?.name || "Tu mentor",
    intakeStatus: mine?.status ?? "not_started",
    ...(next
      ? {
          nextSession: {
            id: next.id,
            kind: next.kind,
            status: next.status,
            ...(next.scheduledAt ? { scheduledAt: next.scheduledAt } : {}),
            ...(next.confirmedAt ? { confirmedAt: next.confirmedAt } : {}),
          },
        }
      : {}),
    newResources,
  };
}

/**
 * Inicio de la persona cliente: sus proyectos (con etapa, estado de su entrevista, próxima sesión y
 * material nuevo), invitaciones pendientes y notificaciones sin leer. Solo proyectos donde es miembro
 * `client`; lo demás (intake, sesiones, documentos) se lee con el repositorio del sistema DESPUÉS de
 * comprobar esa membresía, y nunca incluye el brief ni material sin publicar.
 */
export async function getClientHome(d: ServiceDeps): Promise<ClientHome> {
  assertCan(d.actor, "invitation.respond");
  const memberships = (await sysRepo(d).projectMembers.list({ profileId: d.actor.id, role: "client" })).filter((m) => m.profileId === d.actor.id && m.role === "client");
  const projects = (await Promise.all(memberships.map((m) => sysRepo(d).projects.get(m.projectId)))).filter((p): p is Project => !!p);
  const [cards, invitations, unread] = await Promise.all([
    Promise.all(projects.map((p) => projectCard(d, p))),
    listMyInvitations(d),
    listNotifications(d, { unreadOnly: true, limit: 100 }),
  ]);
  const byActivity = projects.reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.id]: p.updatedAt }), {});
  cards.sort((a, b) => (byActivity[b.project.id] ?? "").localeCompare(byActivity[a.project.id] ?? ""));
  return { projects: cards, invitations, unreadNotifications: unread.length };
}
