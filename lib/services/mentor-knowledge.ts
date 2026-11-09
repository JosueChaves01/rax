import type { Id } from "@/types/domain";
import type { MentorDocument, MentorDocumentChunk, MentorDocumentKind } from "@/types/b2b";
import type { Repository } from "@/lib/data/repository";
import { getKnowledgeContext, type KnowledgeContextResult, type KnowledgeOptions } from "@/lib/ai/knowledge-retrieval";
import { estimateTokens } from "@/lib/ai/token-counter";
import { chunkDocumentText } from "@/lib/ai/chunking";
import { assertCan } from "@/lib/authz";
import { notFound, validation } from "@/lib/errors";
import type { ServiceDeps } from "./base";

/**
 * Conocimiento (RAG) del mentor, fuera de los proyectos. El cliente nunca lo lee directo: lo usa el
 * servidor dentro del turno del agente. Dueño: Dev A (plan técnico §2.4).
 *
 * Las escrituras van con el repositorio de la persona (RLS: solo el propio mentor). Como en los
 * documentos del proyecto, no hay borrado físico: un documento eliminado queda con contenido vacío.
 */

export interface MentorDocumentInput {
  title: string;
  filename: string;
  content: string;
  fileType: string;
  kind: MentorDocumentKind;
}

export const MENTOR_DOCUMENT_KINDS: readonly MentorDocumentKind[] = ["methodology", "template", "reference", "example"];
export const MENTOR_FILE_TYPES = ["markdown", "text", "csv", "code", "pdf", "json"] as const;
const MAX_DOCUMENT_CONTENT_LENGTH = 1_000_000; // ~1 MB de texto, como en los documentos del proyecto

/** Lo que la pantalla del perfil muestra de cada documento (sin el contenido). */
export type MentorDocumentSummary = Omit<MentorDocument, "content">;

export type MentorKnowledgeContext = KnowledgeContextResult<MentorDocument, MentorDocumentChunk>;

const isActive = (doc: Pick<MentorDocument, "content">) => doc.content !== "";

export async function addMentorDocument(d: ServiceDeps, input: MentorDocumentInput): Promise<MentorDocument> {
  assertCan(d.actor, "mentor.knowledge");
  const title = (input.title ?? "").trim().slice(0, 200);
  const filename = (input.filename ?? "").trim().slice(0, 255);
  const content = (input.content ?? "").trim();
  if (!title) throw validation("El documento requiere un título.");
  if (!filename) throw validation("El documento requiere un nombre de archivo.");
  if (!content || content.length > MAX_DOCUMENT_CONTENT_LENGTH) {
    throw validation(`El contenido debe tener entre 1 y ${MAX_DOCUMENT_CONTENT_LENGTH} caracteres.`);
  }
  if (!MENTOR_DOCUMENT_KINDS.includes(input.kind)) throw validation("Tipo de documento no válido.");
  const fileType = (MENTOR_FILE_TYPES as readonly string[]).includes(input.fileType) ? input.fileType : "markdown";

  const now = d.now();
  const saved = await d.repo.mentorDocuments.insert({
    id: d.newId("mdoc"),
    mentorId: d.actor.id,
    title,
    filename,
    content,
    fileType,
    tokenCount: estimateTokens(content),
    kind: input.kind,
    createdAt: now,
    updatedAt: now,
  });

  for (const c of chunkDocumentText(content)) {
    await d.repo.mentorDocumentChunks.insert({
      id: d.newId("mchk"),
      mentorId: d.actor.id,
      documentId: saved.id,
      chunkIndex: c.chunkIndex,
      content: c.content,
      tokenCount: c.tokenCount,
      createdAt: now,
    });
  }
  return saved;
}

export async function deleteMentorDocument(d: ServiceDeps, id: Id): Promise<void> {
  assertCan(d.actor, "mentor.knowledge");
  const doc = await d.repo.mentorDocuments.get(id);
  if (!doc || doc.mentorId !== d.actor.id || !isActive(doc)) throw notFound("Documento no encontrado.");
  for (const chunk of await d.repo.mentorDocumentChunks.list({ documentId: id })) {
    await d.repo.mentorDocumentChunks.update(chunk.id, { content: "", tokenCount: 0 });
  }
  await d.repo.mentorDocuments.update(id, { content: "", tokenCount: 0, updatedAt: d.now() });
}

/** Documentos vigentes del mentor que tiene la sesión, del más nuevo al más viejo (sin contenido). */
export async function listMentorDocuments(d: ServiceDeps): Promise<MentorDocumentSummary[]> {
  assertCan(d.actor, "mentor.knowledge");
  const docs = (await d.repo.mentorDocuments.list({ mentorId: d.actor.id })).filter(isActive);
  return docs
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ content: _content, ...rest }) => {
      void _content;
      return rest;
    });
}

/**
 * Copia una sola vez los recursos propios del mentor (`mentor_resources`, solo lectura) a su
 * conocimiento como documentos de referencia. Es idempotente por título: lo que ya existe se salta.
 */
export async function importMentorResourcesToKnowledge(d: ServiceDeps): Promise<{ imported: number; skipped: number }> {
  assertCan(d.actor, "mentor.knowledge");
  const [resources, docs] = await Promise.all([
    d.repo.mentorResources.list({ authorMentorId: d.actor.id }),
    d.repo.mentorDocuments.list({ mentorId: d.actor.id }),
  ]);
  const titles = new Set(docs.filter(isActive).map((doc) => normalizeTitle(doc.title)));
  let imported = 0;
  let skipped = 0;
  for (const r of resources) {
    const title = r.title.trim().slice(0, 200);
    const content = [r.description.trim(), r.content.trim(), r.tags.length ? `Etiquetas: ${r.tags.join(", ")}` : ""]
      .filter(Boolean)
      .join("\n\n");
    if (r.authorMentorId !== d.actor.id || !title || !content || titles.has(normalizeTitle(title))) {
      skipped++;
      continue;
    }
    await addMentorDocument(d, { title, filename: `${slug(title)}.md`, content: `# ${title}\n\n${content}`, fileType: "markdown", kind: "reference" });
    titles.add(normalizeTitle(title));
    imported++;
  }
  return { imported, skipped };
}

const normalizeTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");
const slug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "recurso";

/**
 * Fragmentos del conocimiento del mentor más relevantes para la consulta (documentos completos si
 * caben). Lo consumen el entrevistador de intake (Dev B) y el chat del mentor. Recibe un repositorio
 * del sistema: quien llama ya verificó el permiso.
 */
export async function getMentorKnowledgeContext(
  repo: Repository,
  mentorId: Id,
  query: string,
  opts: KnowledgeOptions = {},
): Promise<MentorKnowledgeContext> {
  return getKnowledgeContext<MentorDocument, MentorDocumentChunk>(
    {
      documents: () => repo.mentorDocuments.list({ mentorId }),
      chunks: () => repo.mentorDocumentChunks.list({ mentorId }),
      latestChunks: (limit) => repo.mentorDocumentChunks.latest({ mentorId }, limit),
      // Sin función de búsqueda en la base para el mentor (todavía): ranking por palabras en memoria.
    },
    query,
    opts,
  );
}
