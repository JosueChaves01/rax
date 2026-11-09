import type { Id } from "@/types/domain";
import type { MentorContext } from "@/types/b2b";
import type { Repository } from "@/lib/data/repository";
import { pendingContract } from "@/lib/services/contract";

/**
 * Bloque `<mentor_context>` del prompt (perfil + metodología + fragmentos del RAG del mentor).
 * Lo arma Dev A; Dev B lo inserta en el prompt del entrevistador y del asistente del cliente.
 * Recibe un repositorio del sistema: quien llama ya verificó el permiso. Contrato de Fase 0.
 */
export async function buildMentorContext(repo: Repository, mentorId: Id, query: string): Promise<MentorContext> {
  return pendingContract("buildMentorContext", repo, mentorId, query);
}
