import type { ServiceDeps } from "@/lib/services/base";
import type { DocumentSource } from "@/lib/documents/types";
import { documentFromMessage, documentFromProject, documentFromResource } from "@/lib/services/agent-documents";

/**
 * El documento que piden los parámetros de la URL (con su verificación de acceso):
 * - del agente: ?mensaje=<id>&artefacto=<id>
 * - del conocimiento del proyecto: ?proyecto=<id>&documento=<id>
 * - de la biblioteca metodológica: ?recurso=<id>
 * Devuelve null si faltan los parámetros.
 */
export async function documentSourceFromQuery(d: ServiceDeps, q: URLSearchParams): Promise<DocumentSource | null> {
  const message = q.get("mensaje");
  const artifact = q.get("artefacto");
  const project = q.get("proyecto");
  const document = q.get("documento");
  const resource = q.get("recurso");
  if (message && artifact) return documentFromMessage(d, message, artifact);
  if (project && document) return documentFromProject(d, project, document);
  if (resource) return documentFromResource(d, resource);
  return null;
}
