import "server-only";
import type { AgentArtifact } from "@/types/domain";
import { notFound, validation } from "@/lib/errors";
import { documentSlug, isDocumentFormat, type DocumentFormat, type DocumentSource } from "@/lib/documents/types";
import { guard, type ServiceDeps } from "./base";
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

/** Cualquier documento del conocimiento del proyecto, para bajarlo como PDF o Word. */
export async function documentFromProject(d: ServiceDeps, projectId: string, documentId: string): Promise<DocumentSource> {
  const { project } = await guard(d, projectId, "project.read");
  const doc = await d.repo.projectDocuments.get(documentId);
  if (!doc || doc.projectId !== projectId || !isActiveDocument(doc)) throw notFound("Documento no encontrado.");
  return { title: doc.title, subtitle: `${project.name} · ${longDate(doc.updatedAt)}`, content: doc.content };
}
