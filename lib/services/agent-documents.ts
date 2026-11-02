import "server-only";
import type { AgentArtifact, AgentDocumentPlacement, AgentMessage } from "@/types/domain";
import { can } from "@/lib/authz";
import { notFound, validation } from "@/lib/errors";
import { documentSlug, isDocumentFormat, type DocumentFormat, type DocumentSource } from "@/lib/documents/types";
import { guard, relationOf, sysRepo, type ServiceDeps } from "./base";
import { authorizedThread } from "./agent-chat";
import { addProjectDocument, isActiveDocument } from "./project-knowledge";

export const DOCUMENT_ARTIFACT_TYPE = "application/vnd.rax.document" as const;
const MAX_DOCUMENT_LENGTH = 200_000;

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const longDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
};

export interface CreateAgentDocumentInput {
  title: string;
  format: DocumentFormat;
  content: string;
  addToProject: boolean;
}

/**
 * Crea el documento que generó el agente: siempre como artefacto descargable del mensaje y, si se
 * pidió, también en el conocimiento del proyecto (así el agente y los demás hilos lo pueden consultar).
 * El archivo se arma al descargarlo, en el formato que se elija; no se guarda ningún binario.
 */
export async function createAgentDocument(
  d: ServiceDeps,
  projectId: string,
  input: CreateAgentDocumentInput,
): Promise<{ artifact: AgentArtifact; savedToProject: boolean; saveError?: string }> {
  const { project } = await guard(d, projectId, "agent.chat");
  const title = input.title.trim().slice(0, 200);
  const content = input.content.trim().slice(0, MAX_DOCUMENT_LENGTH);
  if (!title) throw validation("El documento necesita un título.");
  if (!content) throw validation("El documento está vacío.");
  if (!isDocumentFormat(input.format)) throw validation("El formato debe ser pdf o docx.");

  const slug = documentSlug(title);
  const artifact: AgentArtifact = {
    id: d.newId("art"),
    identifier: slug,
    title,
    type: DOCUMENT_ARTIFACT_TYPE,
    content,
    format: input.format,
    subtitle: `${project.name} · ${longDate(d.now())}`,
  };

  if (!input.addToProject) return { artifact, savedToProject: false };
  try {
    const doc = await addProjectDocument(d, projectId, {
      title,
      filename: `${slug}.${input.format}`,
      content,
      fileType: "markdown",
      source: "chat_extracted",
    });
    return { artifact: { ...artifact, documentId: doc.id }, savedToProject: true };
  } catch (e) {
    console.warn("[agent] No se pudo agregar el documento al proyecto:", e instanceof Error ? e.message : e);
    return { artifact, savedToProject: false, saveError: "No se pudo agregar al proyecto; igual se puede descargar desde el chat." };
  }
}

/** Documento de un mensaje del agente, para descargarlo. Solo quien creó el hilo lo puede leer. */
export async function documentFromMessage(d: ServiceDeps, messageId: string, artifactId: string): Promise<DocumentSource> {
  const message = await d.repo.agentMessages.get(messageId);
  if (!message) throw notFound("Este documento no existe o no tenés acceso.");
  await authorizedThread(d, message.threadId);
  const artifact = (message.artifacts ?? []).find((a) => a.id === artifactId && a.type === DOCUMENT_ARTIFACT_TYPE);
  if (!artifact) throw notFound("Este documento no existe o no tenés acceso.");
  return { title: artifact.title, subtitle: artifact.subtitle, content: artifact.content };
}

/** Cualquier documento del conocimiento del proyecto, para verlo o bajarlo como PDF o Word. */
export async function documentFromProject(d: ServiceDeps, projectId: string, documentId: string): Promise<DocumentSource> {
  const { project } = await guard(d, projectId, "project.read");
  const doc = await d.repo.projectDocuments.get(documentId);
  if (!doc || doc.projectId !== projectId || !isActiveDocument(doc)) throw notFound("Documento no encontrado.");
  return {
    title: doc.title,
    subtitle: `${project.name} · ${longDate(doc.updatedAt)}`,
    content: doc.content,
    fileType: doc.fileType,
    filename: doc.filename,
  };
}

/** Un recurso de la biblioteca metodológica (público o propio), para bajarlo como PDF o Word. */
export async function documentFromResource(d: ServiceDeps, resourceId: string): Promise<DocumentSource> {
  const r = await d.repo.mentorResources.get(resourceId);
  if (!r || (!r.isPublic && r.authorMentorId !== d.actor.id)) throw notFound("Recurso no encontrado.");
  return { title: r.title, subtitle: `Biblioteca RAX · ${longDate(r.updatedAt)}`, content: `${r.description}\n\n${r.content}` };
}

/* ── Agregar un documento ya generado a un proyecto ── */

/** Proyecto al que se puede agregar un documento del agente. */
export interface DocumentTargetProject {
  id: string;
  name: string;
  /** Es el proyecto del hilo donde se generó el documento. */
  current: boolean;
  /** Ya tiene una copia (vigente) de este documento. */
  saved: boolean;
}

/**
 * Proyectos donde quien conversa puede guardar documentos: los suyos, donde colabora o, si es mentor,
 * los que tiene asignados (asignación activa). La lista sale de la base con sus permisos y se vuelve a
 * verificar con `guard` al guardar.
 */
export async function listDocumentTargetProjects(d: ServiceDeps): Promise<Array<{ id: string; name: string }>> {
  if (d.actor.role === "admin") return [];
  const projects = await d.repo.projects.list();
  const allowed = await Promise.all(projects.map(async (p) => (can(d.actor, "agent.chat", await relationOf(d, p.id)) ? p : null)));
  return allowed
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((p) => ({ id: p.id, name: p.name }));
}

async function documentArtifactOf(d: ServiceDeps, messageId: string, artifactId: string) {
  const message = await d.repo.agentMessages.get(messageId);
  if (!message) throw notFound("Este documento no existe o no tenés acceso.");
  const thread = await authorizedThread(d, message.threadId);
  const artifact = (message.artifacts ?? []).find((a) => a.id === artifactId && a.type === DOCUMENT_ARTIFACT_TYPE);
  if (!artifact) throw notFound("Este documento no existe o no tenés acceso.");
  return { message, thread, artifact };
}

/** Proyectos donde ya está el documento: el del hilo si se guardó al generarlo, más los que se agregaron después. */
function placementsOf(artifact: AgentArtifact, threadProjectId: string): Array<{ projectId: string; documentId: string }> {
  const list = [...(artifact.savedTo ?? [])];
  if (artifact.documentId && !list.some((p) => p.documentId === artifact.documentId)) {
    list.push({ projectId: threadProjectId, projectName: "", documentId: artifact.documentId, addedAt: "" });
  }
  return list;
}

async function activePlacement(d: ServiceDeps, artifact: AgentArtifact, threadProjectId: string, projectId: string) {
  for (const p of placementsOf(artifact, threadProjectId)) {
    if (p.projectId !== projectId) continue;
    const doc = await sysRepo(d).projectDocuments.get(p.documentId);
    if (doc && doc.projectId === projectId && isActiveDocument(doc)) return doc;
  }
  return undefined;
}

/** Proyectos a los que se puede agregar este documento, marcando el actual y los que ya lo tienen. */
export async function documentTargets(d: ServiceDeps, messageId: string, artifactId: string): Promise<DocumentTargetProject[]> {
  const { thread, artifact } = await documentArtifactOf(d, messageId, artifactId);
  const projects = await listDocumentTargetProjects(d);
  const out = await Promise.all(
    projects.map(async (p) => ({
      ...p,
      current: p.id === thread.projectId,
      saved: Boolean(await activePlacement(d, artifact, thread.projectId, p.id)),
    })),
  );
  return out.sort((a, b) => Number(b.current) - Number(a.current));
}

/**
 * Agrega a un proyecto un documento que el agente ya generó (desde la tarjeta o pidiéndolo en el chat).
 * Solo quien creó el hilo, y solo en proyectos donde tiene acceso: para un mentor, los que tiene asignados.
 * Si ya está en ese proyecto no lo duplica. Queda anotado en el mensaje para que la tarjeta lo muestre.
 */
export async function addAgentDocumentToProject(
  d: ServiceDeps,
  input: { messageId: string; artifactId: string; projectId: string },
): Promise<{ placement: AgentDocumentPlacement; alreadySaved: boolean; artifact: AgentArtifact }> {
  const { message, thread, artifact } = await documentArtifactOf(d, input.messageId, input.artifactId);
  const { project } = await guard(d, input.projectId, "agent.chat");

  const existing = await activePlacement(d, artifact, thread.projectId, project.id);
  if (existing) {
    return {
      placement: { projectId: project.id, projectName: project.name, documentId: existing.id, addedAt: existing.createdAt },
      alreadySaved: true,
      artifact,
    };
  }

  const doc = await addProjectDocument(d, project.id, {
    title: artifact.title,
    filename: `${artifact.identifier || documentSlug(artifact.title)}.${artifact.format ?? "pdf"}`,
    content: artifact.content,
    fileType: "markdown",
    source: "chat_extracted",
    sourceMessageId: message.id,
  });
  const placement: AgentDocumentPlacement = { projectId: project.id, projectName: project.name, documentId: doc.id, addedAt: d.now() };
  const updated: AgentArtifact = {
    ...artifact,
    savedTo: [...(artifact.savedTo ?? []).filter((p) => p.projectId !== project.id), placement],
  };
  // agent_messages no tiene política de actualización: se escribe con la cuenta de servicio tras autorizar arriba.
  await sysRepo(d).agentMessages.update(message.id, {
    artifacts: (message.artifacts ?? []).map((a) => (a.id === artifact.id ? updated : a)),
  } as Partial<AgentMessage>);
  return { placement, alreadySaved: false, artifact: updated };
}

/** Documentos generados en un hilo, del más nuevo al más viejo (para que el agente sepa cuál agregar). */
export async function threadDocuments(d: ServiceDeps, threadId: string, limit = 60): Promise<Array<{ messageId: string; artifact: AgentArtifact }>> {
  await authorizedThread(d, threadId);
  const messages = await d.repo.agentMessages.latest({ threadId } as Partial<AgentMessage>, limit);
  return messages
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .flatMap((m) => (m.artifacts ?? []).filter((a) => a.type === DOCUMENT_ARTIFACT_TYPE).reverse().map((artifact) => ({ messageId: m.id, artifact })));
}
