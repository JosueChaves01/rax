import type { Comment, Id, MentorSession, Project, ProjectKnowledgeDocument } from "@/types/domain";
import type { ClientHome, ClientProjectCard, PublishedResource } from "@/types/b2b";
import type { DocumentSource } from "@/lib/documents/types";
import { assertCan, can } from "@/lib/authz";
import { notFound, validation } from "@/lib/errors";
import { getKnowledgeContext, type KnowledgeContextResult } from "@/lib/ai/knowledge-retrieval";
import { audit, relationOf, sysRepo, type ServiceDeps } from "./base";
import { listMyInvitations } from "./invitations";
import { listNotifications, notify } from "./notifications";

/**
 * Portal del cliente: material publicado, comentarios e inicio.
 * Dueño: Dev B (plan técnico §2.4).
 */

/* ───────────── Material publicado ───────────── */

type ResourceViewer = "mentor" | "client";

/**
 * Quién mira el material del proyecto: el mentor del proyecto o una persona cliente. Igual que RLS,
 * cualquier otra persona recibe «no existe» (y queda registro del intento).
 */
async function resourceAccess(d: ServiceDeps, projectId: Id): Promise<{ project: Project; viewer: ResourceViewer }> {
  const project = await sysRepo(d).projects.get(projectId);
  const rel = await relationOf(d, projectId);
  const viewer: ResourceViewer | null =
    project?.mentorId && rel.isProjectMentor && can(d.actor, "resource.read", rel)
      ? "mentor"
      : project?.mentorId && rel.isClient && can(d.actor, "resource.read", rel)
        ? "client"
        : null;
  if (!project || !viewer) {
    if (project) await audit(d, "access.denied", { projectId, meta: { action: "resource.read" } });
    throw notFound("Este proyecto no existe o no tienes acceso.");
  }
  return { project, viewer };
}

/** Si la persona puede ver este documento como material: publicado, vigente y para ella o para todo el grupo. */
export function isVisiblePublished(doc: ProjectKnowledgeDocument, viewer: ResourceViewer, actorId: Id): boolean {
  if (doc.visibility !== "published" || doc.content === "") return false;
  return viewer === "mentor" || !doc.audienceClientId || doc.audienceClientId === actorId;
}

/** Documentos publicados que quien consulta puede ver (leídos por el sistema después de la verificación). */
async function visibleDocuments(d: ServiceDeps, projectId: Id, viewer: ResourceViewer): Promise<ProjectKnowledgeDocument[]> {
  const docs = await sysRepo(d).projectDocuments.list({ projectId });
  return docs.filter((doc) => doc.projectId === projectId && isVisiblePublished(doc, viewer, d.actor.id));
}

const toResource = (doc: ProjectKnowledgeDocument, commentCount: number): PublishedResource => ({
  documentId: doc.id,
  projectId: doc.projectId,
  title: doc.title || doc.filename,
  docKind: doc.docKind ?? "material",
  ...(doc.mentorSessionId ? { sessionId: doc.mentorSessionId } : {}),
  ...(doc.audienceClientId ? { audienceClientId: doc.audienceClientId } : {}),
  publishedAt: doc.publishedAt ?? doc.updatedAt,
  commentCount,
});

/**
 * Material publicado para quien consulta: la persona cliente ve lo publicado para todo el grupo o
 * para ella; el mentor ve todo lo publicado. Cada recurso trae cuántos comentarios ve esa persona.
 * Del más nuevo al más viejo. Nunca incluye documentos «solo mentor».
 */
export async function listPublishedResources(d: ServiceDeps, projectId: Id): Promise<PublishedResource[]> {
  const { project, viewer } = await resourceAccess(d, projectId);
  const [docs, comments] = await Promise.all([visibleDocuments(d, projectId, viewer), sysRepo(d).comments.list({ projectId })]);
  const visible = visibleComments(project, viewer, d.actor.id, comments);
  return docs
    .map((doc) => toResource(doc, visible.filter((c) => c.targetType === "document" && c.targetId === doc.id).length))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export interface PublishedResourceContent {
  resource: PublishedResource;
  content: string;
  fileType: ProjectKnowledgeDocument["fileType"];
  filename: string;
  project: Project;
}

/** Un documento publicado con su contenido, para el visor y las herramientas del asistente del cliente. */
export async function getPublishedResource(d: ServiceDeps, projectId: Id, documentId: Id): Promise<PublishedResourceContent> {
  const { project, viewer } = await resourceAccess(d, projectId);
  const doc = await sysRepo(d).projectDocuments.get(documentId);
  if (!doc || doc.projectId !== projectId || !isVisiblePublished(doc, viewer, d.actor.id)) throw notFound("Este material no existe o no está publicado.");
  return { resource: toResource(doc, 0), content: doc.content, fileType: doc.fileType, filename: doc.filename, project };
}

/**
 * Fuente para /api/documentos (visor y descarga) cuando quien pide es una persona cliente: solo
 * documentos publicados para ella o para todo el grupo. El mentor sigue por documentFromProject.
 */
export async function publishedDocumentSource(d: ServiceDeps, projectId: Id, documentId: Id): Promise<DocumentSource> {
  const { resource, content, fileType, filename, project } = await getPublishedResource(d, projectId, documentId);
  return { title: resource.title, subtitle: `${project.name} · Publicado el ${resource.publishedAt.slice(0, 10)}`, content, fileType, filename };
}

/**
 * Conocimiento del proyecto para un turno del asistente de una persona cliente: el mismo motor
 * (documentos completos o fragmentos) pero SOLO con el material publicado para ella. Los fragmentos
 * de documentos «solo mentor» quedan fuera aunque la búsqueda de la base los devuelva.
 */
export async function publishedKnowledgeContext(d: ServiceDeps, projectId: Id, query: string): Promise<KnowledgeContextResult> {
  const { viewer } = await resourceAccess(d, projectId);
  const sys = sysRepo(d);
  const docs = await visibleDocuments(d, projectId, viewer);
  const ids = new Set(docs.map((doc) => doc.id));
  return getKnowledgeContext(
    {
      documents: async () => docs,
      chunks: async () => (await sys.projectDocumentChunks.list({ projectId })).filter((c) => ids.has(c.documentId)),
      latestChunks: async (limit) => (await sys.projectDocumentChunks.latest({ projectId }, limit * 4)).filter((c) => ids.has(c.documentId)).slice(0, limit),
      search: async (q, limit) => {
        if (!sys.fn.searchChunks) return null;
        return (await sys.fn.searchChunks(projectId, q, limit * 4)).filter((r) => ids.has(r.chunk.documentId)).slice(0, limit);
      },
    },
    query,
  );
}

/* ───────────── Comentarios sobre material y sesiones ───────────── */

export const MAX_COMMENT_CHARS = 2000;

export interface ResourceComment {
  id: Id;
  authorId: Id;
  authorName: string;
  authorRole: "mentor" | "client";
  body: string;
  createdAt: string;
  mine: boolean;
}

/**
 * Comentarios que ve cada quien (plan §6.1): en un proyecto grupal, los de todo el grupo; en uno
 * individual, los de la persona y el mentor. El mentor ve todos.
 */
function visibleComments(project: Project, viewer: ResourceViewer, actorId: Id, comments: Comment[]): Comment[] {
  const onResources = comments.filter((c) => c.projectId === project.id && (c.targetType === "document" || c.targetType === "session"));
  if (viewer === "mentor" || project.mode === "group") return onResources;
  return onResources.filter((c) => c.authorId === actorId || c.authorId === project.mentorId);
}

type ResourceTarget = { type: "document" | "session"; id: Id };

/** Verifica que el objetivo exista en el proyecto y que quien comenta lo pueda ver. */
async function resolveTarget(d: ServiceDeps, target: ResourceTarget): Promise<{ project: Project; viewer: ResourceViewer; title: string; audienceClientId?: Id }> {
  const sys = sysRepo(d);
  if (target?.type === "document") {
    const doc = await sys.projectDocuments.get(target.id);
    if (!doc) throw notFound("Este material no existe o no está publicado.");
    const access = await resourceAccess(d, doc.projectId);
    if (!isVisiblePublished(doc, access.viewer, d.actor.id)) throw notFound("Este material no existe o no está publicado.");
    return { ...access, title: doc.title || doc.filename, ...(doc.audienceClientId ? { audienceClientId: doc.audienceClientId } : {}) };
  }
  if (target?.type === "session") {
    const session = await sys.mentorSessions.get(target.id);
    if (!session) throw notFound("Esta sesión no existe o no tienes acceso.");
    const access = await resourceAccess(d, session.projectId);
    return { ...access, title: session.sessionNumber ? `Sesión ${session.sessionNumber}` : "Sesión" };
  }
  throw validation("Solo se comenta material publicado o una sesión.");
}

async function commentViews(d: ServiceDeps, rows: Comment[], mentorId?: Id): Promise<ResourceComment[]> {
  const names = new Map<Id, string>();
  await Promise.all(
    [...new Set(rows.map((c) => c.authorId))].map(async (id) => {
      const p = await sysRepo(d).profiles.get(id).catch(() => undefined);
      names.set(id, p?.name || "Persona");
    }),
  );
  return [...rows]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((c) => ({
      id: c.id,
      authorId: c.authorId,
      authorName: c.authorId === d.actor.id ? "Tú" : (names.get(c.authorId) ?? "Persona"),
      authorRole: c.authorId === mentorId ? ("mentor" as const) : ("client" as const),
      body: c.body,
      createdAt: c.createdAt,
      mine: c.authorId === d.actor.id,
    }));
}

/** Comentarios de un material publicado o de una sesión, del más viejo al más nuevo. */
export async function listResourceComments(d: ServiceDeps, target: ResourceTarget): Promise<ResourceComment[]> {
  const { project, viewer } = await resolveTarget(d, target);
  const rows = (await sysRepo(d).comments.list({ projectId: project.id, targetId: target.id })).filter((c) => c.targetType === target.type && c.targetId === target.id);
  return commentViews(d, visibleComments(project, viewer, d.actor.id, rows), project.mentorId);
}

/**
 * Comenta material publicado o una sesión (persona cliente o mentor). Avisa con `comment_added`: si
 * comenta una persona cliente, al mentor (y en un proyecto grupal, al resto del grupo que ve el
 * material); si comenta el mentor, a las personas cliente que ven el material.
 */
export async function commentOnResource(d: ServiceDeps, target: ResourceTarget, body: string): Promise<Comment> {
  const text = (body ?? "").trim();
  if (!text) throw validation("Escribe tu comentario.");
  if (text.length > MAX_COMMENT_CHARS) throw validation(`El comentario admite hasta ${MAX_COMMENT_CHARS} caracteres.`);
  const { project, viewer, title, audienceClientId } = await resolveTarget(d, target);
  assertCan(d.actor, "resource.comment", await relationOf(d, project.id));
  const sys = sysRepo(d);
  const comment = await sys.comments.insert({
    id: d.newId("cmt"),
    projectId: project.id,
    targetType: target.type,
    targetId: target.id,
    authorId: d.actor.id,
    body: text,
    createdAt: d.now(),
  });
  const clients = (await sys.projectMembers.list({ projectId: project.id, role: "client" })).filter((m) => m.role === "client").map((m) => m.profileId);
  const audience = audienceClientId ? clients.filter((c) => c === audienceClientId) : clients;
  const recipients = new Set<Id>(viewer === "mentor" ? audience : [...(project.mentorId ? [project.mentorId] : []), ...(project.mode === "group" ? audience : [])]);
  recipients.delete(d.actor.id);
  for (const to of recipients) {
    await notify(d, to, "comment_added", { projectId: project.id, targetType: target.type, targetId: target.id, authorName: d.actor.name, projectName: project.name, title });
  }
  return comment;
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
