import type { WorkflowToolDefinition } from "../../workflow-tools";

/**
 * Definiciones (lo que ve el modelo) de las herramientas del intake. Viven aparte de su ejecución
 * para que el entrevistador (lib/ai/intake-interviewer.ts) las use sin importar los servicios.
 */

export const RECORD_INTAKE_ANSWER_TOOL: WorkflowToolDefinition = {
  name: "record_intake_answer",
  description:
    "Marca cuánto cubrió la persona una pregunta de la guía de intake del mentor: answered (respondió con claridad), partial (respondió algo pero falta) o skipped (no sabe o prefiere no responder). Úsala cada vez que una respuesta cubra una pregunta.",
  parameters: {
    type: "object",
    properties: {
      question_id: { type: "string", description: "Id de la pregunta de la guía, tal como aparece en <guide>" },
      status: { type: "string", enum: ["answered", "partial", "skipped"], description: "Cuánto quedó cubierta" },
      answer: { type: "string", description: "La respuesta de la persona resumida en una o dos frases (para el mentor)" },
    },
    required: ["question_id", "status"],
  },
};

export const FINISH_INTAKE_TOOL: WorkflowToolDefinition = {
  name: "finish_intake",
  description:
    "Avisa que la entrevista de intake ya cubrió las preguntas obligatorias (o que la persona quiere terminar). Por defecto no envía nada: la persona confirma con el botón «Enviar a mi mentor». Solo con confirmed=true, cuando la persona pidió explícitamente enviarla ya, genera el resumen y se lo envía al mentor.",
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Por qué se puede terminar, en una frase" },
      confirmed: { type: "boolean", description: "true solo si la persona pidió de forma explícita enviar su entrevista al mentor ahora" },
    },
  },
};

export const EXPLAIN_RESOURCE_TOOL: WorkflowToolDefinition = {
  name: "explain_resource",
  description:
    "Trae el contenido de un material que el mentor PUBLICÓ para la persona (guías, resúmenes de sesión, acuerdos) y el contexto del mentor (su metodología), para explicárselo con palabras simples. Sin document_id ni title devuelve la lista del material publicado. Nunca accede a documentos sin publicar.",
  parameters: {
    type: "object",
    properties: {
      document_id: { type: "string", description: "Id del material publicado, si lo conoces" },
      title: { type: "string", description: "Título (o parte del título) del material, si la persona lo nombró" },
      question: { type: "string", description: "Qué quiere entender la persona del material (opcional)" },
    },
  },
};

export const PREPARE_FOR_SESSION_TOOL: WorkflowToolDefinition = {
  name: "prepare_for_session",
  description:
    "Ayuda a la persona a prepararse para su próxima sesión con el mentor: trae la fecha y los temas de la agenda, sus compromisos pendientes, las evaluaciones que le faltan responder y el material publicado más reciente.",
  parameters: { type: "object", properties: {} },
};
