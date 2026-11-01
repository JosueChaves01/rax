import type { Action } from "@/lib/authz";

/**
 * Acciones del recorrido que el agente puede proponer desde el chat con `propose_step_action`.
 * Cada una se ejecuta con el servicio de dominio correspondiente (y sus permisos) cuando la persona
 * aplica la tarjeta: el agente nunca da un paso por su cuenta.
 */
export const STEP_ACTIONS = {
  set_summary: { permission: "diagnosis.confirm_summary", label: "Guardar el resumen del diagnóstico", needs: "text: el resumen completo" },
  confirm_summary: { permission: "diagnosis.confirm_summary", label: "Confirmar el resumen del diagnóstico", needs: "nada" },
  review_item: { permission: "diagnosis.edit", label: "Revisar un hallazgo del diagnóstico", needs: "targetId del hallazgo y decision confirm|reject" },
  request_review: { permission: "mentor.request_review", label: "Pedir revisión al mentor", needs: "kind first_review|second_review" },
  add_session_note: { permission: "mentor.note", label: "Agregar nota a la sesión", needs: "text y kind observation|question|suggestion|commitment|blocker" },
  complete_first_review: { permission: "mentor.decide", label: "Cerrar la primera revisión con el acuerdo", needs: "text: qué problema investigar y qué falta saber" },
  prioritize_problem: { permission: "diagnosis.prioritize", label: "Priorizar un problema", needs: "targetId del problema, rank (1 = primero) y text con la justificación" },
  save_agreement: { permission: "agreement.edit", label: "Guardar el acuerdo de mentoría", needs: "scope, frequency, sessionDurationMinutes, expectedDurationWeeks, mentorCommitments, entrepreneurCommitments" },
  confirm_agreement: { permission: "agreement.confirm", label: "Confirmar el acuerdo de mentoría", needs: "targetId opcional del acuerdo" },
  submit_hypothesis: { permission: "hypothesis.propose", label: "Enviar la hipótesis a aprobación del mentor", needs: "targetId de la hipótesis en borrador" },
  decide_hypothesis: { permission: "hypothesis.approve", label: "Decidir sobre una hipótesis", needs: "targetId y decision approve|return|discard" },
  start_experiment: { permission: "experiment.start", label: "Iniciar el experimento", needs: "targetId del experimento" },
  add_evidence: { permission: "evidence.add", label: "Registrar evidencia", needs: "title, text y url opcional" },
  set_task_status: { permission: "task.manage", label: "Cambiar el estado de una tarea", needs: "targetId de la tarea y status todo|doing|done|blocked" },
  record_result: { permission: "experiment.record_result", label: "Registrar el resultado del experimento", needs: "targetId, outcome positive|negative|mixed|inconclusive, text (lo observado), metricValue, learnings, limitations" },
  mentor_decision: { permission: "mentor.decide", label: "Registrar la decisión de la segunda revisión", needs: "targetId de la hipótesis, decision continue|reformulate|deepen|pause|discard y text con la justificación" },
  schedule_session: { permission: "mentorship.manage", label: "Agendar una sesión de seguimiento", needs: "scheduledAt (YYYY-MM-DD o ISO)" },
  complete_session: { permission: "mentor.decide", label: "Cerrar una sesión de seguimiento", needs: "targetId de la sesión y text con el resumen" },
  delete_project: { permission: "project.delete", label: "Borrar el proyecto", needs: "text con el motivo. Solo si la persona dueña lo pide de forma explícita (p. ej. lo creó por error); es definitivo para todos" },
  evaluate_cycle: { permission: "cycle.evaluate", label: "Registrar la evaluación del ciclo", needs: "decision renew|close|new_stage, autonomy nascent|developing|autonomous y text con la valoración" },
} as const satisfies Record<string, { permission: Action; label: string; needs: string }>;

export type StepActionId = keyof typeof STEP_ACTIONS;

export const STEP_ACTION_IDS = Object.keys(STEP_ACTIONS) as StepActionId[];

export const isStepAction = (x: unknown): x is StepActionId => typeof x === "string" && x in STEP_ACTIONS;

/** Parámetros que acepta una acción. Todos opcionales: cada acción valida los suyos al aplicarse. */
export interface StepActionParams {
  action: StepActionId;
  targetId?: string;
  text?: string;
  kind?: string;
  decision?: string;
  rank?: number;
  outcome?: string;
  metricValue?: string;
  learnings?: string;
  limitations?: string;
  title?: string;
  url?: string;
  status?: string;
  scope?: string;
  frequency?: string;
  sessionDurationMinutes?: number;
  expectedDurationWeeks?: number;
  mentorCommitments?: string;
  entrepreneurCommitments?: string;
  scheduledAt?: string;
  autonomy?: string;
  nextCycleFocus?: string;
}

const STRING_KEYS = [
  "targetId", "text", "kind", "decision", "outcome", "metricValue", "learnings", "limitations", "title", "url", "status",
  "scope", "frequency", "mentorCommitments", "entrepreneurCommitments", "scheduledAt", "autonomy", "nextCycleFocus",
] as const;
const NUMBER_KEYS = ["rank", "sessionDurationMinutes", "expectedDurationWeeks"] as const;

/** Normaliza lo que venga del modelo o de una tarjeta: solo claves conocidas y tipos correctos. */
export function parseStepParams(raw: Record<string, unknown> | undefined): StepActionParams | null {
  if (!raw || !isStepAction(raw.action)) return null;
  const out: StepActionParams = { action: raw.action };
  for (const k of STRING_KEYS) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 4000);
  }
  for (const k of NUMBER_KEYS) {
    const v = typeof raw[k] === "string" ? Number(raw[k]) : raw[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

const DECISION_WORD: Record<string, string> = {
  approve: "Aprobar", return: "Devolver al borrador", discard: "Descartar",
  continue: "Continuar", reformulate: "Reformular", deepen: "Profundizar", pause: "Pausar",
  renew: "Renovar", close: "Cerrar", new_stage: "Pasar a una nueva etapa",
};

/** Título legible de la tarjeta. */
export function stepActionTitle(p: StepActionParams): string {
  const base = STEP_ACTIONS[p.action].label;
  switch (p.action) {
    case "request_review":
      return p.kind === "second_review" ? "Pedir la segunda revisión al mentor" : "Pedir la primera revisión al mentor";
    case "decide_hypothesis":
    case "mentor_decision":
    case "evaluate_cycle":
      return p.decision ? `${base}: ${DECISION_WORD[p.decision] ?? p.decision}` : base;
    case "review_item":
      return p.decision === "reject" ? "Descartar un hallazgo del diagnóstico" : "Confirmar un hallazgo del diagnóstico";
    case "set_task_status":
      return p.status === "done" ? "Marcar la tarea como hecha" : `${base} (${p.status ?? "?"})`;
    case "add_evidence":
      return p.title ? `Registrar evidencia: ${p.title}` : base;
    default:
      return base;
  }
}

/** Etiqueta corta de cada tipo de propuesta para las tarjetas del chat. */
export const PROPOSAL_TYPE_LABEL: Record<string, string> = {
  task: "tarea",
  diagnosis_item: "diagnóstico",
  hypothesis: "hipótesis",
  experiment: "experimento",
  goal: "objetivo",
  recommendation: "recurso",
  intervention: "intervención",
  agenda_topic: "agenda",
  field_value: "borrador",
  flow_action: "siguiente paso",
};
