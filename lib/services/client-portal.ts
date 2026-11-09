import type { Comment, Id } from "@/types/domain";
import type { ClientHome, PublishedResource } from "@/types/b2b";
import type { ServiceDeps } from "./base";
import { pendingContract } from "./contract";

/**
 * Portal del cliente: material publicado, comentarios e inicio.
 * Dueño: Dev B (plan técnico §2.4). Contrato de Fase 0: todavía sin implementación.
 */

/** Material publicado para quien consulta (todo el grupo o esa persona). */
export async function listPublishedResources(d: ServiceDeps, projectId: Id): Promise<PublishedResource[]> {
  return pendingContract("listPublishedResources", d, projectId);
}

export async function commentOnResource(
  d: ServiceDeps,
  target: { type: "document" | "session"; id: Id },
  body: string,
): Promise<Comment> {
  return pendingContract("commentOnResource", d, target, body);
}

/** Proyectos, próxima sesión, intake pendiente, material nuevo e invitaciones. */
export async function getClientHome(d: ServiceDeps): Promise<ClientHome> {
  return pendingContract("getClientHome", d);
}
