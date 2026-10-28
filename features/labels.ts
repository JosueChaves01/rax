import type {
  DiagnosisCategory,
  DiagnosisStatus,
  ExperimentStatus,
  HypothesisStatus,
  InfoType,
  InitiativeNature,
  InterviewDimension,
  MentorDecision,
  ProjectPhase,
  ResultOutcome,
  ReviewStatus,
  Role,
  SessionNoteKind,
  TaskStatus,
  Uncertainty,
} from "@/types/domain";

/** Textos visibles centralizados (es). Ningún componente define etiquetas de dominio por su cuenta. */

export const ROLE_LABEL: Record<Role, string> = {
  entrepreneur: "Emprendedor/a",
  mentor: "Mentor/a",
  admin: "Administración",
};

export const NATURE_LABEL: Record<InitiativeNature, string> = {
  exploring_idea: "Explorando una idea",
  designing_solution: "Diseñando una solución",
  operating_business: "Negocio en operación",
  unknown: "Todavía no está claro",
};

export const CATEGORY_LABEL: Record<DiagnosisCategory, string> = {
  context: "Contexto del emprendimiento",
  people_market: "Personas y mercado",
  problem: "Problemas",
  solutions: "Soluciones actuales y propuestas",
  financial: "Dimensión financiera",
  operational: "Dimensión operativa",
  commercial: "Comercial y mercadeo",
  legal: "Legal y cumplimiento",
  risk: "Riesgos e incertidumbres",
  open_question: "Preguntas abiertas",
};

export const CATEGORY_ORDER: DiagnosisCategory[] = [
  "context",
  "problem",
  "people_market",
  "solutions",
  "financial",
  "operational",
  "commercial",
  "legal",
  "risk",
  "open_question",
];

export const INFO_TYPE_LABEL: Record<InfoType, string> = {
  entrepreneur_statement: "Declaración del emprendedor",
  documented_observation: "Observación documentada",
  verifiable_evidence: "Evidencia verificable",
  ai_interpretation: "Interpretación de la IA",
  hypothesis: "Hipótesis",
  human_correction: "Corrección humana",
  unknown: "Dato desconocido",
  agreed_decision: "Decisión acordada",
};

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  proposed: "Pendiente de confirmar",
  confirmed: "Confirmado",
  corrected: "Corregido",
  rejected: "Rechazado",
  needs_clarification: "Requiere aclaración",
};

export const UNCERTAINTY_LABEL: Record<Uncertainty, string> = {
  low: "Incertidumbre baja",
  medium: "Incertidumbre media",
  high: "Incertidumbre alta",
  unknown: "Desconocido",
};

export const DIAGNOSIS_STATUS_LABEL: Record<DiagnosisStatus, string> = {
  exploring: "En exploración",
  pending_review: "Pendiente de revisión",
  reviewed: "Revisado",
  ready_for_prioritization: "Listo para priorizar",
  ready_for_experiments: "Listo para diseñar experimentos",
};

export const PHASE_LABEL: Record<ProjectPhase, string> = {
  new: "Proyecto recién creado",
  conversation: "Conversación en curso",
  summary_pending: "Resumen pendiente de confirmación",
  mentor_review_1: "Diagnóstico en revisión del mentor",
  prioritizing: "Priorizando problemas",
  hypotheses: "Hipótesis pendientes de aprobación",
  experiments_preparing: "Experimentos en preparación",
  experiments_running: "Experimentos en ejecución",
  results_review: "Resultados pendientes de revisión",
  decided: "Etapa concluida",
};

export const PHASE_ORDER: ProjectPhase[] = [
  "new",
  "conversation",
  "summary_pending",
  "mentor_review_1",
  "prioritizing",
  "hypotheses",
  "experiments_preparing",
  "experiments_running",
  "results_review",
  "decided",
];

export const HYPOTHESIS_STATUS_LABEL: Record<HypothesisStatus, string> = {
  draft: "Borrador",
  pending_approval: "Pendiente de aprobación",
  approved: "Aprobada",
  testing: "En prueba",
  supported: "Respaldada",
  weakened: "Debilitada",
  inconclusive: "Inconclusa",
  reformulated: "Reformulada",
  discarded: "Descartada",
};

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  design: "En diseño",
  ready: "Listo para iniciar",
  running: "En ejecución",
  results_pending: "Resultados por revisar",
  reviewed: "Revisado con mentor",
};

export const OUTCOME_LABEL: Record<ResultOutcome, string> = {
  positive: "Positivo",
  negative: "Negativo",
  mixed: "Mixto",
  inconclusive: "Inconcluso",
};

export const DECISION_LABEL: Record<MentorDecision, string> = {
  continue: "Continuar",
  reformulate: "Reformular",
  deepen: "Profundizar",
  pause: "Pausar",
  discard: "Descartar",
};

export const NOTE_KIND_LABEL: Record<SessionNoteKind, string> = {
  observation: "Observación",
  question: "Pregunta",
  suggestion: "Sugerencia",
  agreement: "Acuerdo",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Por hacer",
  doing: "En curso",
  done: "Hecha",
  blocked: "Bloqueada",
};

export const DIMENSION_LABEL: Record<InterviewDimension, string> = {
  nature: "Naturaleza de la iniciativa",
  stage: "Etapa actual",
  people: "Personas involucradas",
  origin: "Origen de la idea",
  problem: "Problema y comportamiento actual",
  evidence: "Evidencia",
  assumptions: "Supuestos",
  resources: "Recursos y restricciones",
  immediate_goal: "Objetivo inmediato",
};
