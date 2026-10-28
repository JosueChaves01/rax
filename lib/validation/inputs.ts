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
export const SessionKind = z.enum(["first_review", "second_review"]);
export const NoteKind = z.enum(["observation", "question", "suggestion", "agreement"]);
export const Decision = z.enum(["continue", "reformulate", "deepen", "pause", "discard"]);
export const Outcome = z.enum(["positive", "negative", "mixed", "inconclusive"]);
export const TaskStatus = z.enum(["todo", "doing", "done", "blocked"]);
export const CommentTarget = z.enum(["diagnosis_item", "hypothesis", "experiment"]);

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

export const TaskInput = z.object({ title: str(200), experimentId: id.optional(), dueDate: z.string().max(40).optional() });

/** Parsea o lanza un error de validación con un mensaje legible. */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw validation("Los datos enviados no son válidos. Revisá los campos e intentá de nuevo.");
  return r.data;
}
