import { z } from "zod";

/**
 * Contrato de salida estructurada del motor de interpretación (docs/ai-behavior.md).
 * Ninguna salida del modelo toca la base de datos sin pasar por este esquema
 * y por las reglas de lib/ai/apply.ts.
 */

export const DimensionEnum = z.enum([
  "nature",
  "stage",
  "people",
  "origin",
  "problem",
  "evidence",
  "assumptions",
  "resources",
  "immediate_goal",
]);

export const CategoryEnum = z.enum([
  "context",
  "people_market",
  "problem",
  "solutions",
  "financial",
  "operational",
  "commercial",
  "legal",
  "risk",
  "open_question",
]);

/** La IA solo puede proponer estos tipos. Evidencia, decisiones y correcciones vienen de personas. */
export const AiInfoTypeEnum = z.enum([
  "entrepreneur_statement",
  "documented_observation",
  "ai_interpretation",
  "hypothesis",
  "unknown",
]);

export const UncertaintyEnum = z.enum(["low", "medium", "high", "unknown"]);

export const ProposalSchema = z.object({
  op: z.enum(["create", "update"]),
  /** id del elemento a actualizar (solo op=update), o null. */
  targetItemId: z.string().nullable(),
  category: CategoryEnum,
  title: z.string(),
  content: z.string(),
  infoType: AiInfoTypeEnum,
  uncertainty: UncertaintyEnum,
  /** Mensaje del emprendedor que respalda la propuesta, o null si es una inferencia. */
  sourceMessageId: z.string().nullable(),
  /** Cita literal del mensaje fuente; se verifica contra el texto real. */
  quote: z.string().nullable(),
  reason: z.string(),
});

export const AiTurnSchema = z.object({
  /** Mensaje al emprendedor: breve, una sola pregunta. */
  reply: z.string(),
  askedDimension: DimensionEnum.nullable(),
  proposals: z.array(ProposalSchema),
  contradictions: z.array(z.object({ description: z.string(), itemIds: z.array(z.string()) })),
  /** Borrador de resumen inicial cuando ya hay contexto suficiente; null si todavía no. */
  summaryDraft: z.string().nullable(),
});

export type AiProposal = z.infer<typeof ProposalSchema>;
export type AiTurn = z.infer<typeof AiTurnSchema>;

export const FirstReviewNoteKindEnum = z.enum(["observation", "question", "suggestion"]);

export const SuggestedNoteSchema = z.object({
  kind: FirstReviewNoteKindEnum,
  body: z.string().min(5).max(2000),
  relatedItemId: z.string().nullable().optional(),
});

export const FirstReviewSuggestionSchema = z.object({
  agreement: z.string().min(10).max(2000),
  suggestedNotes: z.array(SuggestedNoteSchema).max(8),
});

export type SuggestedNote = z.infer<typeof SuggestedNoteSchema>;
export type FirstReviewSuggestion = z.infer<typeof FirstReviewSuggestionSchema>;

/* ───────────── Hipótesis y Experimentos (Etapa 3) ───────────── */

export const SuggestedHypothesisSchema = z.object({
  statement: z.string().min(25).max(600),
  segment: z.string().min(2).max(200),
  relatedItemId: z.string().nullable().optional(),
  whyItMatters: z.string().max(600).default(""),
  currentEvidence: z.string().max(600).default(""),
  uncertainty: UncertaintyEnum.default("high"),
  costOfBeingWrong: z.string().max(600).default(""),
  evaluationCriterion: z.string().min(5).max(600),
  rationale: z.string().max(400).optional(),
});

export const HypothesesSuggestionSchema = z.object({
  suggestions: z.array(SuggestedHypothesisSchema).min(1).max(5),
  contextSummary: z.string().max(400).optional(),
});

export type SuggestedHypothesis = z.infer<typeof SuggestedHypothesisSchema>;
export type HypothesesSuggestion = z.infer<typeof HypothesesSuggestionSchema>;

export const SuggestedExperimentSchema = z.object({
  question: z.string().min(5).max(600),
  method: z.string().min(3).max(600),
  participants: z.string().min(3).max(600),
  activities: z.array(z.string().max(200)).max(20).default([]),
  resources: z.string().max(600).default(""),
  budget: z.number().min(0).max(1e10).nullable().default(null),
  durationDays: z.number().int().min(1).max(365).nullable().default(null),
  metric: z.string().min(3).max(300),
  successCriterion: z.string().min(5).max(600),
  rejectionCriterion: z.string().min(5).max(600),
  risks: z.string().max(600).default(""),
  evidencePlan: z.string().min(5).max(600),
  rationale: z.string().max(400).optional(),
});

export type SuggestedExperiment = z.infer<typeof SuggestedExperimentSchema>;

/* ───────────── Tareas de Experimentos ───────────── */

export const SuggestedTaskSchema = z.object({
  title: z.string().min(3).max(200),
});

export const ExperimentTasksSuggestionSchema = z.object({
  tasks: z.array(SuggestedTaskSchema).min(1).max(15),
  rationale: z.string().max(400).optional(),
});

export type SuggestedTask = z.infer<typeof SuggestedTaskSchema>;
export type ExperimentTasksSuggestion = z.infer<typeof ExperimentTasksSuggestionSchema>;

/* ───────────── Objetivos y Acuerdos de Mentoría (Etapa 3) ───────────── */

export const SuggestedGoalSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(1000).default(""),
  whyItMatters: z.string().max(1000).default(""),
  kind: z.enum(["metric", "qualitative", "capability", "strategic"]).default("qualitative"),
  baseline: z.string().max(1000),
  targetResult: z.string().min(3).max(1000),
  metricIndicator: z.string().max(300).optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  rationale: z.string().max(400).optional(),
});

export const SuggestedAgreementTermsSchema = z.object({
  frequency: z.enum(["weekly", "biweekly", "monthly", "on_demand"]).default("biweekly"),
  sessionDurationMinutes: z.number().int().min(15).max(240).default(60),
  authorizedChannels: z.array(z.string().max(100)).default(["Google Meet", "WhatsApp"]),
  scope: z.string().max(2000),
  mentorCommitments: z.string().max(2000),
  entrepreneurCommitments: z.string().max(2000),
  confidentialityTerms: z.string().max(2000).default("Confidencialidad recíproca respecto a métricas, clientes y estrategia."),
  expectedDurationWeeks: z.number().int().min(1).max(52).default(12),
});

export const GoalsSuggestionSchema = z.object({
  suggestedGoals: z.array(SuggestedGoalSchema).min(1).max(5),
  suggestedAgreementTerms: SuggestedAgreementTermsSchema.optional(),
  rationale: z.string().max(500).optional(),
});

export type SuggestedGoal = z.infer<typeof SuggestedGoalSchema>;
export type SuggestedAgreementTerms = z.infer<typeof SuggestedAgreementTermsSchema>;
export type GoalsSuggestion = z.infer<typeof GoalsSuggestionSchema>;



/* ── Fase 4: Sesiones y Memoria Contextual ── */

export const PreSessionBriefingSchema = z.object({
  activeAgreementsAndGoalsSummary: z.string().max(2000),
  recentProgressSummary: z.string().max(2000),
  pendingTopicsSummary: z.string().max(2000),
  suggestedAgenda: z.array(z.string().max(300)).min(1).max(6),
  suggestedQuestions: z.array(z.string().max(300)).min(1).max(6),
  rationale: z.string().max(500).optional(),
});

export const PostSessionCommitmentSchema = z.object({
  title: z.string().min(3).max(200),
  actionType: z
    .enum([
      "operational_task",
      "skill_learning",
      "business_decision",
      "conversation_third_party",
      "financial_review",
      "mentor_intervention",
      "experiment",
      "research",
      "expert_referral",
    ])
    .default("operational_task"),
  dueDate: z.string().max(40).optional(),
  goalId: z.string().optional(),
});

export const MentorCommitmentSchema = z.object({
  title: z.string().min(3).max(200),
  dueDate: z.string().max(40).optional(),
});

export const PostSessionSynthesisSchema = z.object({
  summary: z.string().min(10).max(3000),
  agreedDecisions: z.array(z.string().max(400)).max(10).default([]),
  entrepreneurCommitments: z.array(PostSessionCommitmentSchema).max(10).default([]),
  mentorCommitments: z.array(MentorCommitmentSchema).max(10).default([]),
  // Algunos modelos gratuitos devuelven los próximos pasos como lista: se acepta y se une en texto.
  nextSteps: z
    .preprocess((v) => (Array.isArray(v) ? v.map(String).join("\n") : v), z.string())
    .transform((v) => v.slice(0, 1000))
    .optional(),
  suggestedNextSessionInDays: z.number().int().min(1).max(90).optional(),
});

export type PreSessionBriefingSuggestion = z.infer<typeof PreSessionBriefingSchema>;
export type PostSessionSynthesisSuggestion = z.infer<typeof PostSessionSynthesisSchema>;
export type SuggestedPostSessionCommitment = z.infer<typeof PostSessionCommitmentSchema>;
