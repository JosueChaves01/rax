import type { ServiceDeps } from "@/lib/services/base";
import type { DocumentSource } from "@/lib/documents/types";
import { isOnlyClient, relationOf } from "@/lib/services/base";
import { documentFromMessage, documentFromProject, documentFromResource } from "@/lib/services/agent-documents";
import { publishedDocumentSource } from "@/lib/services/client-portal";

/**
 * El documento que piden los parámetros de la URL (con su verificación de acceso):
 * - del agente: ?mensaje=<id>&artefacto=<id>
 * - del conocimiento del proyecto: ?proyecto=<id>&documento=<id>
 * - de la biblioteca metodológica: ?recurso=<id>
 * Devuelve null si faltan los parámetros.
 *
 * Pivot B2B: una persona cliente (sin otra relación con el proyecto) no tiene `project.read`; para ella
 * el documento del proyecto sale del material publicado (solo lo publicado para ella o para todo el
 * grupo; un documento «solo mentor» responde 404).
 */
export async function documentSourceFromQuery(d: ServiceDeps, q: URLSearchParams): Promise<DocumentSource | null> {
  const message = q.get("mensaje");
  const artifact = q.get("artefacto");
  const project = q.get("proyecto");
  const document = q.get("documento");
  const resource = q.get("recurso");
  if (message && artifact) return documentFromMessage(d, message, artifact);
  if (project && document) {
    if (isOnlyClient(await relationOf(d, project))) return publishedDocumentSource(d, project, document);
    return documentFromProject(d, project, document);
  }
  if (resource) return documentFromResource(d, resource);
  return null;
}
