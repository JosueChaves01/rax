/**
 * Contratos de dominio compartidos de RAX (Fase Cero a Fase 3).
 * Cada estado vive en su propio campo: revisión ≠ incertidumbre ≠ fase del proyecto.
 * Ver docs/domain-model.md.
 */

export type Id = string;
export type ISODate = string;

/* ───────────── Personas y permisos ───────────── */

export type Role = "entrepreneur" | "mentor" | "admin";

/** Solicitud para ser mentor: la aprueba la administración, nadie se autodeclara mentor. */
export type MentorStatus = "none" | "pending" | "approved" | "rejected";

export interface Profile {
  id: Id;
  name: string;
  email: string;
  role: Role;
  mentorStatus: MentorStatus;
  /** Respuestas del onboarding según cómo la persona dijo que usará RAX. */
  onboarding?: Onboarding;
  onboardedAt?: ISODate;
  createdAt: ISODate;
}

/* ───────────── Onboarding ───────────── */

export type OnboardingIntent = "entrepreneur" | "mentor" | "admin";

export type EntrepreneurGoal = "order_idea" | "what_to_test" | "find_mentor" | "first_customers" | "prepare_funding";
export type WeeklyHours = "lt2" | "2to5" | "5to10" | "gt10";

export interface EntrepreneurOnboarding {
  intent: "entrepreneur";
  sector: string;
  stage: InitiativeNature;
  goals: EntrepreneurGoal[];
  weeklyHours: WeeklyHours;
  /** Qué espera de un mentor, con sus palabras. */
  mentorExpectation: string;
}

export type Expertise =
  | "strategy"
  | "finance"
  | "marketing_sales"
  | "product"
  | "operations"
  | "legal"
  | "technology"
  | "social_impact";
export type ExperienceBand = "lt3" | "3to7" | "8to15" | "gt15";

export interface MentorOnboarding {
  intent: "mentor";
  expertise: Expertise[];
  sectors: string;
  yearsExperience: ExperienceBand;
  monthlyHours: number;
  maxProjects: number;
  bio: string;
  linkedinUrl?: string;
}

export interface AdminOnboarding {
  intent: "admin";
  organization: string;
  program: string;
}

export type Onboarding = EntrepreneurOnboarding | MentorOnboarding | AdminOnboarding;

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

/** Conversación del agente principal, separada de la entrevista y propiedad de un solo actor. */
export type AgentThreadStatus = "active" | "error" | "closed";
export interface AgentThread {
  id: Id;
  projectId: Id;
  creatorId: Id;
  status: AgentThreadStatus;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type AgentMessageAuthor = "user" | "assistant";
export type AgentMessageStatus = "complete" | "failed";
export interface AgentMessage {
  id: Id;
  threadId: Id;
  projectId: Id;
  author: AgentMessageAuthor;
  authorId: Id;
  content: string;
  proposals: Array<Record<string, unknown>>;
  status: AgentMessageStatus;
  errorCode?: string;
  errorMessage?: string;
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

export type MentorSessionKind =
  | "first_review"
  | "second_review"
  | "exploratory"
  | "follow_up"
  | "evaluation";
export type MentorSessionStatus = "pending" | "in_progress" | "completed";

export type MentorDecision = "continue" | "reformulate" | "deepen" | "pause" | "discard";

export interface PreSessionBriefing {
  generatedAt: ISODate;
  activeAgreementsAndGoalsSummary: string;
  recentProgressSummary: string;
  pendingTopicsSummary: string;
  suggestedAgenda: string[];
  suggestedQuestions: string[];
  rationale?: string;
}

export interface PostSessionSynthesis {
  generatedAt: ISODate;
  summary: string;
  agreedDecisions: string[];
  entrepreneurCommitments: Array<{
    title: string;
    actionType?: ActionType;
    dueDate?: string;
    goalId?: string;
  }>;
  mentorCommitments: Array<{
    title: string;
    dueDate?: string;
  }>;
  nextSteps?: string;
  suggestedNextSessionInDays?: number;
}

export interface MentorSession {
  id: Id;
  projectId: Id;
  mentorId: Id;
  relationId?: Id;
  kind: MentorSessionKind;
  status: MentorSessionStatus;
  scheduledAt?: ISODate;
  startedAt?: ISODate;
  /** Resumen preparado (determinista desde el diagnóstico) que el mentor lee antes de intervenir. */
  briefing?: MentorBriefing;
  preSessionBriefing?: PreSessionBriefing;
  postSessionSynthesis?: PostSessionSynthesis;
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

export type SessionNoteKind =
  | "observation"
  | "question"
  | "suggestion"
  | "agreement"
  | "commitment"
  | "blocker"
  | "decision";

export interface SessionNote {
  id: Id;
  sessionId: Id;
  projectId: Id;
  authorId: Id;
  kind: SessionNoteKind;
  body: string;
  isPrivate?: boolean;
  relatedItemId?: Id;
  createdAt: ISODate;
}

/* ───────────── Proceso de Mentoría y Acuerdos ───────────── */

export type MentorshipStage =
  | "exploration"
  | "diagnosis"
  | "agreement"
  | "active_mentoring"
  | "evaluation"
  | "renewed"
  | "closed";

export type CompatibilityStatus = "pending" | "proceed" | "needs_info" | "declined";

export interface MentorshipRelation {
  id: Id;
  projectId: Id;
  entrepreneurId: Id;
  mentorId: Id;
  stage: MentorshipStage;
  compatibilityStatus: CompatibilityStatus;
  compatibilityRationale?: string;
  compatibilityDecidedAt?: ISODate;
  version: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type AgreementFrequency = "weekly" | "biweekly" | "monthly" | "on_demand";

export type AgreementStatus =
  | "draft"
  | "confirmed_by_mentor"
  | "confirmed_by_entrepreneur"
  | "active"
  | "superseded";

export interface MentorshipAgreement {
  id: Id;
  relationId: Id;
  version: number;
  frequency: AgreementFrequency;
  sessionDurationMinutes: number;
  authorizedChannels: string[];
  scope: string;
  mentorCommitments: string;
  entrepreneurCommitments: string;
  confidentialityTerms: string;
  expectedDurationWeeks: number;
  status: AgreementStatus;
  confirmedAt?: ISODate;
  createdAt: ISODate;
}

export type GoalKind = "metric" | "qualitative" | "capability" | "strategic";
export type GoalPriority = "high" | "medium" | "low";
export type GoalStatus = "active" | "achieved" | "partially_achieved" | "deferred" | "discarded";

export interface MentorshipGoal {
  id: Id;
  relationId: Id;
  title: string;
  description: string;
  whyItMatters: string;
  kind: GoalKind;
  baseline: string;
  targetResult: string;
  metricIndicator?: string;
  targetDate?: ISODate;
  priority: GoalPriority;
  relatedDiagnosisItemIds?: Id[];
  status: GoalStatus;
  version: number;
  createdAt: ISODate;
  updatedAt: ISODate;
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

/* ───────────── Hoja de ruta y Acciones Multimodales ───────────── */

export type MilestoneStatus = "pending" | "in_progress" | "achieved" | "deferred";

export interface RoadmapMilestone {
  id: Id;
  projectId: Id;
  relationId?: Id;
  goalId?: Id;
  title: string;
  description?: string;
  targetDate?: ISODate;
  status: MilestoneStatus;
  orderIndex: number;
  version: number;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ActionType =
  | "operational_task"
  | "skill_learning"
  | "business_decision"
  | "conversation_third_party"
  | "financial_review"
  | "mentor_intervention"
  | "experiment"
  | "research"
  | "expert_referral";

export type DelayCauseCategory =
  | "clarity"
  | "time"
  | "resources"
  | "external"
  | "priority_change"
  | "execution_difficulty";

export interface DelayHypothesis {
  causeCategory: DelayCauseCategory;
  detail: string;
  identifiedAt: ISODate;
}

export type TaskStatus = "todo" | "doing" | "done" | "blocked";

export interface Task {
  id: Id;
  projectId: Id;
  title: string;
  actionType?: ActionType;
  milestoneId?: Id;
  goalId?: Id;
  experimentId?: Id;
  assigneeId: Id;
  status: TaskStatus;
  blockedReason?: string;
  delayHypothesis?: DelayHypothesis;
  evidenceIds?: Id[];
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

/* ───────────── Cartera del Mentor y Recursos ───────────── */

export type ResourceCategory = "framework" | "questionnaire" | "template" | "guide" | "experiment_pattern";

export interface MentorResource {
  id: Id;
  title: string;
  category: ResourceCategory;
  description: string;
  content: string;
  tags: string[];
  authorMentorId?: Id;
  isPublic: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type InterventionUrgency = "high" | "medium" | "low";
export type InterventionCategory =
  | "unresolved_blocker"
  | "stalled_progress"
  | "session_prep_needed"
  | "pending_agreement"
  | "goal_stalled"
  | "cycle_review_needed";
export type InterventionStatus = "pending" | "accepted" | "dismissed" | "snoozed";

export interface MentorIntervention {
  id: Id;
  mentorId: Id;
  relationId: Id;
  projectId: Id;
  projectName: string;
  urgency: InterventionUrgency;
  category: InterventionCategory;
  title: string;
  explanation: {
    whatHappened: string;
    whyItMatters: string;
    supportingData: string;
    suggestedAction: string;
  };
  status: InterventionStatus;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ───────────── Evaluación de Ciclo, Cierre y Renovación ───────────── */

export type AutonomyRating = "nascent" | "developing" | "autonomous";
export type CycleDecision = "renew" | "close" | "new_stage";

export interface GoalEvaluation {
  goalId: Id;
  goalTitle: string;
  baseline: string;
  targetResult: string;
  actualResult: string;
  status: GoalStatus;
  evidenceNotes: string;
}

export interface CycleEvaluation {
  id: Id;
  relationId: Id;
  projectId: Id;
  cycleNumber: number;
  evaluatedAt: ISODate;
  evaluatedBy: Id;
  goalEvaluations: GoalEvaluation[];
  autonomyAssessment: {
    rating: AutonomyRating;
    observations: string;
  };
  mentorFeedback: string;
  entrepreneurFeedback?: string;
  decision: CycleDecision;
  nextCycleFocus?: string;
  version: number;
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
  | "ai.failed"
  | "profile.onboarded"
  | "mentor.applied"
  | "mentor.approved"
  | "mentor.rejected"
  | "mentorship.relation_created"
  | "mentorship.stage_changed"
  | "mentorship.compatibility_decided"
  | "mentorship.agreement_updated"
  | "mentorship.agreement_confirmed"
  | "mentorship.goal_created"
  | "mentorship.goal_status_changed"
  | "roadmap.milestone_created"
  | "roadmap.milestone_updated"
  | "roadmap.milestone_status_changed"
  | "task.delay_diagnosed"
  | "session.scheduled"
  | "session.started"
  | "session.briefing_generated"
  | "session.synthesis_generated"
  | "session.commitments_adopted"
  | "session.completed"
  | "mentorship.cycle_evaluated"
  | "mentorship.closed"
  | "mentorship.renewed"
  | "resource.created"
  | "resource.updated"
  | "intervention.dismissed";

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
