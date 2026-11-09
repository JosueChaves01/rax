import type { Role } from "@/types/domain";
import { RAX_WORKFLOW_TOOLS, type WorkflowToolDefinition } from "../workflow-tools";
import { researchTools } from "../research-tools";
import { MENTOR_TOOLS } from "./mentor";
import { CLIENT_TOOLS } from "./client";
import type { B2BTool } from "./types";

/**
 * Registro de herramientas del agente. El orquestador (lib/ai/claude-orchestrator.ts) solo pregunta
 * `toolsFor(role, scope)`; las definiciones viven acá y las del pivot B2B en ./mentor (Dev A) y
 * ./client (Dev B). La ejecución de las herramientas actuales sigue en el orquestador; las nuevas
 * traen su propio `run` y se despachan con `findB2BTool`.
 */

/** Qué tiene disponible el turno (lo arma el orquestador desde ClaudeTurnInput). */
export interface ToolScope {
  /** Se pide un borrador para un campo de formulario: solo draft_field_value + flujo. */
  field: boolean;
  /** El hilo está persistido (habilita agregar documentos del hilo a un proyecto). */
  thread: boolean;
  /** El hilo pertenece a una sesión del asistente (notas de la sesión). */
  session: boolean;
  /** La sesión tiene otros hilos (leerlos). */
  siblings: boolean;
  /** Bandera RAX_B2B_FLOW: suma las herramientas del pivot según el rol. */
  b2b?: boolean;
}

export const DRAFT_FIELD_TOOL: WorkflowToolDefinition = {
  name: "draft_field_value",
  description: "Redacta el borrador del campo de formulario que la persona está completando. El borrador no se guarda hasta que la persona lo aplica.",
  parameters: {
    type: "object",
    properties: {
      value: { type: "string", description: "Valor propuesto para el campo, listo para pegar" },
      rationale: { type: "string", description: "Por qué se propone este valor, en una frase" },
    },
    required: ["value"],
  },
};

export const SESSION_NOTES_TOOL: WorkflowToolDefinition = {
  name: "update_session_notes",
  description:
    "Guarda en la sesión actual su objetivo, un resumen actualizado, decisiones de la persona, preguntas abiertas y próximos pasos. Lo ven todos los hilos de la sesión.",
  parameters: {
    type: "object",
    properties: {
      goal: { type: "string", description: "Objetivo de la sesión, si la persona lo definió o cambió" },
      summary: { type: "string", description: "Resumen de la sesión hasta ahora (reemplaza al anterior; integra lo previo)" },
      add_decisions: { type: "array", items: { type: "string" }, description: "Decisiones explícitas de la persona" },
      add_open_questions: { type: "array", items: { type: "string" }, description: "Preguntas o dudas que quedan abiertas" },
      resolve_open_questions: { type: "array", items: { type: "string" }, description: "Preguntas abiertas ya respondidas (texto exacto)" },
      next_steps: { type: "array", items: { type: "string" }, description: "Lista completa de próximos pasos (reemplaza la anterior)" },
    },
  },
};

export const READ_SESSION_THREAD_TOOL: WorkflowToolDefinition = {
  name: "read_session_thread",
  description: "Lee los mensajes recientes de otro hilo de la sesión actual.",
  parameters: {
    type: "object",
    properties: { thread_id: { type: "string", description: "Id del hilo, tal como aparece en <session_state>" } },
    required: ["thread_id"],
  },
};

export const READ_MENTOR_NOTES_TOOL: WorkflowToolDefinition = {
  name: "read_mentor_notes",
  description:
    "Lee las notas de las sesiones de mentoría del proyecto con sus respuestas e ids. Sin session_id, trae las más recientes de todas las sesiones. No incluye notas privadas de otras personas.",
  parameters: {
    type: "object",
    properties: {
      session_id: { type: "string", description: "Id de una sesión de mentoría (opcional)" },
      limit: { type: "number", description: "Cuántas notas traer como máximo (por defecto 20)" },
    },
  },
};

export const SAVE_MENTOR_NOTE_TOOL: WorkflowToolDefinition = {
  name: "save_mentor_note",
  description:
    "Crea una nota en una sesión de mentoría abierta (solo el mentor de la sesión) o, con note_id, corrige una nota que escribió esta persona. Se guarda directo.",
  parameters: {
    type: "object",
    properties: {
      note_id: { type: "string", description: "Id de la nota a editar (solo para editar)" },
      session_id: { type: "string", description: "Id de la sesión de mentoría donde crear la nota (para crear)" },
      body: { type: "string", description: "Texto de la nota (máximo 2000 caracteres)" },
      kind: {
        type: "string",
        enum: ["observation", "question", "suggestion", "agreement", "commitment", "blocker", "decision"],
        description: "Tipo de nota. Por defecto observation.",
      },
      is_private: { type: "boolean", description: "true para que solo la vea quien la escribe" },
    },
    required: ["body"],
  },
};

export const SAVE_NOTE_REPLY_TOOL: WorkflowToolDefinition = {
  name: "save_note_reply",
  description:
    "Responde una nota de mentoría (note_id) o, con reply_id, corrige una respuesta que escribió esta persona. La pueden usar el emprendedor/estudiante y el mentor. Se guarda directo.",
  parameters: {
    type: "object",
    properties: {
      note_id: { type: "string", description: "Id de la nota que se responde (para responder)" },
      reply_id: { type: "string", description: "Id de la respuesta a corregir (solo para editar)" },
      body: { type: "string", description: "Texto de la respuesta (máximo 2000 caracteres)" },
    },
    required: ["body"],
  },
};

/** Herramientas de notas de mentoría según el rol: todos leen y responden; el mentor además crea notas. */
export function noteToolsFor(role: Role): WorkflowToolDefinition[] {
  return role === "mentor" || role === "admin"
    ? [READ_MENTOR_NOTES_TOOL, SAVE_MENTOR_NOTE_TOOL, SAVE_NOTE_REPLY_TOOL]
    : [READ_MENTOR_NOTES_TOOL, SAVE_NOTE_REPLY_TOOL];
}

export const GENERATE_DOCUMENT_TOOL: WorkflowToolDefinition = {
  name: "generate_document",
  description:
    "Genera un documento descargable en PDF o Word (.docx) sobre un tema, redactado con el contexto del proyecto. Opcionalmente lo agrega al conocimiento del proyecto.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "Título del documento" },
      topic: { type: "string", description: "Tema y alcance: qué debe cubrir el documento" },
      format: { type: "string", enum: ["pdf", "docx"], description: "pdf para PDF, docx para Word. Si la persona no lo dice, pdf." },
      instructions: { type: "string", description: "Indicaciones de la persona: público, extensión, tono, secciones obligatorias" },
      add_to_project: { type: "boolean", description: "true para guardarlo también en los documentos (conocimiento) del proyecto" },
    },
    required: ["title", "topic"],
  },
};

export const ADD_DOCUMENT_TO_PROJECT_TOOL: WorkflowToolDefinition = {
  name: "add_document_to_project",
  description:
    "Agrega a los documentos (conocimiento) de un proyecto un documento que el agente YA generó en este hilo. Solo proyectos donde la persona tiene acceso; para un mentor, los que tiene asignados. Si no se indica el proyecto y la persona tiene varios, devuelve la lista para preguntarle.",
  parameters: {
    type: "object",
    properties: {
      project: { type: "string", description: "Nombre (o id) del proyecto destino. Para «este proyecto» usa el nombre del proyecto actual. Omítelo si la persona no lo dijo." },
      document_title: { type: "string", description: "Título del documento ya generado. Omítelo para el último documento del hilo." },
    },
  },
};


/** Herramientas del pivot B2B según el rol (vacías hasta que cada dev agregue las suyas). */
export function b2bToolsFor(role: Role): B2BTool[] {
  return role === "mentor" ? MENTOR_TOOLS : role === "entrepreneur" ? CLIENT_TOOLS : [];
}

/** Herramientas que ve el modelo en este turno, en el mismo orden de siempre. */
export function toolsFor(role: Role, scope: ToolScope): WorkflowToolDefinition[] {
  const b2b = scope.b2b ? b2bToolsFor(role).map((t) => t.definition) : [];
  const base = scope.field
    ? [DRAFT_FIELD_TOOL, ...RAX_WORKFLOW_TOOLS]
    : [GENERATE_DOCUMENT_TOOL, ...(scope.thread ? [ADD_DOCUMENT_TO_PROJECT_TOOL] : []), ...researchTools(), ...noteToolsFor(role), ...b2b, ...RAX_WORKFLOW_TOOLS];
  if (!scope.session) return base;
  return [SESSION_NOTES_TOOL, ...(scope.siblings ? [READ_SESSION_THREAD_TOOL] : []), ...base];
}

/** Herramienta B2B por nombre, para despacharla (solo con la bandera encendida). */
export function findB2BTool(role: Role, name: string): B2BTool | undefined {
  return b2bToolsFor(role).find((t) => t.definition.name === name);
}
