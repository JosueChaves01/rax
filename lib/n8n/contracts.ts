import { z } from "zod";

/**
 * Contratos de integración canónicos entre RAX y n8n.
 * Versión de esquema: 1.0.0
 */

export const SCHEMA_VERSION = "1.0.0" as const;

/* ───────────── Actores y Contexto de Evento ───────────── */

export const EventActorSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["entrepreneur", "mentor", "admin", "system"]),
  verified: z.boolean().default(true),
});

export type EventActor = z.infer<typeof EventActorSchema>;

/* ───────────── Evento RAX → n8n ───────────── */

export const RaxEventSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  occurredAt: z.string().datetime(),
  schemaVersion: z.string().default(SCHEMA_VERSION),
  correlationId: z.string().min(1),
  actor: EventActorSchema,
  relationshipId: z.string().optional(),
  projectId: z.string().optional(),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  callback: z
    .object({
      url: z.string().url(),
      token: z.string().optional(),
    })
    .optional(),
});

export type RaxEvent = z.infer<typeof RaxEventSchema>;

/* ───────────── Propuestas de la IA ───────────── */

export const AiProposalItemSchema = z.object({
  type: z.enum([
    "task",
    "diagnosis_item",
    "hypothesis",
    "experiment",
    "goal",
    "recommendation",
    "intervention",
    "agenda_topic",
  ]),
  title: z.string().min(1).max(300),
  description: z.string().max(4000).optional(),
  category: z.string().optional(),
  ownerSuggestion: z.string().optional(),
  dueDateSuggestion: z.string().optional(),
  successCriteria: z.string().max(2000).optional(),
  evidenceRequired: z.string().max(2000).optional(),
  sourceQuote: z.string().max(1000).optional(),
  sourceEntityType: z.string().optional(),
  sourceEntityId: z.string().optional(),
  needsHumanApproval: z.boolean().default(true),
  uncertainties: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AiProposalItem = z.infer<typeof AiProposalItemSchema>;

/* ───────────── Respuesta / Callback n8n → RAX ───────────── */

export const AiUsageSchema = z.object({
  model: z.string().min(1),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  estimatedCostUsd: z.number().nonnegative().optional(),
});

export type AiUsage = z.infer<typeof AiUsageSchema>;

export const N8nCallbackPayloadSchema = z.object({
  operationId: z.string().min(1),
  correlationId: z.string().min(1),
  workflowId: z.string().min(1),
  workflowVersion: z.string().default("1.0.0"),
  status: z.enum(["completed", "failed", "rejected"]),
  executionTimeMs: z.number().nonnegative().optional(),
  usage: AiUsageSchema.optional(),
  data: z
    .object({
      summary: z.string().optional(),
      proposals: z.array(AiProposalItemSchema).default([]),
      rawOutput: z.unknown().optional(),
      uncertainties: z.array(z.string()).default([]),
      nextStepRecommendation: z.string().optional(),
    })
    .optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      recoverable: z.boolean().default(false),
      providerStatus: z.number().optional(),
    })
    .nullable()
    .optional(),
});

export type N8nCallbackPayload = z.infer<typeof N8nCallbackPayloadSchema>;

/* ───────────── Chat Síncrono (RAX-02) ───────────── */

export const ChatSyncRequestSchema = z.object({
  correlationId: z.string().min(1),
  projectId: z.string().min(1),
  relationshipId: z.string().optional(),
  actor: EventActorSchema,
  messageId: z.string().min(1),
  message: z.string().min(1).max(5000),
  context: z.object({
    projectName: z.string(),
    projectSummary: z.string().nullable().optional(),
    recentMessages: z.array(
      z.object({
        author: z.string(),
        content: z.string(),
        createdAt: z.string(),
      })
    ),
    currentItems: z.array(z.unknown()).default([]),
    coveredDimensions: z.array(z.string()).default([]),
    pendingDimensions: z.array(z.string()).default([]),
    /** Las notas privadas de mentor quedan explícitamente excluidas si el actor es emprendedor */
    mentorNotes: z.array(z.string()).default([]),
  }),
});

export type ChatSyncRequest = z.infer<typeof ChatSyncRequestSchema>;

export const ChatSyncResponseSchema = z.object({
  correlationId: z.string().min(1),
  reply: z.string().min(1),
  dimension: z.string().optional(),
  proposals: z.array(AiProposalItemSchema).default([]),
  uncertainties: z.array(z.string()).default([]),
  usage: AiUsageSchema.optional(),
});

export type ChatSyncResponse = z.infer<typeof ChatSyncResponseSchema>;
