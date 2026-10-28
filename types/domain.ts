/**
 * Contratos de dominio compartidos de RAX (Fase Cero).
 * Cada estado vive en su propio campo: revisión ≠ incertidumbre ≠ fase del proyecto.
 * Ver docs/domain-model.md.
 */

export type Id = string;
export type ISODate = string;

/* ───────────── Personas y permisos ───────────── */

export type Role = "entrepreneur" | "mentor" | "admin";

export interface Profile {
  id: Id;
  name: string;
  email: string;
  role: Role;
  createdAt: ISODate;
}

export type ProjectMemberRole = "owner" | "collaborator";

export interface ProjectMember {
  projectId: Id;
  profileId: Id;
  role: ProjectMemberRole;
  createdAt: ISODate;
}

export type MentorAssignmentStatus = "active" | "revoked";

export interface MentorAssignment {
  id: Id;
  projectId: Id;
  mentorId: Id;
  status: MentorAssignmentStatus;
  assignedBy: Id;
  createdAt: ISODate;
  revokedAt?: ISODate;
}

/* ───────────── Proyecto ───────────── */

/** Fase del recorrido de Fase Cero. Se deriva de datos del dominio (ver features/projects/phase.ts). */
export type ProjectPhase =
  | "new"
  | "conversation"
  | "summary_pending"
  | "mentor_review_1"
  | "prioritizing"
  | "hypotheses"
  | "experiments_preparing"
  | "experiments_running"
  | "results_review"
  | "decided";

/** Estado operativo, independiente de la fase. */
export type ProjectStatus = "active" | "paused" | "archived";

export type InitiativeNature = "exploring_idea" | "designing_solution" | "operating_business" | "unknown";

export interface Project {
  id: Id;
  ownerId: Id;
  name: string;
  description: string;
  nature: InitiativeNature;
  status: ProjectStatus;
  /** Marca explícita: los proyectos de demostración nunca se mezclan con datos reales. */
  isDemo: boolean;
  /** Control del emprendedor: el mentor ve la conversación completa solo si se comparte explícitamente. */
  shareConversationWithMentor: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ───────────── Conversación ───────────── */

export type MessageAuthor = "entrepreneur" | "assistant" | "system";

/** Dimensiones de cobertura de la entrevista inicial (guía, no cuestionario). */
export type InterviewDimension =
  | "nature"
  | "stage"
  | "people"
  | "origin"
  | "problem"
  | "evidence"
  | "assumptions"
  | "resources"
  | "immediate_goal";

export interface Conversation {
  id: Id;
  projectId: Id;
  createdAt: ISODate;
}

export interface Message {
  id: Id;
  conversationId: Id;
  projectId: Id;
  author: MessageAuthor;
  authorId?: Id;
  content: string;
  /** Proveedor que generó el mensaje del asistente: nunca se presenta una simulación como modelo real. */
  provider?: "simulated" | "openrouter";
  /** Dimensión que la pregunta del asistente intenta cubrir. */
  dimension?: InterviewDimension;
  createdAt: ISODate;
}

/* ───────────── Diagnóstico ───────────── */

export type DiagnosisStatus =
  | "exploring"
  | "pending_review"
  | "reviewed"
  | "ready_for_prioritization"
  | "ready_for_experiments";

export interface Diagnosis {
  id: Id;
  projectId: Id;
  status: DiagnosisStatus;
  /** Resumen inicial editable que el emprendedor confirma o corrige. */
  summary?: string;
  summaryConfirmedAt?: ISODate;
  summaryConfirmedBy?: Id;
  updatedAt: ISODate;
}

export type DiagnosisCategory =
  | "context"
  | "people_market"
  | "problem"
  | "solutions"
  | "financial"
  | "operational"
  | "commercial"
  | "legal"
  | "risk"
  | "open_question";

/** Tipo de información: qué clase de afirmación es. */
export type InfoType =
  | "entrepreneur_statement"
  | "documented_observation"
  | "verifiable_evidence"
  | "ai_interpretation"
  | "hypothesis"
  | "human_correction"
  | "unknown"
  | "agreed_decision";

/** Estado de revisión humana del elemento. */
export type ReviewStatus = "proposed" | "confirmed" | "corrected" | "rejected" | "needs_clarification";

/** Grado de incertidumbre. "unknown" = dato desconocido, válido como información. */
export type Uncertainty = "low" | "medium" | "high" | "unknown";

export type SourceKind = "conversation" | "entrepreneur_edit" | "mentor" | "ai" | "evidence" | "experiment";

export interface Source {
  kind: SourceKind;
  /** id del mensaje, evidencia, experimento… que respalda el elemento. */
  refId?: Id;
  /** Cita literal (si proviene de la conversación). */
  quote?: string;
}

export interface DiagnosisItem {
  id: Id;
  projectId: Id;
  category: DiagnosisCategory;
  title: string;
  content: string;
  infoType: InfoType;
  reviewStatus: ReviewStatus;
  uncertainty: Uncertainty;
  source: Source;
  authorId: Id | "ai";
  relatedItemIds: Id[];
  evidenceIds: Id[];
  /** Prioridad contextual (solo problemas); revisable. */
  priority?: { rank: number; rationale: string; setBy: Id; setAt: ISODate };
  /** Control de concurrencia optimista. */
  version: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ItemChangeKind =
  | "created"
  | "edited"
  | "confirmed"
  | "rejected"
  | "clarification_requested"
  | "marked_unknown"
  | "evidence_attached"
  | "prioritized";

export interface DiagnosisItemHistory {
  id: Id;
  itemId: Id;
  projectId: Id;
  version: number;
  change: ItemChangeKind;
  /** Instantánea del elemento antes del cambio (null al crearse). */
  before: Omit<DiagnosisItem, "id" | "projectId"> | null;
  after: Omit<DiagnosisItem, "id" | "projectId">;
  actorId: Id | "ai";
  reason?: string;
  createdAt: ISODate;
}

export interface Comment {
  id: Id;
  projectId: Id;
  targetType: "diagnosis_item" | "hypothesis" | "experiment";
  targetId: Id;
  authorId: Id;
  body: string;
  createdAt: ISODate;
}

/* ───────────── Mentoría ───────────── */

export type MentorSessionKind = "first_review" | "second_review";
export type MentorSessionStatus = "pending" | "in_progress" | "completed";

export type MentorDecision = "continue" | "reformulate" | "deepen" | "pause" | "discard";

export interface MentorSession {
  id: Id;
  projectId: Id;
  mentorId: Id;
  kind: MentorSessionKind;
  status: MentorSessionStatus;
  /** Resumen preparado (determinista desde el diagnóstico) que el mentor lee antes de intervenir. */
  briefing?: MentorBriefing;
  decision?: { value: MentorDecision; justification: string; hypothesisId?: Id; decidedAt: ISODate };
  createdAt: ISODate;
  completedAt?: ISODate;
}

export interface MentorBriefing {
  generatedAt: ISODate;
  whatTheyBuild: string;
  stage: string;
  mainProblem: string;
  evidence: string[];
  openAssumptions: string[];
  resourcesAndLimits: string[];
  questionsForMentor: string[];
}

export type SessionNoteKind = "observation" | "question" | "suggestion" | "agreement";

export interface SessionNote {
  id: Id;
  sessionId: Id;
  projectId: Id;
  authorId: Id;
  kind: SessionNoteKind;
  body: string;
  relatedItemId?: Id;
  createdAt: ISODate;
}

/* ───────────── Hipótesis y experimentos ───────────── */

export type HypothesisStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "testing"
  | "supported"
  | "weakened"
  | "inconclusive"
  | "reformulated"
  | "discarded";

export interface Hypothesis {
  id: Id;
  projectId: Id;
  statement: string;
  relatedItemId?: Id;
  segment: string;
  whyItMatters: string;
  currentEvidence: string;
  uncertainty: Uncertainty;
  costOfBeingWrong: string;
  evaluationCriterion: string;
  status: HypothesisStatus;
  proposedBy: Id | "ai";
  approvedBy?: Id;
  /** Si fue reformulada, apunta a la nueva versión. */
  supersededBy?: Id;
  version: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ExperimentStatus = "design" | "ready" | "running" | "results_pending" | "reviewed";

export interface Experiment {
  id: Id;
  projectId: Id;
  hypothesisId: Id;
  question: string;
  method: string;
  participants: string;
  activities: string[];
  resources: string;
  /** null = presupuesto desconocido (no se inventa). */
  budget: number | null;
  durationDays: number | null;
  metric: string;
  successCriterion: string;
  rejectionCriterion: string;
  risks: string;
  ownerId: Id;
  reviewDate?: ISODate;
  evidencePlan: string;
  status: ExperimentStatus;
  /** Los criterios quedan bloqueados al iniciar el experimento (antes de ver resultados). */
  criteriaLockedAt?: ISODate;
  version: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ResultOutcome = "positive" | "negative" | "mixed" | "inconclusive";

export interface ExperimentResult {
  id: Id;
  experimentId: Id;
  projectId: Id;
  outcome: ResultOutcome;
  observed: string;
  /** Valor observado de la métrica, tal como lo registró una persona. */
  metricValue: string;
  learnings: string;
  limitations: string;
  evidenceIds: Id[];
  recordedBy: Id;
  createdAt: ISODate;
}

/* ───────────── Tareas y evidencia ───────────── */

export type TaskStatus = "todo" | "doing" | "done" | "blocked";

export interface Task {
  id: Id;
  projectId: Id;
  title: string;
  experimentId?: Id;
  assigneeId: Id;
  status: TaskStatus;
  dueDate?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type EvidenceKind = "note" | "link" | "file";

export interface Evidence {
  id: Id;
  projectId: Id;
  kind: EvidenceKind;
  title: string;
  description: string;
  url?: string;
  file?: { name: string; mimeType: string; sizeBytes: number; storagePath?: string };
  uploadedBy: Id;
  createdAt: ISODate;
}

/* ───────────── Auditoría ───────────── */

export type AuditAction =
  | "project.created"
  | "project.status_changed"
  | "member.added"
  | "mentor.assigned"
  | "mentor.revoked"
  | "diagnosis.summary_confirmed"
  | "diagnosis.item_changed"
  | "ai.proposal_applied"
  | "mentor.session_completed"
  | "hypothesis.status_changed"
  | "experiment.status_changed"
  | "experiment.result_recorded"
  | "evidence.added"
  | "access.denied"
  | "ai.invoked"
  | "ai.failed";

export interface AuditEvent {
  id: Id;
  projectId?: Id;
  actorId: Id | "ai" | "system";
  action: AuditAction;
  targetId?: Id;
  /** Metadatos mínimos: nunca contenido sensible ni secretos. */
  meta?: Record<string, string | number | boolean>;
  createdAt: ISODate;
}
