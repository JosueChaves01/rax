import type { Id, MentorSession, PostSessionSynthesis, ProjectKnowledgeDocument } from "@/types/domain";
import type { DocKind, DocumentVisibility, ProjectMode, PublishedResource } from "@/types/b2b";
import { SESSION_KIND_LABEL } from "@/features/labels";
import { notFound, validation } from "@/lib/errors";
import { estimateTokens } from "@/lib/ai/token-counter";
import { chunkDocumentText } from "@/lib/ai/chunking";
import { audit, guard, sysRepo, type ServiceDeps } from "./base";
import { notify } from "./notifications";
import { addProjectDocument, isActiveDocument } from "./project-knowledge";

/**
 * Publicación de material al cliente (`project_documents.visibility`). Solo el mentor del proyecto
 * publica o despublica. Dueño: Dev A (plan técnico §2.4, §4 Fase 4 y §6.1).
 *
 * - Individual: lo publicado es para la única persona (sin `audience_client_id`).
 * - Grupal: para todo el grupo (sin destinatario) o para una persona del grupo en particular.
 * - Al publicar se avisa (notificación `resource_published`) a quien lo puede ver por primera vez.
 * - La síntesis de una sesión se publica con un clic como documento `summary` de esa sesión.
 *
 * El cliente lee lo publicado por RLS (project_documents_select_client); lo que no está publicado
 * nunca le llega. Las escrituras van como sistema DESPUÉS de verificar `document.publish`.
 */

export interface PublishOptions {
  sessionId?: Id;
  docKind?: DocKind;
  /** En proyectos grupales: para una persona en particular. Vacío = para todo el grupo. */
  audienceClientId?: Id;
}

const DOC_KINDS: DocKind[] = ["material", "summary", "transcript", "agreement", "intake"];
/** El brief del intake es solo para el mentor: no se publica. */
const PUBLISHABLE_KINDS: DocKind[] = ["material", "summary", "transcript", "agreement"];

const visibilityOf = (doc: Pick<ProjectKnowledgeDocument, "visibility">): DocumentVisibility => doc.visibility ?? "mentor_only";
const isPublished = (doc: Pick<ProjectKnowledgeDocument, "visibility">) => visibilityOf(doc) === "published";

/** Puede verlo esta persona (cliente) con la publicación actual del documento. */
const visibleTo = (doc: Pick<ProjectKnowledgeDocument, "visibility" | "audienceClientId">, clientId: Id) =>
  isPublished(doc) && (!doc.audienceClientId || doc.audienceClientId === clientId);

async function clientIdsOf(d: ServiceDeps, projectId: Id): Promise<Id[]> {
  const members = await sysRepo(d).projectMembers.list({ projectId });
  return members.filter((m) => m.role === "client").map((m) => m.profileId);
}

/** Documento vigente del proyecto + permiso de publicar del mentor (sin revelar documentos ajenos). */
async function publishAccess(d: ServiceDeps, documentId: Id) {
  const doc = await sysRepo(d).projectDocuments.get(documentId);
  if (!doc || !isActiveDocument(doc)) throw notFound("Documento no encontrado.");
  const { project } = await guard(d, doc.projectId, "document.publish");
  if (!project.mentorId) throw validation("Publicar al cliente es parte del flujo con mentor y clientes.");
  return { doc, project };
}

async function commentCount(d: ServiceDeps, documentId: Id): Promise<number> {
  return sysRepo(d)
    .comments.count({ targetType: "document", targetId: documentId })
    .catch(() => 0);
}

function toResource(doc: ProjectKnowledgeDocument, comments: number): PublishedResource {
  return {
    documentId: doc.id,
    projectId: doc.projectId,
    title: doc.title || doc.filename,
    docKind: doc.docKind ?? "material",
    sessionId: doc.mentorSessionId,
    audienceClientId: doc.audienceClientId,
    publishedAt: doc.publishedAt ?? "",
    commentCount: comments,
  };
}

/**
 * Publica un documento del proyecto para el cliente (o para el grupo, o una persona del grupo).
 * Volver a publicar cambia el destinatario o el tipo sin duplicar nada. Solo el mentor del proyecto.
 */
export async function publishDocument(d: ServiceDeps, documentId: Id, opts: PublishOptions = {}): Promise<PublishedResource> {
  const { doc, project } = await publishAccess(d, documentId);
  const mode: ProjectMode = project.mode ?? "individual";
  const clients = await clientIdsOf(d, project.id);

  const docKind = opts.docKind ?? doc.docKind ?? "material";
  if (!DOC_KINDS.includes(docKind)) throw validation("El tipo de documento no es válido.");
  if (!PUBLISHABLE_KINDS.includes(docKind)) throw validation("El brief del intake es solo para ti: no se publica al cliente.");

  let sessionId = doc.mentorSessionId;
  if (opts.sessionId) {
    const session = await sysRepo(d).mentorSessions.get(opts.sessionId);
    if (!session || session.projectId !== project.id) throw notFound("Esa sesión no es de este proyecto.");
    sessionId = session.id;
  }

  const audience = opts.audienceClientId?.trim() || undefined;
  if (audience && !clients.includes(audience)) throw validation("Esa persona no forma parte de este proyecto.");
  // En un proyecto individual todo lo publicado es para la única persona.
  const audienceClientId = mode === "group" ? audience : undefined;

  const sameAudience = isPublished(doc) && (doc.audienceClientId ?? undefined) === audienceClientId;
  const publishedAt = sameAudience && doc.publishedAt ? doc.publishedAt : d.now();
  const updated = await sysRepo(d).projectDocuments.update(doc.id, {
    visibility: "published",
    publishedAt,
    docKind,
    mentorSessionId: sessionId,
    audienceClientId,
  });

  // Aviso solo a quien lo ve por primera vez (republicar para el mismo público no vuelve a avisar).
  const recipients = (audienceClientId ? [audienceClientId] : clients).filter((c) => !visibleTo(doc, c));
  for (const clientId of recipients) {
    try {
      await notify(d, clientId, "resource_published", {
        projectId: project.id,
        documentId: doc.id,
        title: updated.title || updated.filename,
        docKind,
        ...(sessionId ? { sessionId } : {}),
      });
    } catch (err) {
      console.warn("[publishing] No se pudo avisar al cliente:", err instanceof Error ? err.message : err);
    }
  }
  await audit(d, "resource.updated", {
    projectId: project.id,
    targetId: doc.id,
    meta: { event: "document.published", docKind, audience: audienceClientId ? "person" : "all" },
  });
  return toResource(updated, await commentCount(d, doc.id));
}

/** Deja el documento solo para el mentor. Repetirlo no hace nada. Los comentarios se conservan. */
export async function unpublishDocument(d: ServiceDeps, documentId: Id): Promise<void> {
  const { doc, project } = await publishAccess(d, documentId);
  if (!isPublished(doc)) return;
  await sysRepo(d).projectDocuments.update(doc.id, { visibility: "mentor_only", publishedAt: undefined });
  await audit(d, "resource.updated", { projectId: project.id, targetId: doc.id, meta: { event: "document.unpublished" } });
}

/* ───────────── Síntesis de la sesión ───────────── */

/** «Sesión 1», «Sesión 3» o el tipo de sesión, para títulos. */
export function sessionLabel(s: Pick<MentorSession, "kind" | "sessionNumber">): string {
  if (s.kind === "kickoff") return "Sesión 1";
  if (s.sessionNumber) return `Sesión ${s.sessionNumber}`;
  return SESSION_KIND_LABEL[s.kind] ?? "Sesión";
}

const bullets = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");

/** La síntesis en Markdown, tal como la ve el cliente. */
export function renderSynthesisDocument(syn: PostSessionSynthesis): string {
  const parts = [`## Resumen\n\n${syn.summary.trim()}`];
  if (syn.agreedDecisions.length) parts.push(`## Decisiones\n\n${bullets(syn.agreedDecisions)}`);
  if (syn.entrepreneurCommitments.length) {
    parts.push(`## Tus compromisos\n\n${bullets(syn.entrepreneurCommitments.map((c) => (c.dueDate ? `${c.title} (para el ${c.dueDate})` : c.title)))}`);
  }
  if (syn.mentorCommitments.length) {
    parts.push(`## Compromisos del mentor\n\n${bullets(syn.mentorCommitments.map((c) => (c.dueDate ? `${c.title} (para el ${c.dueDate})` : c.title)))}`);
  }
  if (syn.nextSteps?.trim()) parts.push(`## Próximos pasos\n\n${syn.nextSteps.trim()}`);
  return parts.join("\n\n");
}

/** Cambia el texto de un documento y rehace sus fragmentos (RAG) sin cambiar su id ni sus comentarios. */
async function replaceContent(d: ServiceDeps, doc: ProjectKnowledgeDocument, content: string): Promise<ProjectKnowledgeDocument> {
  const sys = sysRepo(d);
  const now = d.now();
  const updated = await sys.projectDocuments.update(doc.id, { content, tokenCount: estimateTokens(content), updatedAt: now });
  const old = (await sys.projectDocumentChunks.list({ documentId: doc.id })).sort((a, b) => a.chunkIndex - b.chunkIndex);
  const fresh = chunkDocumentText(content);
  for (const c of fresh) {
    const prev = old.find((o) => o.chunkIndex === c.chunkIndex);
    if (prev) await sys.projectDocumentChunks.update(prev.id, { content: c.content, tokenCount: c.tokenCount });
    else await sys.projectDocumentChunks.insert({ id: d.newId("pchk"), projectId: doc.projectId, documentId: doc.id, chunkIndex: c.chunkIndex, content: c.content, tokenCount: c.tokenCount, createdAt: now });
  }
  // Los fragmentos que sobran quedan vacíos (no hay borrado físico, igual que al eliminar un documento).
  for (const o of old.filter((o) => !fresh.some((c) => c.chunkIndex === o.chunkIndex))) {
    await sys.projectDocumentChunks.update(o.id, { content: "", tokenCount: 0 }).catch(() => {});
  }
  return updated;
}

async function sessionForPublishing(d: ServiceDeps, sessionId: Id) {
  const session = await sysRepo(d).mentorSessions.get(sessionId);
  if (!session) throw notFound("Esta sesión no existe o no tienes acceso.");
  const { project } = await guard(d, session.projectId, "document.publish");
  if (!project.mentorId) throw validation("Publicar al cliente es parte del flujo con mentor y clientes.");
  return { session, project };
}

/** El documento `summary` de una sesión (vigente), si ya se creó. */
async function summaryDocOf(d: ServiceDeps, projectId: Id, sessionId: Id) {
  const docs = await sysRepo(d).projectDocuments.list({ projectId });
  return docs.find((doc) => doc.mentorSessionId === sessionId && doc.docKind === "summary" && isActiveDocument(doc));
}

/**
 * Publica con un clic la síntesis (ya revisada por el mentor) de una sesión como documento
 * `summary`. Si ya se publicó, actualiza el mismo documento con la versión vigente de la síntesis.
 */
export async function publishSessionSynthesis(d: ServiceDeps, sessionId: Id, opts: { audienceClientId?: Id } = {}): Promise<PublishedResource> {
  const { session, project } = await sessionForPublishing(d, sessionId);
  const syn = session.postSessionSynthesis;
  if (!syn?.summary?.trim()) throw validation("Todavía no hay síntesis de esta sesión. Genérala o escríbela y vuelve a publicar.");
  const content = renderSynthesisDocument(syn);
  let doc = await summaryDocOf(d, project.id, session.id);
  if (doc) {
    if (doc.content !== content) doc = await replaceContent(d, doc, content);
  } else {
    const day = (session.completedAt ?? session.scheduledAt ?? session.createdAt).slice(0, 10);
    const created = await addProjectDocument(d, project.id, {
      title: `Síntesis · ${sessionLabel(session)} · ${day}`,
      filename: `sintesis-${day}-${session.id.slice(-8)}.md`,
      content,
      fileType: "markdown",
      source: "note",
    });
    doc = await sysRepo(d).projectDocuments.update(created.id, { docKind: "summary", mentorSessionId: session.id, visibility: "mentor_only" });
  }
  return publishDocument(d, doc.id, { sessionId: session.id, docKind: "summary", audienceClientId: opts.audienceClientId });
}

/* ───────────── Lo que muestra la UI del mentor ───────────── */

export interface DocumentPublication {
  id: Id;
  title: string;
  docKind: DocKind;
  visibility: DocumentVisibility;
  audienceClientId?: Id;
  publishedAt?: string;
}

export interface PublishingContext {
  mode: ProjectMode;
  clients: Array<{ id: Id; name: string }>;
}

const publicationOf = (doc: ProjectKnowledgeDocument): DocumentPublication => ({
  id: doc.id,
  title: doc.title || doc.filename,
  docKind: doc.docKind ?? "material",
  visibility: visibilityOf(doc),
  audienceClientId: doc.audienceClientId,
  publishedAt: doc.publishedAt,
});

async function contextOf(d: ServiceDeps, projectId: Id, mode: ProjectMode | undefined): Promise<PublishingContext> {
  const ids = await clientIdsOf(d, projectId);
  const people = await Promise.all(ids.map((id) => sysRepo(d).profiles.get(id).catch(() => undefined)));
  return { mode: mode ?? "individual", clients: ids.map((id, i) => ({ id, name: people[i]?.name ?? "Cliente" })) };
}

/**
 * Estado de publicación de los documentos del proyecto, para `/app/p/[id]/documentos`. `null` si
 * quien mira no es el mentor del proyecto o el proyecto no es del flujo con clientes (sin botones).
 */
export async function getProjectPublishing(
  d: ServiceDeps,
  projectId: Id,
): Promise<(PublishingContext & { documents: Record<Id, DocumentPublication> }) | null> {
  if (d.actor.role !== "mentor") return null;
  let project;
  try {
    ({ project } = await guard(d, projectId, "document.publish"));
  } catch {
    return null;
  }
  if (!project.mentorId) return null;
  const docs = (await sysRepo(d).projectDocuments.list({ projectId })).filter(isActiveDocument);
  return { ...(await contextOf(d, projectId, project.mode)), documents: Object.fromEntries(docs.map((doc) => [doc.id, publicationOf(doc)])) };
}

export interface SessionPublishables extends PublishingContext {
  sessionId: Id;
  /** La síntesis de la sesión (si hay) y su documento publicado (si ya se publicó). */
  synthesis?: { summary: string; editedAt?: string; document?: DocumentPublication };
  /** Transcripciones de las llamadas de la sesión y material ligado a la sesión. */
  documents: DocumentPublication[];
}

/** Lo que el mentor puede publicar al terminar una sesión: síntesis, transcripciones y material. */
export async function getSessionPublishables(d: ServiceDeps, sessionId: Id): Promise<SessionPublishables> {
  const { session, project } = await sessionForPublishing(d, sessionId);
  const sys = sysRepo(d);
  const [docs, calls] = await Promise.all([sys.projectDocuments.list({ projectId: project.id }), sys.sessionCalls.list({ sessionId }).catch(() => [])]);
  const transcriptIds = new Set(calls.map((c) => c.transcriptDocumentId).filter((x): x is Id => !!x));
  const active = docs.filter(isActiveDocument);
  const summary = active.find((doc) => doc.mentorSessionId === sessionId && doc.docKind === "summary");
  const documents = active
    .filter((doc) => doc.id !== summary?.id && (transcriptIds.has(doc.id) || doc.mentorSessionId === sessionId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((doc) => {
      const p = publicationOf(doc);
      // Una transcripción que todavía no se publicó figura como `transcript`.
      return transcriptIds.has(doc.id) && p.docKind === "material" ? { ...p, docKind: "transcript" as const } : p;
    });
  const syn = session.postSessionSynthesis;
  return {
    sessionId,
    ...(await contextOf(d, project.id, project.mode)),
    synthesis: syn?.summary ? { summary: syn.summary, editedAt: syn.editedAt, document: summary ? publicationOf(summary) : undefined } : undefined,
    documents,
  };
}
