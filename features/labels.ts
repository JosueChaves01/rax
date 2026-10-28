import type {
  EntrepreneurGoal,
  ExperienceBand,
  Expertise,
  MentorStatus,
  WeeklyHours,
  Project,
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

export const PROJECT_STATUS_LABEL: Record<Project["status"], string> = {
  active: "Activo",
  paused: "En pausa",
  archived: "Archivado",
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

/* ── Onboarding ── */

export const GOAL_LABEL: Record<EntrepreneurGoal, string> = {
  order_idea: "Ordenar mi idea y lo que sé",
  what_to_test: "Saber qué probar primero",
  find_mentor: "Que un mentor me acompañe",
  first_customers: "Conseguir mis primeros clientes",
  prepare_funding: "Prepararme para buscar financiamiento",
};

export const WEEKLY_HOURS_LABEL: Record<WeeklyHours, string> = {
  lt2: "Menos de 2 horas",
  "2to5": "Entre 2 y 5 horas",
  "5to10": "Entre 5 y 10 horas",
  gt10: "Más de 10 horas",
};

export const EXPERTISE_LABEL: Record<Expertise, string> = {
  strategy: "Estrategia y modelo de negocio",
  finance: "Finanzas y costos",
  marketing_sales: "Marketing y ventas",
  product: "Producto y experiencia",
  operations: "Operaciones y logística",
  legal: "Legal y permisos",
  technology: "Tecnología",
  social_impact: "Impacto social y ambiental",
};

export const EXPERIENCE_LABEL: Record<ExperienceBand, string> = {
  lt3: "Menos de 3 años",
  "3to7": "Entre 3 y 7 años",
  "8to15": "Entre 8 y 15 años",
  gt15: "Más de 15 años",
};

export const MENTOR_STATUS_LABEL: Record<MentorStatus, string> = {
  none: "—",
  pending: "Solicitud pendiente",
  approved: "Aprobado",
  rejected: "No aprobada",
};
