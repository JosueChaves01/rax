import type { WorkflowToolDefinition } from "../../workflow-tools";

/** Definiciones (para el modelo) de las herramientas del mentor. Solo se ofrecen con RAX_B2B_FLOW. */

export const SEARCH_MENTOR_KNOWLEDGE_TOOL: WorkflowToolDefinition = {
  name: "search_mentor_knowledge",
  description:
    "Busca en el perfil, la metodología y los documentos propios del mentor (su biblioteca) lo más relevante para una consulta. Úsala antes de proponer un enfoque o un material, para seguir la forma de trabajar del mentor.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "Qué buscar, en pocas palabras (tema, técnica, plantilla)" } },
    required: ["query"],
  },
};

export const SUMMARIZE_DOCUMENT_TOOL: WorkflowToolDefinition = {
  name: "summarize_document",
  description:
    "Resume un documento del proyecto (o uno de la biblioteca del mentor) por id o por título. Devuelve un resumen breve con las ideas clave, para usarlo en la sesión o como base de un material.",
  parameters: {
    type: "object",
    properties: {
      document_id: { type: "string", description: "Id del documento, si se conoce" },
      title: { type: "string", description: "Título (o parte del título) del documento" },
      source: { type: "string", enum: ["project", "mentor"], description: "project: documentos del proyecto (por defecto). mentor: biblioteca del mentor." },
      focus: { type: "string", description: "En qué fijarse al resumir (opcional)" },
    },
  },
};

export const DRAFT_MATERIAL_TOOL: WorkflowToolDefinition = {
  name: "draft_material",
  description:
    "Redacta un material para el cliente (guía, ejercicio, plantilla, resumen) con el contexto del proyecto y la metodología del mentor, y lo guarda en los documentos del proyecto SOLO para el mentor. No se publica: el mentor lo revisa y decide si lo publica.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Título del material" },
      topic: { type: "string", description: "Qué debe cubrir y para qué le sirve al cliente" },
      instructions: { type: "string", description: "Extensión, tono, secciones obligatorias, nivel del cliente" },
      based_on: { type: "string", description: "Id o título de un documento del proyecto en el que basarse (opcional)" },
      format: { type: "string", enum: ["pdf", "docx"], description: "Formato de descarga. Por defecto pdf." },
    },
    required: ["title", "topic"],
  },
};

export const PROPOSE_PUBLISH_TOOL: WorkflowToolDefinition = {
  name: "propose_publish",
  description:
    "Propone publicar al cliente un documento del proyecto. NO lo publica: muestra una tarjeta y el mentor confirma. En proyectos grupales se puede proponer para una persona en particular (audience_client_id) o para todo el grupo.",
  parameters: {
    type: "object",
    properties: {
      document_id: { type: "string", description: "Id del documento del proyecto" },
      title: { type: "string", description: "Título del documento, si no se conoce el id" },
      audience_client_id: { type: "string", description: "Solo en grupales: id de la persona del grupo. Vacío = todo el grupo." },
      reason: { type: "string", description: "Por qué conviene publicarlo ahora, en una frase" },
    },
  },
};
