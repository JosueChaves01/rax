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
