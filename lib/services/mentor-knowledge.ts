import type { Id } from "@/types/domain";
import type { MentorDocument, MentorDocumentKind } from "@/types/b2b";
import type { Repository } from "@/lib/data/repository";
import type { KnowledgeContextResult } from "@/lib/ai/knowledge-retrieval";
import type { ServiceDeps } from "./base";
import { pendingContract } from "./contract";

/**
 * Conocimiento (RAG) del mentor, fuera de los proyectos. El cliente nunca lo lee directo: lo usa el
 * servidor dentro del turno del agente. Dueño: Dev A (plan técnico §2.4). Contrato de Fase 0.
 */

export interface MentorDocumentInput {
  title: string;
  filename: string;
  content: string;
  fileType: string;
  kind: MentorDocumentKind;
}

export async function addMentorDocument(d: ServiceDeps, input: MentorDocumentInput): Promise<MentorDocument> {
  return pendingContract("addMentorDocument", d, input);
}

export async function deleteMentorDocument(d: ServiceDeps, id: Id): Promise<void> {
  return pendingContract("deleteMentorDocument", d, id);
}

/**
 * Fragmentos del conocimiento del mentor más relevantes para la consulta (documentos completos si
 * caben). Lo consumen el entrevistador de intake (Dev B) y el chat del mentor. Recibe un repositorio
 * del sistema: quien llama ya verificó el permiso.
 */
export async function getMentorKnowledgeContext(
  repo: Repository,
  mentorId: Id,
  query: string,
  opts: { threshold?: number; maxRagChunks?: number } = {},
): Promise<KnowledgeContextResult> {
  return pendingContract("getMentorKnowledgeContext", repo, mentorId, query, opts);
}
