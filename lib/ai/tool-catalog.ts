/**
 * Catálogo de las herramientas del agente tal como las ve la persona en el asistente (/app/chat).
 *
 * Cada entrada agrupa una o varias herramientas reales del agente (`tools`, los nombres que usa
 * lib/ai/claude-orchestrator.ts, research-tools.ts y workflow-tools.ts) y describe el formulario con el
 * que la persona da el contexto. El formulario arma un mensaje en lenguaje natural que se envía al
 * agente junto con `requestedTool`, para que use esa herramienta en ese turno.
 *
 * Sin «server-only»: lo usan el panel del navegador y las pruebas. Si se agrega o cambia una
 * herramienta del agente, actualiza también esta lista.
 */

export type ToolboxRole = "entrepreneur" | "mentor" | "admin";

export type ToolCategoryId = "research" | "documents" | "create" | "session" | "mentoring" | "journey";

export const TOOL_CATEGORIES: Array<{ id: ToolCategoryId; label: string; hint: string }> = [
  { id: "research", label: "Investigar", hint: "Información actual de internet" },
  { id: "documents", label: "Documentos del proyecto", hint: "Lo que subiste: PDF, Word, Excel, CSV" },
  { id: "create", label: "Crear", hint: "Documentos descargables" },
  { id: "session", label: "Esta sesión", hint: "Notas y otros hilos de la sesión" },
  { id: "mentoring", label: "Mentoría", hint: "Notas, revisiones y sesiones con el mentor" },
  { id: "journey", label: "Recorrido del proyecto", hint: "Diagnóstico, hipótesis, tareas y métricas" },
];

/** De dónde salen las opciones de un selector. */
export type ToolPicker = "document" | "table" | "mentor_session" | "open_mentor_session" | "unconfirmed_mentor_session" | "project" | "thread_document" | "sibling_thread";

export type ToolField =
  | { key: string; label: string; kind: "text" | "textarea" | "url"; placeholder?: string; required?: boolean; help?: string }
  | { key: string; label: string; kind: "select"; options: Array<{ value: string; label: string }>; required?: boolean; help?: string }
  | { key: string; label: string; kind: "datetime"; required?: boolean; help?: string }
  | { key: string; label: string; kind: "picker"; picker: ToolPicker; required?: boolean; emptyLabel?: string; help?: string };

/** Lo que el panel sabe para decidir si una herramienta se puede usar ahora. */
export type ToolRequirement = "web_search" | "thread_document" | "sibling_thread" | "mentor_session" | "open_mentor_session" | "unconfirmed_mentor_session" | "document" | "table";

export interface ToolPromptInput {
  /** Valor de cada campo (para selectores, el id elegido). */
  values: Record<string, string>;
  /** Nombre visible de lo elegido en cada selector (título del documento, nombre de la sesión…). */
  labels: Record<string, string>;
}

export interface ToolCatalogEntry {
  id: string;
  /** Herramientas reales del agente que cubre esta entrada. */
  tools: string[];
  /** La que se le pide usar al agente. */
  primaryTool: string;
  category: ToolCategoryId;
  icon: string;
  title: string;
  description: string;
  /** Solo para estos roles; sin valor, para todos. */
  roles?: ToolboxRole[];
  requires?: ToolRequirement[];
  fields: ToolField[];
  /** Arma el mensaje para el agente. Debe leerse natural: la persona lo ve en el chat. */
  prompt: (input: ToolPromptInput) => string;
}

const clean = (v: string | undefined) => (v ?? "").replace(/\s+\n/g, "\n").trim();
const opt = (v: string | undefined, render: (x: string) => string) => (clean(v) ? render(clean(v)) : "");
const join = (...parts: string[]) => parts.filter(Boolean).join(" ");

/** «2026-11-05T15:00» (datetime-local) → «miércoles 5 de noviembre a las 15:00» en hora de Costa Rica. */
export function readableDateTime(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return local;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, 12));
  const day = date.toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return `${day} a las ${h}:${mi}`;
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  /* ── Investigar ── */
  {
    id: "web_search",
    tools: ["web_search", "read_web_page"],
    primaryTool: "web_search",
    category: "research",
    icon: "🔎",
    title: "Buscar en internet",
    description: "Competidores, precios, tamaño de mercado, regulaciones o proveedores, con las fuentes citadas.",
    requires: ["web_search"],
    fields: [
      { key: "query", label: "¿Qué buscamos?", kind: "text", required: true, placeholder: "Precio del café de especialidad 250 g en Costa Rica 2026" },
      { key: "goal", label: "¿Para qué lo necesitas? (opcional)", kind: "textarea", placeholder: "Quiero fijar el precio de lanzamiento" },
    ],
    prompt: ({ values }) =>
      join(
        `Busca en internet: «${clean(values.query)}».`,
        opt(values.goal, (g) => `Lo necesito para: ${g}.`),
        "Resume lo más útil para el proyecto y cita las fuentes con sus enlaces.",
      ),
  },
  {
    id: "read_web_page",
    tools: ["read_web_page"],
    primaryTool: "read_web_page",
    category: "research",
    icon: "🌐",
    title: "Leer una página web",
    description: "Lee una página pública o un PDF en línea y te dice lo que importa.",
    requires: ["web_search"],
    fields: [
      { key: "url", label: "Enlace", kind: "url", required: true, placeholder: "https://…" },
      { key: "question", label: "¿Qué quieres saber de ella? (opcional)", kind: "textarea", placeholder: "Requisitos para registrar la marca" },
    ],
    prompt: ({ values }) =>
      join(`Lee esta página: ${clean(values.url)}.`, opt(values.question, (q) => `Quiero saber: ${q}.`) || "Resúmeme lo que sirve para el proyecto."),
  },

  /* ── Documentos del proyecto ── */
  {
    id: "read_project_document",
    tools: ["read_project_document"],
    primaryTool: "read_project_document",
    category: "documents",
    icon: "📄",
    title: "Leer un documento",
    description: "Lee completo un archivo que subiste al proyecto y responde sobre él.",
    requires: ["document"],
    fields: [
      { key: "document", label: "Documento", kind: "picker", picker: "document", required: true },
      { key: "question", label: "¿Qué quieres saber? (opcional)", kind: "textarea", placeholder: "Los compromisos que quedaron con el proveedor" },
    ],
    prompt: ({ values, labels }) =>
      join(`Lee el documento «${labels.document ?? values.document}» del proyecto.`, opt(values.question, (q) => `Quiero saber: ${q}.`) || "Resúmelo y dime qué implica para el proyecto."),
  },
  {
    id: "analyze_table_data",
    tools: ["analyze_table_data"],
    primaryTool: "analyze_table_data",
    category: "documents",
    icon: "📊",
    title: "Calcular sobre un Excel o CSV",
    description: "Totales, promedios y agrupaciones exactas sobre una tabla que subiste.",
    requires: ["table"],
    fields: [
      { key: "document", label: "Archivo con la tabla", kind: "picker", picker: "table", required: true },
      { key: "question", label: "¿Qué calculamos?", kind: "textarea", required: true, placeholder: "Total de ventas por producto en octubre" },
    ],
    prompt: ({ values, labels }) => `Con los datos de «${labels.document ?? values.document}», calcula: ${clean(values.question)}. Dame los números exactos y qué significan.`,
  },

  /* ── Crear ── */
  {
    id: "generate_document",
    tools: ["generate_document"],
    primaryTool: "generate_document",
    category: "create",
    icon: "📝",
    title: "Generar un PDF o Word",
    description: "Redacta un documento con el contexto del proyecto, listo para descargar.",
    fields: [
      { key: "title", label: "Título", kind: "text", required: true, placeholder: "Plan de validación del primer mes" },
      { key: "topic", label: "¿Qué debe cubrir?", kind: "textarea", required: true, placeholder: "Objetivos, experimentos, calendario y métricas" },
      {
        key: "format",
        label: "Formato",
        kind: "select",
        options: [
          { value: "pdf", label: "PDF" },
          { value: "docx", label: "Word (.docx)" },
        ],
      },
      {
        key: "save",
        label: "¿Guardarlo en el proyecto?",
        kind: "select",
        options: [
          { value: "no", label: "No, solo descargarlo" },
          { value: "yes", label: "Sí, agregarlo a los documentos" },
        ],
      },
      { key: "instructions", label: "Indicaciones (opcional)", kind: "textarea", placeholder: "Para mi mentor, máximo 2 páginas, tono formal" },
    ],
    prompt: ({ values }) =>
      join(
        `Genera un documento en ${values.format === "docx" ? "Word" : "PDF"} titulado «${clean(values.title)}» que cubra: ${clean(values.topic)}.`,
        opt(values.instructions, (i) => `Indicaciones: ${i}.`),
        values.save === "yes" ? "Agrégalo también a los documentos del proyecto." : "",
      ),
  },
  {
    id: "add_document_to_project",
    tools: ["add_document_to_project"],
    primaryTool: "add_document_to_project",
    category: "create",
    icon: "📎",
    title: "Guardar un documento en un proyecto",
    description: "Agrega un documento que el agente ya generó en este hilo a los documentos de un proyecto.",
    requires: ["thread_document"],
    fields: [
      { key: "document", label: "Documento generado", kind: "picker", picker: "thread_document", required: true },
      { key: "project", label: "Proyecto destino", kind: "picker", picker: "project", required: true },
    ],
    prompt: ({ values, labels }) => `Agrega el documento «${labels.document ?? values.document}» a los documentos del proyecto «${labels.project ?? values.project}».`,
  },

  /* ── Esta sesión ── */
  {
    id: "update_session_notes",
    tools: ["update_session_notes"],
    primaryTool: "update_session_notes",
    category: "session",
    icon: "🗒️",
    title: "Anotar en la sesión",
    description: "Guarda una decisión, una pregunta abierta o un próximo paso en las notas de la sesión.",
    fields: [
      {
        key: "kind",
        label: "¿Qué es?",
        kind: "select",
        options: [
          { value: "decision", label: "Una decisión" },
          { value: "question", label: "Una pregunta abierta" },
          { value: "next", label: "Un próximo paso" },
          { value: "summary", label: "Resumir la sesión hasta ahora" },
        ],
      },
      { key: "text", label: "Texto", kind: "textarea", placeholder: "Vamos a probar primero con cafeterías de Escazú" },
    ],
    prompt: ({ values }) => {
      const text = clean(values.text);
      switch (values.kind) {
        case "question":
          return `Anota en las notas de esta sesión esta pregunta abierta: «${text}».`;
        case "next":
          return `Agrega a los próximos pasos de esta sesión: «${text}».`;
        case "summary":
          return join("Resume lo que llevamos en esta sesión y actualiza sus notas con las decisiones, preguntas abiertas y próximos pasos.", opt(text, (t) => `Ten en cuenta: ${t}.`));
        default:
          return `Anota en las notas de esta sesión esta decisión: «${text}».`;
      }
    },
  },
  {
    id: "read_session_thread",
    tools: ["read_session_thread"],
    primaryTool: "read_session_thread",
    category: "session",
    icon: "🧵",
    title: "Traer lo de otro hilo",
    description: "Lee otro hilo de esta sesión para continuar desde ahí.",
    requires: ["sibling_thread"],
    fields: [
      { key: "thread", label: "Hilo", kind: "picker", picker: "sibling_thread", required: true },
      { key: "question", label: "¿Qué necesitas de ahí? (opcional)", kind: "textarea", placeholder: "Las cifras que calculamos" },
    ],
    prompt: ({ values, labels }) =>
      join(`Lee el hilo «${labels.thread ?? values.thread}» de esta sesión (id ${values.thread}).`, opt(values.question, (q) => `Necesito: ${q}.`) || "Resume lo que se concluyó ahí."),
  },

  /* ── Mentoría ── */
  {
    id: "read_mentor_notes",
    tools: ["read_mentor_notes"],
    primaryTool: "read_mentor_notes",
    category: "mentoring",
    icon: "💬",
    title: "Leer las notas de mentoría",
    description: "Revisa lo que se anotó en las sesiones con el mentor y sus respuestas.",
    requires: ["mentor_session"],
    fields: [
      { key: "session", label: "Sesión", kind: "picker", picker: "mentor_session", emptyLabel: "Todas las sesiones" },
      { key: "question", label: "¿Qué buscas? (opcional)", kind: "textarea", placeholder: "Los compromisos que quedaron pendientes" },
    ],
    prompt: ({ values, labels }) =>
      join(
        values.session ? `Lee las notas de mentoría de la sesión «${labels.session}» (id ${values.session}).` : "Lee las notas de mentoría más recientes del proyecto.",
        opt(values.question, (q) => `Busco: ${q}.`) || "Resúmeme lo importante y lo que quedó pendiente.",
      ),
  },
  {
    id: "save_mentor_note",
    tools: ["save_mentor_note"],
    primaryTool: "save_mentor_note",
    category: "mentoring",
    icon: "✍️",
    title: "Escribir una nota de sesión",
    description: "Agrega una nota a una sesión de mentoría abierta que diriges.",
    roles: ["mentor", "admin"],
    requires: ["open_mentor_session"],
    fields: [
      { key: "session", label: "Sesión", kind: "picker", picker: "open_mentor_session", required: true },
      {
        key: "kind",
        label: "Tipo",
        kind: "select",
        options: [
          { value: "observation", label: "Observación" },
          { value: "suggestion", label: "Sugerencia" },
          { value: "question", label: "Pregunta" },
          { value: "agreement", label: "Acuerdo" },
          { value: "commitment", label: "Compromiso" },
          { value: "blocker", label: "Bloqueo" },
          { value: "decision", label: "Decisión" },
        ],
      },
      { key: "body", label: "Nota", kind: "textarea", required: true, placeholder: "Antes de la próxima sesión, entrevistar a 5 cafeterías" },
      {
        key: "private",
        label: "Visibilidad",
        kind: "select",
        options: [
          { value: "no", label: "Visible para el emprendedor" },
          { value: "yes", label: "Privada (solo yo)" },
        ],
      },
    ],
    prompt: ({ values, labels }) => {
      const kind = TOOL_CATALOG_NOTE_KIND[values.kind] ?? "observación";
      return `Guarda esta ${kind} como nota${values.private === "yes" ? " privada" : ""} en la sesión «${labels.session}» (id ${values.session}): «${clean(values.body)}».`;
    },
  },
  {
    id: "save_note_reply",
    tools: ["save_note_reply", "read_mentor_notes"],
    primaryTool: "save_note_reply",
    category: "mentoring",
    icon: "↩️",
    title: "Responder una nota",
    description: "Contesta una nota de mentoría: el agente la busca y guarda tu respuesta.",
    requires: ["mentor_session"],
    fields: [
      { key: "session", label: "Sesión", kind: "picker", picker: "mentor_session", emptyLabel: "No sé / cualquiera" },
      { key: "note", label: "¿Qué nota?", kind: "text", required: true, placeholder: "La de entrevistar cafeterías" },
      { key: "body", label: "Tu respuesta", kind: "textarea", required: true, placeholder: "Ya entrevisté a 3; el viernes hago las otras 2" },
    ],
    prompt: ({ values, labels }) =>
      join(
        `Busca la nota de mentoría sobre «${clean(values.note)}»`,
        values.session ? `en la sesión «${labels.session}» (id ${values.session})` : "",
        `y respóndela con: «${clean(values.body)}».`,
      ),
  },
  {
    id: "request_review",
    tools: ["propose_step_action"],
    primaryTool: "propose_step_action",
    category: "mentoring",
    icon: "📅",
    title: "Pedir una revisión al mentor",
    description: "Propone fecha y hora para la primera o segunda revisión; tu mentor la confirma.",
    roles: ["entrepreneur"],
    fields: [
      {
        key: "kind",
        label: "Revisión",
        kind: "select",
        options: [
          { value: "first_review", label: "Primera revisión" },
          { value: "second_review", label: "Segunda revisión" },
        ],
      },
      { key: "when", label: "Fecha y hora (Costa Rica)", kind: "datetime", required: true },
    ],
    prompt: ({ values }) =>
      `Pide la ${values.kind === "second_review" ? "segunda" : "primera"} revisión a mi mentor para el ${readableDateTime(values.when)} (hora de Costa Rica). Prepárame la tarjeta para enviarla.`,
  },
  {
    id: "schedule_session",
    tools: ["propose_step_action"],
    primaryTool: "propose_step_action",
    category: "mentoring",
    icon: "📅",
    title: "Agendar una sesión de seguimiento",
    description: "Propone la tarjeta para agendar la próxima sesión con fecha y hora.",
    roles: ["mentor", "admin"],
    fields: [
      { key: "when", label: "Fecha y hora (Costa Rica)", kind: "datetime", required: true },
      { key: "focus", label: "Foco de la sesión (opcional)", kind: "textarea", placeholder: "Revisar resultados del experimento de precio" },
    ],
    prompt: ({ values }) =>
      join(`Agenda una sesión de seguimiento para el ${readableDateTime(values.when)} (hora de Costa Rica).`, opt(values.focus, (f) => `El foco será: ${f}.`), "Prepárame la tarjeta para confirmarla."),
  },
  {
    id: "confirm_session",
    tools: ["propose_step_action"],
    primaryTool: "propose_step_action",
    category: "mentoring",
    icon: "✅",
    title: "Confirmar una revisión pedida",
    description: "Confirma la fecha que pidió el emprendedor o propone otra.",
    roles: ["mentor", "admin"],
    requires: ["unconfirmed_mentor_session"],
    fields: [
      { key: "session", label: "Sesión", kind: "picker", picker: "unconfirmed_mentor_session", required: true },
      { key: "when", label: "Otra fecha y hora (opcional)", kind: "datetime", help: "Déjalo vacío para confirmar la fecha pedida." },
    ],
    prompt: ({ values, labels }) =>
      values.when
        ? `Confirma la sesión «${labels.session}» (id ${values.session}) pero para el ${readableDateTime(values.when)} (hora de Costa Rica). Prepárame la tarjeta.`
        : `Confirma la fecha pedida para la sesión «${labels.session}» (id ${values.session}). Prepárame la tarjeta.`,
  },
  {
    id: "generate_mentor_briefing",
    tools: ["generate_mentor_briefing"],
    primaryTool: "generate_mentor_briefing",
    category: "mentoring",
    icon: "🧭",
    title: "Preparar la próxima sesión",
    description: "Temas clave, puntos ciegos y preguntas para aprovechar la sesión.",
    fields: [{ key: "focus", label: "¿Algo en particular? (opcional)", kind: "textarea", placeholder: "Quiero hablar del precio" }],
    prompt: ({ values }) => join("Prepara el briefing de la próxima sesión de mentoría: temas clave, puntos ciegos y preguntas sugeridas.", opt(values.focus, (f) => `Quiero enfocarme en: ${f}.`)),
  },
  {
    id: "synthesize_session",
    tools: ["synthesize_session"],
    primaryTool: "synthesize_session",
    category: "mentoring",
    icon: "🧾",
    title: "Sintetizar una sesión",
    description: "Convierte lo que pasó en una sesión en acuerdos y próximos pasos.",
    fields: [{ key: "notes", label: "¿Qué pasó en la sesión?", kind: "textarea", required: true, placeholder: "Hablamos de… acordamos… quedó pendiente…" }],
    prompt: ({ values }) => `Sintetiza esta sesión de mentoría en acuerdos clave y próximos pasos: ${clean(values.notes)}`,
  },
  {
    id: "evaluate_mentorship_cycle",
    tools: ["evaluate_mentorship_cycle", "propose_step_action"],
    primaryTool: "evaluate_mentorship_cycle",
    category: "mentoring",
    icon: "🏁",
    title: "Evaluar el ciclo",
    description: "Cumplimiento de metas, madurez y si conviene renovar, cerrar o pasar de etapa.",
    roles: ["mentor", "admin"],
    fields: [{ key: "view", label: "Tu valoración (opcional)", kind: "textarea", placeholder: "Avanzó mucho en validación, le falta autonomía en ventas" }],
    prompt: ({ values }) => join("Evalúa el ciclo de mentoría de este proyecto: metas cumplidas, madurez, autonomía y si conviene renovar, cerrar o pasar a otra etapa.", opt(values.view, (v) => `Mi valoración: ${v}.`)),
  },

  /* ── Recorrido del proyecto ── */
  {
    id: "next_step",
    tools: ["propose_step_action"],
    primaryTool: "propose_step_action",
    category: "journey",
    icon: "➡️",
    title: "Dar el siguiente paso",
    description: "El agente mira en qué paso va el proyecto y te prepara la tarjeta para avanzar.",
    fields: [{ key: "context", label: "Contexto (opcional)", kind: "textarea", placeholder: "Ya terminé las entrevistas" }],
    prompt: ({ values }) => join("¿Cuál es el siguiente paso del recorrido de este proyecto? Propónmelo como tarjeta para aplicarlo.", opt(values.context, (c) => `Contexto: ${c}.`)),
  },
  {
    id: "query_project_metrics",
    tools: ["query_project_metrics"],
    primaryTool: "query_project_metrics",
    category: "journey",
    icon: "📈",
    title: "Ver cómo va el proyecto",
    description: "Tareas, hipótesis, experimentos y sesiones en números.",
    fields: [],
    prompt: () => "Consulta las métricas del proyecto (tareas, hipótesis, experimentos y sesiones) y dime cómo vamos y qué me preocuparía.",
  },
  {
    id: "extract_diagnosis_items",
    tools: ["extract_diagnosis_items"],
    primaryTool: "extract_diagnosis_items",
    category: "journey",
    icon: "🩺",
    title: "Agregar al diagnóstico",
    description: "Convierte lo que sabes en hallazgos, supuestos o preguntas del diagnóstico.",
    fields: [{ key: "text", label: "¿Qué sabes o supones?", kind: "textarea", required: true, placeholder: "Las cafeterías compran a 2 proveedores y pagan a 30 días…" }],
    prompt: ({ values }) => `Agrega al diagnóstico del proyecto los hallazgos, supuestos y preguntas abiertas que salen de esto: ${clean(values.text)}`,
  },
  {
    id: "design_experiment",
    tools: ["design_experiment"],
    primaryTool: "design_experiment",
    category: "journey",
    icon: "🧪",
    title: "Hipótesis o experimento",
    description: "Formula una hipótesis comprobable o diseña el experimento de una ya aprobada.",
    roles: ["entrepreneur"],
    fields: [
      {
        key: "mode",
        label: "¿Qué necesitas?",
        kind: "select",
        options: [
          { value: "hypothesis", label: "Formular una hipótesis" },
          { value: "experiment", label: "Diseñar el experimento de la hipótesis aprobada" },
        ],
      },
      { key: "idea", label: "Idea o duda (opcional)", kind: "textarea", placeholder: "Creo que las cafeterías pagarían más por entrega semanal" },
    ],
    prompt: ({ values }) =>
      values.mode === "experiment"
        ? join("Diseña el experimento de la hipótesis aprobada, con métrica y criterios de éxito y descarte fijados antes de empezar.", opt(values.idea, (i) => `Ten en cuenta: ${i}.`))
        : join("Ayúdame a formular una hipótesis comprobable para este proyecto.", opt(values.idea, (i) => `Mi idea: ${i}.`)),
  },
  {
    id: "propose_tasks",
    tools: ["propose_tasks", "propose_goals"],
    primaryTool: "propose_tasks",
    category: "journey",
    icon: "✔️",
    title: "Proponer tareas o metas",
    description: "Un plan de acción con tareas priorizadas o metas observables.",
    fields: [
      {
        key: "mode",
        label: "¿Qué quieres?",
        kind: "select",
        options: [
          { value: "tasks", label: "Tareas para esta semana" },
          { value: "goals", label: "Metas del ciclo" },
        ],
      },
      { key: "focus", label: "Objetivo (opcional)", kind: "textarea", placeholder: "Conseguir los primeros 3 clientes" },
    ],
    prompt: ({ values }) =>
      values.mode === "goals"
        ? join("Propón metas observables para este ciclo.", opt(values.focus, (f) => `El objetivo es: ${f}.`))
        : join("Propón tareas prioritarias con fecha límite para esta semana.", opt(values.focus, (f) => `El objetivo es: ${f}.`)),
  },
  {
    id: "diagnose_task_delays",
    tools: ["diagnose_task_delays"],
    primaryTool: "diagnose_task_delays",
    category: "journey",
    icon: "⏱️",
    title: "Revisar tareas atrasadas",
    description: "Por qué se atrasan las tareas y qué hacer al respecto.",
    fields: [],
    prompt: () => "Revisa las tareas atrasadas o bloqueadas del proyecto, dime la causa principal y qué acción propones.",
  },
  {
    id: "recommend_resources",
    tools: ["recommend_resources"],
    primaryTool: "recommend_resources",
    category: "journey",
    icon: "📚",
    title: "Recomendar recursos",
    description: "Guías y plantillas de RAX según la etapa del proyecto.",
    fields: [{ key: "topic", label: "Tema", kind: "text", required: true, placeholder: "Cómo hacer entrevistas de problema" }],
    prompt: ({ values }) => `Recomiéndame recursos y plantillas de RAX sobre: ${clean(values.topic)}.`,
  },
];

const TOOL_CATALOG_NOTE_KIND: Record<string, string> = {
  observation: "observación",
  suggestion: "sugerencia",
  question: "pregunta",
  agreement: "acuerdo",
  commitment: "compromiso",
  blocker: "nota de bloqueo",
  decision: "decisión",
};

/** Nombres de herramientas que se le puede pedir al agente desde el panel. */
export const REQUESTABLE_TOOLS = new Set(TOOL_CATALOG.map((t) => t.primaryTool));

export function catalogFor(role: ToolboxRole): ToolCatalogEntry[] {
  return TOOL_CATALOG.filter((t) => !t.roles || t.roles.includes(role));
}

/** Faltan campos obligatorios: devuelve sus etiquetas. */
export function missingFields(entry: ToolCatalogEntry, values: Record<string, string>): string[] {
  return entry.fields.filter((f) => f.required && !clean(values[f.key])).map((f) => f.label);
}
