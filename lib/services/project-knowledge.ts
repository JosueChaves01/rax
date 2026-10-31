import "server-only";
import type { ProjectDocumentFileType, ProjectKnowledgeDocument } from "@/types/domain";
import { forbidden, notFound, validation } from "@/lib/errors";
import { guard, sysRepo, type ServiceDeps } from "./base";
import { estimateTokens, evaluateKnowledgeMode } from "@/lib/ai/token-counter";
import { chunkDocumentText } from "@/lib/ai/chunking";

const MAX_DOCUMENT_CONTENT_LENGTH = 1_000_000; // ~1 MB de texto
const MAX_INSTRUCTIONS_LENGTH = 10_000;

/** Los documentos eliminados quedan vacíos (no hay borrado físico): no se listan ni se usan como contexto. */
export const isActiveDocument = (doc: Pick<ProjectKnowledgeDocument, "content">) => doc.content !== "";

export async function listProjectDocuments(
  d: ServiceDeps,
  projectId: string,
): Promise<ProjectKnowledgeDocument[]> {
  await guard(d, projectId, "project.read");
  const docs = (await d.repo.projectDocuments.list({ projectId })).filter(isActiveDocument);
  return docs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProjectKnowledgeStats(d: ServiceDeps, projectId: string) {
  const { project } = await guard(d, projectId, "project.read");
  const docs = (await d.repo.projectDocuments.list({ projectId })).filter(isActiveDocument);
  const totalTokens = docs.reduce((acc, doc) => acc + (doc.tokenCount || 0), 0);
  const evaluation = evaluateKnowledgeMode(totalTokens);

  return {
    projectId,
    documentCount: docs.length,
    totalTokens,
    evaluation,
    customInstructions: project.customInstructions || "",
  };
}

export async function updateProjectInstructions(
  d: ServiceDeps,
  projectId: string,
  instructions: string,
) {
  // Las instrucciones son del proyecto: solo su dueño las cambia (se escriben con permisos de sistema).
  await guard(d, projectId, "project.update");
  const clean = instructions.trim();
  if (clean.length > MAX_INSTRUCTIONS_LENGTH) {
    throw validation(`Las instrucciones no pueden superar los ${MAX_INSTRUCTIONS_LENGTH} caracteres.`);
  }

  const sys = sysRepo(d);
  await sys.projects.update(projectId, {
    customInstructions: clean,
    updatedAt: d.now(),
  });

  return { ok: true as const, customInstructions: clean };
}

export interface AddProjectDocumentInput {
  title: string;
  filename: string;
  content: string;
  fileType?: ProjectDocumentFileType;
  source?: "upload" | "chat_extracted" | "note";
  sourceMessageId?: string;
}

export async function addProjectDocument(
  d: ServiceDeps,
  projectId: string,
  input: AddProjectDocumentInput,
): Promise<ProjectKnowledgeDocument> {
  await guard(d, projectId, "project.read");

  const title = input.title.trim().slice(0, 200);
  const filename = input.filename.trim().slice(0, 255);
  const content = input.content.trim();

  if (!title) throw validation("El documento requiere un título válido.");
  if (!filename) throw validation("El documento requiere un nombre de archivo.");
  if (!content || content.length > MAX_DOCUMENT_CONTENT_LENGTH) {
    throw validation(`El contenido debe tener entre 1 y ${MAX_DOCUMENT_CONTENT_LENGTH} caracteres.`);
  }

  const tokenCount = estimateTokens(content);
  const now = d.now();
  const docId = d.newId("pdoc");

  const doc: ProjectKnowledgeDocument = {
    id: docId,
    projectId,
    title,
    filename,
    content,
    fileType: input.fileType ?? "markdown",
    tokenCount,
    source: input.source ?? "upload",
    sourceMessageId: input.sourceMessageId,
    createdBy: d.actor.id,
    createdAt: now,
    updatedAt: now,
  };

  const sys = sysRepo(d);
  const savedDoc = await sys.projectDocuments.insert(doc);

  // Generar chunks para indexación y RAG
  const chunks = chunkDocumentText(content);
  for (const c of chunks) {
    await sys.projectDocumentChunks.insert({
      id: d.newId("pchk"),
      projectId,
      documentId: savedDoc.id,
      chunkIndex: c.chunkIndex,
      content: c.content,
      tokenCount: c.tokenCount,
      createdAt: now,
    });
  }

  return savedDoc;
}

export async function deleteProjectDocument(
  d: ServiceDeps,
  projectId: string,
  documentId: string,
): Promise<{ ok: true }> {
  const { rel } = await guard(d, projectId, "project.read");
  const doc = await d.repo.projectDocuments.get(documentId);
  if (!doc || doc.projectId !== projectId || !isActiveDocument(doc)) throw notFound("Documento no encontrado.");
  if (!rel.isOwner && doc.createdBy !== d.actor.id) {
    throw forbidden("Solo el dueño del proyecto o quien subió el documento puede eliminarlo.");
  }

  const sys = sysRepo(d);
  // Limpiar chunks asociados
  const chunks = await sys.projectDocumentChunks.list({ documentId });
  for (const chunk of chunks) {
    await sys.projectDocumentChunks.update(chunk.id, { tokenCount: 0 }).catch(() => {});
  }

  // Marcar documento como vacío o eliminar
  await sys.projectDocuments.update(doc.id, { content: "", tokenCount: 0, updatedAt: d.now() });

  return { ok: true };
}

/**
 * Promueve una decisión o mensaje de un chat a Project Knowledge (estilo Claude Projects).
 * Ahora disponible para todos los hilos del proyecto.
 */
export async function promoteDecisionToKnowledge(
  d: ServiceDeps,
  projectId: string,
  input: {
    messageId?: string;
    title: string;
    filename?: string;
    content: string;
  },
): Promise<ProjectKnowledgeDocument> {
  const safeFilename =
    input.filename?.trim() ||
    `decision_${new Date().toISOString().slice(0, 10)}_${input.title
      .toLowerCase()
      .replace(/[^\w]/g, "_")
      .slice(0, 20)}.md`;

  return addProjectDocument(d, projectId, {
    title: input.title,
    filename: safeFilename,
    content: input.content,
    fileType: "markdown",
    source: "chat_extracted",
    sourceMessageId: input.messageId,
  });
}

