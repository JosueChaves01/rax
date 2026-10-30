import "server-only";
import type { AiProposalItem } from "./contracts";
import type { ProjectPhase, Role } from "@/types/domain";
import type { Action } from "@/lib/authz";
import { ChatSyncRequestSchema, type ChatSyncRequest } from "./contracts";
import { invokeSyncChatN8n } from "./dispatcher";
import { z } from "zod";

/** Logical capabilities exposed to the main agent. Never accept a workflow ID from a model/client. */
export const RAX_CAPABILITIES = {
  "RAX-00": { mode: "read", action: "admin.manage", roles: ["admin"], state: "unavailable" },
  "RAX-01": { mode: "write", action: "project.read", roles: [], state: "unavailable" },
  "RAX-02": { mode: "read", action: "agent.chat", roles: ["entrepreneur", "mentor"], state: "gated" },
  "RAX-03": { mode: "read", action: "project.read", roles: ["entrepreneur", "mentor"], state: "unavailable" },
  "RAX-04": { mode: "draft", action: "diagnosis.edit", roles: ["entrepreneur"], state: "unavailable" },
  "RAX-05": { mode: "read", action: "project.read", roles: ["mentor"], state: "unavailable" },
  "RAX-06": { mode: "draft", action: "diagnosis.comment", roles: ["mentor"], state: "unavailable" },
  "RAX-07": { mode: "draft", action: "goal.manage", roles: ["entrepreneur", "mentor"], state: "unavailable" },
  "RAX-08": { mode: "draft", action: "task.manage", roles: ["entrepreneur", "mentor"], state: "unavailable" },
  "RAX-09": { mode: "draft", action: "task.diagnose_delay", roles: ["mentor"], state: "unavailable" },
  "RAX-10": { mode: "draft", action: "mentor.request_review", roles: ["entrepreneur"], state: "unavailable" },
  "RAX-11": { mode: "read", action: "resource.manage", roles: ["entrepreneur", "mentor"], state: "unavailable" },
  "RAX-12": { mode: "draft", action: "experiment.design", roles: ["entrepreneur", "mentor"], state: "unavailable" },
  "RAX-13": { mode: "draft", action: "evidence.add", roles: ["entrepreneur"], state: "unavailable" },
  "RAX-14": { mode: "draft", action: "cycle.evaluate", roles: ["mentor"], state: "unavailable" },
  "RAX-15": { mode: "read", action: "admin.manage", roles: ["admin"], state: "unavailable" },
  "RAX-90": { mode: "write", action: "admin.manage", roles: ["admin"], state: "unavailable" },
  "RAX-91": { mode: "write", action: "admin.manage", roles: ["admin"], state: "unavailable" },
  "RAX-99": { mode: "write", action: "admin.manage", roles: ["admin"], state: "unavailable" },
} as const satisfies Record<string, { mode: "read" | "draft" | "write"; action: Action; roles: readonly Role[]; state: "gated" | "unavailable" }>;

export type RaxCapabilityId = keyof typeof RAX_CAPABILITIES;
export type MainAgentStage = ProjectPhase | "general" | "learning" | "form" | "session";

export const MainAgentFieldSchema = z.object({
  type: z.enum(["string", "number", "integer", "boolean", "date", "enum"]),
  label: z.string().max(160),
  description: z.string().max(1000).optional(),
  required: z.boolean().optional(),
  maxLength: z.number().int().min(1).max(10_000).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  options: z.array(z.string().max(200)).max(50).optional(),
}).strict();
export type MainAgentField = z.infer<typeof MainAgentFieldSchema>;

export const MainAgentTurnSchema = z.object({
  role: z.enum(["entrepreneur", "mentor", "admin"]),
  projectId: z.string().min(1).max(128),
  stage: z.enum([
    "new", "conversation", "summary_pending", "mentor_review_1", "prioritizing", "hypotheses",
    "experiments_preparing", "experiments_running", "results_review", "decided", "general", "learning", "form", "session",
  ]),
  section: z.string().max(160).optional(),
  flowId: z.enum(["RAX-00", "RAX-01", "RAX-02", "RAX-03", "RAX-04", "RAX-05", "RAX-06", "RAX-07", "RAX-08", "RAX-09", "RAX-10", "RAX-11", "RAX-12", "RAX-13", "RAX-14", "RAX-15", "RAX-90", "RAX-91", "RAX-99"]).optional(),
  taskId: z.string().max(128).optional(),
  entityId: z.string().max(128).optional(),
  fieldPath: z.string().max(200).optional(),
  currentValue: z.string().max(4000).optional(),
  fieldSchema: MainAgentFieldSchema.optional(),
  message: z.string().trim().min(1).max(4000),
});

export const MainAgentChatInputSchema = MainAgentTurnSchema.omit({ role: true }).strict();

export interface MainAgentTurn {
  role: Role;
  projectId?: string;
  stage: MainAgentStage;
  section?: string;
  flowId?: RaxCapabilityId;
  taskId?: string;
  entityId?: string;
  fieldPath?: string;
  currentValue?: unknown;
  fieldSchema?: z.infer<typeof MainAgentFieldSchema>;
  message: string;
}

export interface CapabilitySelection {
  primary: RaxCapabilityId;
  suggestedTools: RaxCapabilityId[];
  requiredAction: Action;
  mode: "read" | "draft" | "write";
}

/** Deterministic allowlist selection: untrusted text never becomes a workflow name or endpoint. */
export function selectRaxCapability(turn: MainAgentTurn): CapabilitySelection {
  const text = turn.message.toLocaleLowerCase();
  let primary: RaxCapabilityId = turn.flowId ?? "RAX-02";
  if (!turn.flowId && turn.stage === "session") primary = "RAX-05";
  else if (!turn.flowId && turn.stage === "learning") primary = "RAX-02";
  else if (!turn.flowId && /resumen|s[ií]ntesis|contexto|memoria|qu[eé] sabemos|lo que sabemos/.test(text)) primary = "RAX-03";
  else if (!turn.flowId && (turn.stage === "experiments_preparing" || turn.stage === "hypotheses" || /hip[oó]tesis|experimento|probar/.test(text))) primary = "RAX-12";
  else if (!turn.flowId && (turn.stage === "results_review" || /evidencia|resultado|m[eé]trica/.test(text))) primary = "RAX-13";
  else if (!turn.flowId && (turn.stage === "decided" || /evaluar ciclo|cierre de ciclo/.test(text))) primary = "RAX-14";
  else if (!turn.flowId && /tarea|compromiso|pendiente/.test(text)) primary = "RAX-08";
  else if (!turn.flowId && /bloque|atascad|intervenci[oó]n/.test(text)) primary = "RAX-09";
  else if (!turn.flowId && (turn.stage === "conversation" || turn.stage === "summary_pending")) primary = "RAX-04";
  else if (!turn.flowId && turn.role === "mentor" && turn.stage.startsWith("mentor")) primary = "RAX-05";

  const capability = RAX_CAPABILITIES[primary];
  // RAX-02 is the sole present transport. Other tools may be selected but never silently invoked.
  return { primary, suggestedTools: primary === "RAX-02" ? [] : [primary], requiredAction: capability.action, mode: capability.mode };
}

export type MainAgentInvocation =
  | { ok: true; capability: "RAX-02"; reply: string; proposals: AiProposalItem[]; correlationId: string }
  | { ok: false; capability: RaxCapabilityId; status: "disabled" | "unavailable" | "invalid"; message: string };

/**
 * Executes only the RAX-02 allowlisted endpoint and only behind an explicit operator gate.
 * Authorization and context construction must happen server-side before calling this transport.
 */
export async function invokeMainAgent(turn: MainAgentTurn, request: ChatSyncRequest): Promise<MainAgentInvocation> {
  if (process.env.RAX_N8N_MAIN_AGENT_ENABLED !== "true") {
    return { ok: false, capability: "RAX-02", status: "disabled", message: "El agente principal n8n está deshabilitado hasta verificarse en staging." };
  }
  const parsed = ChatSyncRequestSchema.safeParse(request);
  if (!parsed.success
    || parsed.data.actor.role !== turn.role
    || parsed.data.projectId !== turn.projectId
    || parsed.data.workContext?.stage !== turn.stage
    || parsed.data.workContext?.flowId !== turn.flowId
    || parsed.data.workContext?.fieldPath !== turn.fieldPath
    || parsed.data.workContext?.entityId !== turn.entityId) {
    return { ok: false, capability: "RAX-02", status: "invalid", message: "El contexto del agente no coincide con la solicitud autorizada." };
  }
  const result = await invokeSyncChatN8n(parsed.data);
  if (!result.ok || !result.response) return { ok: false, capability: "RAX-02", status: "unavailable", message: result.error ?? "El agente no devolvió respuesta." };
  
  // Limpiar cualquier residuo de JSON o metadatos internos que el modelo haya podido filtrar en reply
  let cleanReply = result.response.reply;
  const jsonArtifactPattern = /\}?,?\s*"(?:askedDimension|proposals|uncertainties)"\s*:/;
  const artifactMatch = cleanReply.match(jsonArtifactPattern);
  if (artifactMatch && artifactMatch.index !== undefined) {
    cleanReply = cleanReply.slice(0, artifactMatch.index).trim();
  }
  // Eliminar posibles llaves o comillas desbalanceadas al final del texto limpio
  cleanReply = cleanReply.replace(/["\s,}]+$/, "").trim();

  return { ok: true, capability: "RAX-02", reply: cleanReply, proposals: result.response.proposals, correlationId: result.response.correlationId };
}

export function canUseCapability(role: Role, capabilityId: RaxCapabilityId, allowedActions: readonly Action[]): boolean {
  const { action } = RAX_CAPABILITIES[capabilityId];
  if (!allowedActions.includes(action) || !RAX_CAPABILITIES[capabilityId].roles.includes(role as never)) return false;
  // Admin is not implicitly granted project-content access by the global admin role.
  if (role === "admin" && action === "project.read") return false;
  return true;
}
