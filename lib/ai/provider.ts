import type { DiagnosisItem, InterviewDimension, Message } from "@/types/domain";
import type { AiTurn, ExperimentTasksSuggestion, FirstReviewSuggestion, GoalsSuggestion, HypothesesSuggestion, PostSessionSynthesisSuggestion, PreSessionBriefingSuggestion, SuggestedExperiment } from "./schema";

/**
 * Contexto seleccionado para una invocación. No se envía todo el historial:
 * ver lib/ai/context.ts para las reglas de selección.
 */
export interface InterviewContext {
  projectName: string;
  projectSummary: string | null;
  /** Últimos mensajes de la conversación (ventana acotada). */
  recentMessages: Message[];
  /** Mensaje nuevo del emprendedor que motiva la invocación. */
  latestMessage: Message;
  /** Elementos vigentes. Los protegidos (confirmados/corregidos) no pueden modificarse en sitio. */
  currentItems: Array<Pick<DiagnosisItem, "id" | "category" | "title" | "content" | "infoType" | "reviewStatus" | "uncertainty"> & { protected: boolean }>;
  /** Interpretaciones rechazadas: la IA no debe volver a tratarlas como hechos. */
  rejectedInterpretations: Array<{ id: string; title: string; content: string }>;
  coveredDimensions: InterviewDimension[];
  pendingDimensions: InterviewDimension[];
  mentorNotes: string[];
  summaryReady: boolean;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface AiResult {
  turn: AiTurn;
  provider: "simulated" | "openrouter";
  usage?: AiUsage;
}

export interface FirstReviewContext {
  projectName: string;
  projectNature: string;
  projectSummary: string;
  founderContext?: {
    stage?: string;
    sector?: string;
    goals?: string[];
    mentorExpectation?: string;
    weeklyHours?: string;
  };
  briefing: {
    whatTheyBuild: string;
    mainProblem: string;
    evidence: string[];
    openAssumptions: string[];
    resourcesAndLimits: string[];
    questionsForMentor: string[];
  };
  items: Array<{
    id: string;
    category: string;
    title: string;
    content: string;
    infoType: string;
    reviewStatus: string;
    uncertainty: string;
  }>;
  existingNotes: string[];
  recentMessages?: Array<{ author: string; content: string }>;
}

export interface FirstReviewResult {
  suggestion: FirstReviewSuggestion;
  provider: "simulated" | "openrouter";
  usage?: AiUsage;
}

export interface HypothesisSuggestionContext {
  projectName: string;
  projectNature: string;
  projectSummary: string;
  founderContext?: {
    stage?: string;
    sector?: string;
    goals?: string[];
  };
  prioritizedProblems: Array<{ id: string; title: string; content: string; rank?: number; justification?: string }>;
  otherProblems: Array<{ id: string; title: string; content: string }>;
  keyAssumptions: Array<{ id: string; title: string; content: string; uncertainty: string }>;
  openQuestions: Array<{ id: string; title: string; content: string }>;
  mentorAgreement?: string;
  mentorNotes?: string[];
  existingHypotheses: Array<{ id: string; statement: string; segment: string; status: string }>;
  experimentLearnings?: Array<{ hypothesisStatement: string; outcome: string; learnings: string }>;
}

export interface HypothesesSuggestionResult {
  suggestion: HypothesesSuggestion;
  provider: "simulated" | "openrouter";
  usage?: AiUsage;
}

export interface ExperimentSuggestionContext {
  projectName: string;
  projectNature: string;
  projectSummary: string;
  hypothesis: {
    id: string;
    statement: string;
    segment: string;
    whyItMatters: string;
    currentEvidence: string;
    evaluationCriterion: string;
    costOfBeingWrong: string;
    uncertainty: string;
    relatedProblemTitle?: string;
    relatedProblemContent?: string;
  };
  founderContext?: {
    stage?: string;
    sector?: string;
    weeklyHours?: string;
  };
  previousExperiments?: Array<{
    question: string;
    method: string;
    outcome?: string;
    learnings?: string;
  }>;
}

export interface ExperimentSuggestionResult {
  suggestion: SuggestedExperiment;
  provider: "simulated" | "openrouter";
  usage?: AiUsage;
}

export interface ExperimentTasksContext {
  projectName: string;
  projectNature: string;
  projectSummary: string;
  hypothesis?: {
    statement: string;
    segment: string;
    evaluationCriterion?: string;
  };
  experiment: {
    id: string;
    question: string;
    method: string;
    participants: string;
    activities: string[];
    resources: string;
    durationDays: number | null;
    budget: number | null;
    metric: string;
    successCriterion: string;
    rejectionCriterion: string;
    evidencePlan: string;
    risks: string;
    status: string;
  };
  founderContext?: {
    stage?: string;
    sector?: string;
    weeklyHours?: string;
  };
  existingTasks: Array<{ title: string; status: string }>;
}

export interface ExperimentTasksResult {
  suggestion: ExperimentTasksSuggestion;
  provider: "simulated" | "openrouter";
  usage?: AiUsage;
}

export interface GoalsSuggestionContext {
  projectName: string;
  projectNature: string;
  projectSummary: string;
  founderContext?: {
    stage?: string;
    sector?: string;
    goals?: string[];
    weeklyHours?: string;
  };
  confirmedDiagnosis: Array<{
    id: string;
    category: string;
    title: string;
    content: string;
    infoType: string;
    reviewStatus: string;
  }>;
  prioritizedProblems: Array<{
    id: string;
    title: string;
    content: string;
    rank?: number;
    justification?: string;
  }>;
  mentorNotes?: string[];
  existingGoals?: Array<{
    title: string;
    baseline: string;
    targetResult: string;
    priority: string;
    status: string;
  }>;
  currentAgreement?: {
    frequency?: string;
    sessionDurationMinutes?: number;
    authorizedChannels?: string[];
    scope?: string;
  };
}

export interface GoalsSuggestionResult {
  suggestion: GoalsSuggestion;
  provider: "simulated" | "openrouter";
  usage?: AiUsage;
}

export interface PreSessionBriefingContext {
  projectName: string;
  projectNature: string;
  projectSummary: string;
  sessionKind: string;
  mentorName?: string;
  entrepreneurName?: string;
  // Capa 1: Acuerdos y Objetivos vigentes
  agreement?: {
    scope?: string;
    frequency?: string;
    mentorCommitments?: string;
    entrepreneurCommitments?: string;
  };
  goals: Array<{
    id: string;
    title: string;
    baseline: string;
    targetResult: string;
    status: string;
    priority: string;
  }>;
  // Contexto de Diagnóstico Vivo (Etapa 1 · Entender)
  diagnosisSummary?: string;
  diagnosisProblems?: Array<{ id: string; title: string; content: string; uncertainty?: number; isPrioritized?: boolean }>;
  diagnosisHypotheses?: Array<{ id: string; title: string; content: string }>;
  diagnosisEvidence?: Array<{ id: string; title: string; content: string }>;
  diagnosisUnknowns?: Array<{ id: string; title: string; content: string }>;
  // Capa 2: Progreso y Ejecución reciente
  recentCompletedTasks: Array<{ title: string; actionType?: string }>;
  blockedOrDelayedTasks: Array<{ title: string; blockedReason?: string; delayCause?: string; delayDetail?: string }>;
  experimentsInProgress: Array<{ question: string; status: string; metric?: string }>;
  // Capa 3: Temas pendientes y notas previas
  previousSessionNotes: Array<{ kind: string; body: string }>;
  recentMessages?: Array<{ author: string; content: string }>;
}

export interface PreSessionBriefingResult {
  briefing: PreSessionBriefingSuggestion;
  provider: "simulated" | "openrouter";
  usage?: AiUsage;
}

export interface PostSessionSynthesisContext {
  projectName: string;
  projectSummary?: string;
  sessionKind: string;
  sessionNotes: Array<{ kind: string; body: string; isPrivate?: boolean }>;
  briefingAgenda?: string[];
  goals: Array<{ id: string; title: string }>;
  keyProblems?: Array<{ id: string; title: string }>;
  recentDiscussions?: Array<{ author: string; content: string }>;
  /** Transcripción automática de las llamadas de la sesión («[mm:ss] Nombre: texto»), si hubo. */
  callTranscript?: string;
}

export interface PostSessionSynthesisResult {
  synthesis: PostSessionSynthesisSuggestion;
  provider: "simulated" | "openrouter";
  usage?: AiUsage;
}

export interface AiProvider {
  readonly id: "simulated" | "openrouter";
  /** Texto visible que describe el proveedor (la simulación se declara como tal). */
  readonly label: string;
  interpret(ctx: InterviewContext): Promise<AiResult>;
  suggestFirstReview(ctx: FirstReviewContext): Promise<FirstReviewResult>;
  suggestHypotheses(ctx: HypothesisSuggestionContext): Promise<HypothesesSuggestionResult>;
  suggestExperiment(ctx: ExperimentSuggestionContext): Promise<ExperimentSuggestionResult>;
  suggestExperimentTasks(ctx: ExperimentTasksContext): Promise<ExperimentTasksResult>;
  suggestGoalsAndAgreement(ctx: GoalsSuggestionContext): Promise<GoalsSuggestionResult>;
  generatePreSessionBriefing(ctx: PreSessionBriefingContext): Promise<PreSessionBriefingResult>;
  generatePostSessionSynthesis(ctx: PostSessionSynthesisContext): Promise<PostSessionSynthesisResult>;
}

import { DomainError } from "@/lib/errors";

export class AiUnavailableError extends DomainError {
  constructor(
    readonly reason: "not_configured" | "rate_limited" | "provider_error" | "invalid_output" | "refused",
    message: string,
  ) {
    super("ai_unavailable", message);
    this.name = "AiUnavailableError";
  }
}
