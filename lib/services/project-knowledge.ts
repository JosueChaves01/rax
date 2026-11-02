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


/** Un documento de cualquiera de los proyectos de quien mira, para la biblioteca general. */
export interface LibraryDocument {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  source: ProjectKnowledgeDocument["source"];
  updatedAt: string;
  authorName: string;
  /** Lo compartió un mentor asignado al proyecto. */
  fromMentor: boolean;
}

/**
 * Documentos vigentes de todos los proyectos a los que la persona tiene acceso (los suyos, donde
 * colabora o, si es mentor, los asignados), del más nuevo al más viejo.
 */
export async function listLibraryDocuments(d: ServiceDeps): Promise<LibraryDocument[]> {
  const projects = await d.repo.projects.list();
  const names = new Map<string, string>();
  const rows = await Promise.all(
    projects.map(async (p) => {
      try {
        await guard(d, p.id, "project.read");
      } catch {
        return [];
      }
      const [docs, assignments] = await Promise.all([
        d.repo.projectDocuments.list({ projectId: p.id }),
        d.repo.mentorAssignments.list({ projectId: p.id, status: "active" }),
      ]);
      const mentors = new Set(assignments.map((a) => a.mentorId));
      return docs.filter(isActiveDocument).map((doc) => ({ doc, project: p, fromMentor: mentors.has(doc.createdBy) }));
    }),
  );
  const flat = rows.flat();
  for (const id of new Set(flat.map((r) => r.doc.createdBy))) {
    if (id === d.actor.id) names.set(id, "Vos");
    else names.set(id, (await d.repo.profiles.get(id).catch(() => undefined))?.name ?? "Otra persona");
  }
  return flat
    .map(({ doc, project, fromMentor }) => ({
      id: doc.id,
      projectId: project.id,
      projectName: project.name,
      title: doc.title || doc.filename,
      source: doc.source,
      updatedAt: doc.updatedAt,
      authorName: names.get(doc.createdBy) ?? "Otra persona",
      fromMentor,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
