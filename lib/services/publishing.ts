import type { Id } from "@/types/domain";
import type { DocKind, PublishedResource } from "@/types/b2b";
import type { ServiceDeps } from "./base";
import { pendingContract } from "./contract";

/**
 * Publicación de material al cliente (project_documents.visibility). Solo el mentor publica.
 * Dueño: Dev A (plan técnico §2.4 y §6.1). Contrato de Fase 0: todavía sin implementación.
 */

export interface PublishOptions {
  sessionId?: Id;
  docKind?: DocKind;
  /** En proyectos grupales: para una persona en particular. Vacío = para todo el grupo. */
  audienceClientId?: Id;
}

export async function publishDocument(d: ServiceDeps, documentId: Id, opts: PublishOptions = {}): Promise<PublishedResource> {
  return pendingContract("publishDocument", d, documentId, opts);
}

export async function unpublishDocument(d: ServiceDeps, documentId: Id): Promise<void> {
  return pendingContract("unpublishDocument", d, documentId);
}
