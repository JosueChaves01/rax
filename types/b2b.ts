/**
 * Contratos del pivot B2B centrado en el mentor (plan técnico §2.2 + decisiones de §6).
 * `types/domain.ts` no recibe tipos nuevos: lo nuevo vive acá y lo importan los dos lados.
 * Cambiar algo de este archivo = PR de contrato («contrato: …») revisado por ambos devs.
 */
import type { Id, ISODate, KnowledgeCitation, MentorSession, Project } from "./domain";

/* ───────────── Proyecto y roles ───────────── */

/** Etapa explícita del ciclo: la escribe solo `advanceCycleStage` (lib/services/cycle.ts). */
export type CycleStage = "intake" | "kickoff" | "cycle" | "closed";
export const CYCLE_STAGES: readonly CycleStage[] = ["intake", "kickoff", "cycle", "closed"];

/** Proyecto individual (una persona) o grupal (varias personas, mismo flujo con otro enfoque). */
export type ProjectMode = "individual" | "group";

/** Rol de una persona dentro de un proyecto B2B. No hay administración. */
export type ProjectRole = "mentor" | "client";

/* ───────────── Perfil y conocimiento del mentor ───────────── */

export interface IntakeQuestion {
  id: string;
  topic: string;
  question: string;
  /** Para qué le sirve la respuesta al mentor (orienta al entrevistador). */
  why: string;
  required: boolean;
}

export interface MentorProfile {
  mentorId: Id;
  headline: string;
  bio: string;
  methodology: string;
  focusAreas: string[];
  interviewGuide: IntakeQuestion[];
  assistantTone: string;
  updatedAt: ISODate;
}

export type MentorDocumentKind = "methodology" | "template" | "reference" | "example";

export interface MentorDocument {
  id: Id;
  mentorId: Id;
  title: string;
  filename: string;
  content: string;
  fileType: string;
  tokenCount: number;
  kind: MentorDocumentKind;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface MentorDocumentChunk {
  id: Id;
  mentorId: Id;
  documentId: Id;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  createdAt: ISODate;
}

/** Bloque `<mentor_context>` del prompt: perfil + metodología + fragmentos del RAG del mentor. */
export interface MentorContext {
  text: string;
  citations: KnowledgeCitation[];
}

/* ───────────── Invitaciones y notificaciones ───────────── */

export type InvitationStatus = "pending" | "accepted" | "declined" | "revoked";

/** Invitación por correo (en minúsculas). Se acepta o rechaza desde el panel, sin link. */
export interface ProjectInvitation {
  id: Id;
  projectId: Id;
  email: string;
  invitedBy: Id;
  status: InvitationStatus;
  respondedBy?: Id;
  respondedAt?: ISODate;
  createdAt: ISODate;
}

/** Lo que ve la persona invitada en su panel. */
export interface MyInvitation extends ProjectInvitation {
  projectName: string;
  mentorName: string;
}

export type NotificationKind =
  | "project_invitation"
  | "resource_published"
  | "session_scheduled"
  | "comment_added"
  /* Fase 3 (Dev B): cierre de una sesión (al cliente) y asistencia confirmada (al mentor). */
  | "session_closed"
  | "session_confirmed";

export interface Notification {
  id: Id;
  profileId: Id;
  kind: NotificationKind;
  payload: Record<string, unknown>;
  readAt?: ISODate;
  createdAt: ISODate;
}

/* ───────────── Intake (pre Sesión 1) ───────────── */

export type IntakeStatus = "not_started" | "in_progress" | "submitted" | "reviewed";
export type IntakeCoverage = "answered" | "partial" | "skipped";

/** Lo que el mentor lee antes de la Sesión 1. */
export interface IntakeBrief {
  /** 5 a 8 líneas. */
  summary: string;
  answers: Array<{ questionId: string; topic: string; answer: string; confidence: "high" | "medium" | "low" }>;
  /** Lo que falta y el mentor debe completar. */
  gaps: string[];
  risks: string[];
  suggestedAgenda: SessionTopic[];
  /** Documentos del mentor (metodología, plantillas) en los que se apoyó el brief. */
  citations?: KnowledgeCitation[];
  generatedAt: ISODate;
  model: string;
}

/** Fila de `intake_briefs`. `clientId` vacío = brief consolidado de un proyecto grupal. */
export interface IntakeBriefRecord {
  id: Id;
  projectId: Id;
  clientId?: Id;
  status: IntakeStatus;
  guideSnapshot: IntakeQuestion[];
  coverage: Record<string, IntakeCoverage>;
  brief?: IntakeBrief;
  submittedAt?: ISODate;
  reviewedAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** Estado del intake de una persona. El cliente nunca recibe `brief` (es solo para el mentor). */
export interface IntakeState {
  projectId: Id;
  clientId?: Id;
  status: IntakeStatus;
  coverage: Record<string, IntakeCoverage>;
  brief?: IntakeBrief;
}

/* ───────────── Sesiones y ciclo ───────────── */

export interface SessionTopic {
  id: string;
  title: string;
  goal: string;
  status: "planned" | "covered" | "carried_over";
}

/** Señales del ciclo para el briefing de la próxima sesión (comentarios nuevos, evaluaciones). */
export interface CycleSignals {
  newComments: Array<{ targetType: "document" | "session"; targetId: Id; authorId: Id; body: string; createdAt: ISODate }>;
  assessmentResults: Array<{ assessmentId: Id; title: string; clientId: Id; status: AssessmentSubmission["status"]; score?: number }>;
}

/* ───────────── Evaluaciones ───────────── */

export interface AssessmentQuestion {
  id: string;
  kind: "open" | "single_choice" | "multi_choice" | "scale";
  prompt: string;
  options?: string[];
  points?: number;
}

export type AssessmentStatus = "draft" | "published" | "closed";

export interface Assessment {
  id: Id;
  projectId: Id;
  sessionId?: Id;
  createdBy: Id;
  title: string;
  instructions: string;
  questions: AssessmentQuestion[];
  status: AssessmentStatus;
  dueAt?: ISODate;
  createdAt: ISODate;
  publishedAt?: ISODate;
}

export interface AssessmentAnswer {
  questionId: string;
  value: string | string[] | number;
}

export interface AssessmentSubmission {
  id: Id;
  assessmentId: Id;
  clientId: Id;
  answers: AssessmentAnswer[];
  status: "draft" | "submitted" | "reviewed";
  score?: number;
  mentorFeedback?: string;
  createdAt: ISODate;
  submittedAt?: ISODate;
  reviewedAt?: ISODate;
}

export interface AssessmentInput {
  title: string;
  instructions?: string;
  questions: AssessmentQuestion[];
  sessionId?: Id;
  dueAt?: ISODate;
}

/* ───────────── Documentos publicados ───────────── */

export type DocumentVisibility = "mentor_only" | "published";
export type DocKind = "material" | "summary" | "transcript" | "agreement" | "intake";

export interface PublishedResource {
  documentId: Id;
  projectId: Id;
  title: string;
  docKind: DocKind;
  sessionId?: Id;
  /** Vacío = para todo el grupo (o la única persona de un proyecto individual). */
  audienceClientId?: Id;
  publishedAt: ISODate;
  commentCount: number;
}

/* ───────────── Agente ───────────── */

/** Alcance de un hilo del agente. */
export type AgentThreadScope = "project" | "intake" | "session_room";

/* ───────────── Inicio del cliente ───────────── */

export interface ClientProjectCard {
  project: Pick<Project, "id" | "name" | "description"> & { mode: ProjectMode; cycleStage: CycleStage };
  mentorName: string;
  intakeStatus: IntakeStatus;
  nextSession?: Pick<MentorSession, "id" | "kind" | "status" | "scheduledAt" | "confirmedAt">;
  /** Material publicado que la persona todavía no abrió. */
  newResources: number;
}

export interface ClientHome {
  projects: ClientProjectCard[];
  invitations: MyInvitation[];
  unreadNotifications: number;
}
