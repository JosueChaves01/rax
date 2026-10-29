import { z } from "zod";
import { validation } from "@/lib/errors";

/**
 * Validación de entradas en el servidor. Todo lo que llega desde el navegador (server actions)
 * se parsea aquí antes de tocar un servicio: tipos, enums y longitudes.
 */

const str = (max: number) => z.string().max(max);
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_:-]+$/);

export const Ids = id;
export const Version = z.number().int().min(1);
export const Text = (max: number) => z.string().max(max);
export const Category = z.enum(["context", "people_market", "problem", "solutions", "financial", "operational", "commercial", "legal", "risk", "open_question"]);
export const Uncertainty = z.enum(["low", "medium", "high", "unknown"]);
export const HumanInfoType = z.enum(["entrepreneur_statement", "documented_observation", "hypothesis", "unknown"]);
export const Nature = z.enum(["exploring_idea", "designing_solution", "operating_business", "unknown"]);
export const ProjectStatus = z.enum(["active", "paused", "archived"]);
export const SessionKind = z.enum(["first_review", "second_review", "exploratory", "follow_up", "evaluation"]);
export const NoteKind = z.enum(["observation", "question", "suggestion", "agreement", "commitment", "blocker", "decision"]);
export const Decision = z.enum(["continue", "reformulate", "deepen", "pause", "discard"]);
export const Outcome = z.enum(["positive", "negative", "mixed", "inconclusive"]);
export const TaskStatus = z.enum(["todo", "doing", "done", "blocked"]);
export const CommentTarget = z.enum(["diagnosis_item", "hypothesis", "experiment"]);
export const MentorshipStage = z.enum(["exploration", "diagnosis", "agreement", "active_mentoring", "evaluation", "renewed", "closed"]);
export const CompatibilityStatus = z.enum(["pending", "proceed", "needs_info", "declined"]);
export const AgreementFrequency = z.enum(["weekly", "biweekly", "monthly", "on_demand"]);
export const AgreementStatus = z.enum(["draft", "confirmed_by_mentor", "confirmed_by_entrepreneur", "active", "superseded"]);
export const GoalKind = z.enum(["metric", "qualitative", "capability", "strategic"]);
export const GoalPriority = z.enum(["high", "medium", "low"]);
export const GoalStatus = z.enum(["active", "achieved", "partially_achieved", "deferred", "discarded"]);

export const ItemChange = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("edit"), title: str(120).optional(), content: str(2000).optional(), category: Category.optional(), uncertainty: Uncertainty.optional(), reason: str(500).optional() }),
  z.object({ kind: z.literal("confirm") }),
  z.object({ kind: z.literal("reject"), reason: str(500) }),
  z.object({ kind: z.literal("request_clarification"), reason: str(500) }),
  z.object({ kind: z.literal("mark_unknown"), reason: str(500).optional() }),
  z.object({ kind: z.literal("attach_evidence"), evidenceId: id }),
  z.object({ kind: z.literal("prioritize"), rank: z.number().int().min(1).max(50), rationale: str(500) }),
]);

export const NewItem = z.object({ category: Category, title: str(120), content: str(2000), uncertainty: Uncertainty, infoType: HumanInfoType.optional() });

export const NewProject = z.object({ name: str(80), description: str(1000), nature: Nature });

export const HypothesisInput = z.object({
  statement: str(600),
  segment: str(200),
  whyItMatters: str(600),
  currentEvidence: str(600),
  uncertainty: Uncertainty,
  costOfBeingWrong: str(600),
  evaluationCriterion: str(600),
  relatedItemId: id.optional(),
});

export const ExperimentInput = z.object({
  question: str(600),
  method: str(600),
  participants: str(600),
  activities: z.array(str(200)).max(20),
  resources: str(600),
  budget: z.number().min(0).max(1e10).nullable(),
  durationDays: z.number().int().min(1).max(365).nullable(),
  metric: str(300),
  successCriterion: str(600),
  rejectionCriterion: str(600),
  risks: str(600),
  evidencePlan: str(600),
  reviewDate: z.string().max(40).optional(),
});

export const ResultInput = z.object({
  outcome: Outcome,
  observed: str(2000),
  metricValue: str(200),
  learnings: str(2000),
  limitations: str(2000),
  evidenceIds: z.array(id).max(20),
});

export const EvidenceInput = z.object({
  kind: z.enum(["note", "link", "file"]),
  title: str(160),
  description: str(2000),
  url: str(2000).optional(),
  file: z.object({ name: str(200), mimeType: str(100), sizeBytes: z.number().int().min(0) }).optional(),
});

export const MilestoneStatus = z.enum(["pending", "in_progress", "achieved", "deferred"]);

export const ActionType = z.enum([
  "operational_task",
  "skill_learning",
  "business_decision",
  "conversation_third_party",
  "financial_review",
  "mentor_intervention",
  "experiment",
  "research",
  "expert_referral",
]);

export const DelayCauseCategory = z.enum([
  "clarity",
  "time",
  "resources",
  "external",
  "priority_change",
  "execution_difficulty",
]);

export const DelayHypothesisInput = z.object({
  causeCategory: DelayCauseCategory,
  detail: str(2000),
});

export const MilestoneInput = z.object({
  title: str(200),
  description: str(2000).optional(),
  targetDate: z.string().max(40).optional(),
  goalId: id.optional(),
  relationId: id.optional(),
});

export const TaskInput = z.object({
  title: str(200),
  actionType: ActionType.optional(),
  milestoneId: id.optional(),
  goalId: id.optional(),
  experimentId: id.optional(),
  dueDate: z.string().max(40).optional(),
  blockedReason: str(2000).optional(),
});
export const TasksBatchInput = z.array(TaskInput).min(1).max(25);

export const MentorshipAgreementInput = z.object({
  frequency: AgreementFrequency,
  sessionDurationMinutes: z.number().int().min(15).max(240),
  authorizedChannels: z.array(str(100)).max(10),
  scope: str(4000),
  mentorCommitments: str(4000),
  entrepreneurCommitments: str(4000),
  confidentialityTerms: str(4000),
  expectedDurationWeeks: z.number().int().min(1).max(104),
});

export const MentorshipGoalInput = z.object({
  title: str(200),
  description: str(2000).default(""),
  whyItMatters: str(2000).default(""),
  kind: GoalKind,
  baseline: str(2000),
  targetResult: str(2000),
  metricIndicator: str(500).optional(),
  targetDate: z.string().max(40).optional(),
  priority: GoalPriority,
  relatedDiagnosisItemIds: z.array(id).max(20).optional(),
});

/** Parsea o lanza un error de validación con un mensaje legible. */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw validation("Los datos enviados no son válidos. Revisá los campos e intentá de nuevo.");
  return r.data;
}

/* ── Onboarding ── */

const EntrepreneurGoal = z.enum(["order_idea", "what_to_test", "find_mentor", "first_customers", "prepare_funding"]);
const Expertise = z.enum(["strategy", "finance", "marketing_sales", "product", "operations", "legal", "technology", "social_impact"]);

export const OnboardingInput = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("entrepreneur"),
    name: str(120),
    profile: z.object({
      intent: z.literal("entrepreneur"),
      sector: str(120),
      stage: Nature,
      goals: z.array(EntrepreneurGoal).min(1).max(5),
      weeklyHours: z.enum(["lt2", "2to5", "5to10", "gt10"]),
      mentorExpectation: str(600),
    }),
    firstProject: NewProject,
  }),
  z.object({
    intent: z.literal("mentor"),
    name: str(120),
    profile: z.object({
      intent: z.literal("mentor"),
      expertise: z.array(Expertise).min(1).max(8),
      sectors: str(300),
      yearsExperience: z.enum(["lt3", "3to7", "8to15", "gt15"]),
      monthlyHours: z.number().int().min(1).max(80),
      maxProjects: z.number().int().min(1).max(10),
      bio: str(1200),
      linkedinUrl: z.string().url().max(300).regex(/^https:\/\//).optional(),
    }),
  }),
  z.object({
    intent: z.literal("admin"),
    name: str(120),
    profile: z.object({ intent: z.literal("admin"), organization: str(160), program: str(600) }),
  }),
]);


export const SessionScheduleInput = z.object({
  kind: SessionKind,
  scheduledAt: z.string().max(40).optional(),
  relationId: id.optional(),
});

export const SessionNoteInput = z.object({
  kind: NoteKind,
  body: str(2000),
  isPrivate: z.boolean().optional(),
  relatedItemId: id.optional(),
});

export const SessionNotesBatchInput = z.array(SessionNoteInput).min(1).max(25);

/* ── Recursos del Mentor ── */

export const ResourceCategory = z.enum([
  "framework",
  "questionnaire",
  "template",
  "guide",
  "experiment_pattern",
]);

export const MentorResourceInput = z.object({
  title: str(200),
  category: ResourceCategory,
  description: str(1000),
  content: str(10000),
  tags: z.array(str(50)).max(10).default([]),
  isPublic: z.boolean().default(true),
});

/* ── Cartera e Intervenciones ── */

export const InterventionStatus = z.enum(["pending", "accepted", "dismissed", "snoozed"]);

export const UpdateInterventionInput = z.object({
  status: InterventionStatus,
});

/* ── Evaluación de Ciclo y Cierre ── */

export const AutonomyRating = z.enum(["nascent", "developing", "autonomous"]);

export const CycleDecision = z.enum(["renew", "close", "new_stage"]);

export const GoalEvaluationItem = z.object({
  goalId: id,
  goalTitle: str(200),
  baseline: str(2000),
  targetResult: str(2000),
  actualResult: str(2000),
  status: GoalStatus,
  evidenceNotes: str(2000).default(""),
});

export const CycleEvaluationInput = z.object({
  relationId: id,
  cycleNumber: z.number().int().min(1).default(1),
  goalEvaluations: z.array(GoalEvaluationItem).min(1).max(20),
  autonomyAssessment: z.object({
    rating: AutonomyRating,
    observations: str(2000),
  }),
  mentorFeedback: str(4000),
  entrepreneurFeedback: str(4000).optional(),
  decision: CycleDecision,
  nextCycleFocus: str(2000).optional(),
});
