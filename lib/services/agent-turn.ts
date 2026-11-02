import "server-only";
import type { AgentMessage, AgentThread, AgentTurnMetrics } from "@/types/domain";
import {
  executeClaudeAgentTurn,
  foldThreadMemory,
  type AgentTurnEventHandler,
  type ClaudeTurnResult,
  type SessionContext,
} from "@/lib/ai/claude-orchestrator";
import { getProjectKnowledgeContext } from "@/lib/ai/knowledge-retrieval";
import { buildProjectState, type ProjectStateSnapshot } from "@/lib/ai/project-state";
import { messagesToFold, normalizeMemory, recentHistory, THREAD_WINDOW } from "@/lib/ai/thread-memory";
import { guard, sysRepo, type ServiceDeps } from "./base";
import { getWorkspace } from "./projects";
import { loadSessionAgentContext, type SessionAgentContext } from "./agent-sessions";
import {
  appendAgentAssistantMessage,
  appendAgentUserMessage,
  authorizedThread,
  getOrCreateAgentThread,
  listAgentMessages,
  recentAgentMessages,
} from "./agent-chat";
import { inBackground } from "./background";
import { enforceAiQuota } from "./ai-quota";

export interface AgentTurnResult {
  thread: AgentThread;
  userMessage?: AgentMessage;
  assistantMessage?: AgentMessage;
  result: ClaudeTurnResult;
}

/** Estado del proyecto visto por quien conversa. Si no se puede armar, el agente sigue con lo básico. */
export async function loadProjectState(d: ServiceDeps, projectId: string): Promise<ProjectStateSnapshot | undefined> {
  try {
    return buildProjectState(await getWorkspace(d, projectId, { forAgent: true }), d.actor.role, d.now());
  } catch (e) {
    console.warn("[agent] No se pudo armar el estado del proyecto:", e instanceof Error ? e.message : e);
    return undefined;
  }
}

/** Mensajes del final del hilo que se leen por turno: de sobra para la ventana reciente del modelo. */
const HISTORY_FETCH = THREAD_WINDOW.foldAbove * 2 + 10;

/**
 * Un turno completo del agente sobre un hilo persistente:
 * 1. guarda el mensaje de la persona en el hilo,
 * 2. arma el contexto (estado del proyecto, memoria del hilo, mensajes recientes, conocimiento),
 * 3. llama al agente y guarda su respuesta (o el fallo, sin inventar contenido),
 * 4. después de responder, actualiza la memoria del hilo si la conversación ya no entra en la ventana.
 *
 * Con `ephemeral` (borradores de un campo, tareas de un experimento) no se escribe en ningún hilo:
 * el agente igual conoce el proyecto, pero el pedido no ensucia la conversación de la persona.
 * `onEvent` recibe el progreso (estado y texto parcial) para mostrarlo mientras se genera.
 */
export async function runAgentTurn(
  d: ServiceDeps,
  input: { projectId: string; threadId?: string; message: string; sessionContext?: SessionContext; ephemeral?: boolean; onEvent?: AgentTurnEventHandler },
): Promise<AgentTurnResult> {
  const startedAt = Date.now();
  const { project } = await guard(d, input.projectId, "agent.chat");
  const thread = input.threadId ? await authorizedThread(d, input.threadId) : await getOrCreateAgentThread(d, project.id);
  if (thread.projectId !== project.id) throw new Error("thread_project_mismatch");
  await enforceAiQuota(d, "agent_message");

  const memory = normalizeMemory(thread.memory);
  const recent = input.ephemeral ? { messages: [], conversationalTotal: 0 } : await recentAgentMessages(d, thread, HISTORY_FETCH);
  const userMessage = input.ephemeral ? undefined : await appendAgentUserMessage(d, thread.id, input.message, thread);
  if (userMessage) input.onEvent?.({ type: "user_message", message: userMessage });
  input.onEvent?.({ type: "status", stage: "context", label: "Leyendo el proyecto…" });

  const [projectState, knowledge, session] = await Promise.all([
    loadProjectState(d, project.id),
    getProjectKnowledgeContext(d.repo, project.id, input.message),
    input.ephemeral ? Promise.resolve(undefined) : loadSessionContext(d, thread),
  ]);

  const result = await executeClaudeAgentTurn({
    project,
    userMessage: input.message,
    history: recentHistory(recent.messages, memory, recent.conversationalTotal),
    knowledge,
    role: d.actor.role,
    deps: d,
    sessionContext: input.sessionContext,
    projectState,
    thread: input.ephemeral
      ? undefined
      : { id: thread.id, title: thread.title, memory, totalMessages: recent.conversationalTotal, sessionId: thread.sessionId },
    session,
    onEvent: input.onEvent,
  });

  if (input.ephemeral) return { thread, result };

  const metrics: AgentTurnMetrics = { tools: [], modelCalls: 0, ...result.metrics, latencyMs: Date.now() - startedAt, knowledgeMode: knowledge.mode };
  const assistantMessage = await appendAgentAssistantMessage(
    d,
    thread.id,
    {
      content: result.reply,
      artifacts: result.artifacts,
      citations: result.citations,
      proposals: result.proposals,
      metrics,
      ...(result.unavailable ? { error: result.unavailable } : {}),
    },
    thread,
  );
  console.info(
    `[agent] turno ${result.unavailable ? "fallido" : "ok"} · ${metrics.latencyMs} ms · ${metrics.model ?? "sin modelo"} · ${metrics.modelCalls} llamadas · herramientas: ${metrics.tools.join(",") || "ninguna"}`,
  );

  // La memoria es una optimización: se pliega después de responder y solo si la ventana ya se llenó.
  const pendingAfterTurn = recent.conversationalTotal + (result.unavailable ? 1 : 2) - memory.coveredMessageCount;
  if (pendingAfterTurn > THREAD_WINDOW.foldAbove) {
    await inBackground("agent-memory", () => refreshThreadMemory(d, thread.id));
  }

  return { thread, userMessage, assistantMessage, result };
}

/** Lo que recibe la pantalla del chat al terminar un turno (por acción o por streaming). */
export function agentTurnPayload(turn: AgentTurnResult) {
  const { thread, userMessage, assistantMessage, result } = turn;
  if (!userMessage || !assistantMessage) throw new Error("agent_turn_not_persisted");
  return {
    threadId: thread.id,
    userMessage,
    assistantMessage,
    reply: assistantMessage.content,
    artifacts: result.artifacts,
    citations: result.citations,
    proposals: result.proposals,
    mode: result.mode,
    cachedPromptUsed: result.cachedPromptUsed ?? false,
    cacheStatus: result.cacheStatus ?? "simulated",
    cachedTokens: result.cachedTokens ?? 0,
    unavailable: result.unavailable ?? null,
    sessionId: thread.sessionId ?? null,
    sessionUpdated: result.sessionUpdated === true,
    followUps: assistantMessage.status === "failed" ? [] : (result.followUps ?? []),
  };
}

export type AgentTurnPayload = ReturnType<typeof agentTurnPayload>;

/** Contexto de la sesión del hilo. Si falla (p. ej. falta la migración), el agente sigue sin él. */
async function loadSessionContext(d: ServiceDeps, thread: AgentThread): Promise<SessionAgentContext | undefined> {
  try {
    return await loadSessionAgentContext(d, thread);
  } catch (e) {
    console.warn("[agent] No se pudo cargar la sesión del hilo:", e instanceof Error ? e.message : e);
    return undefined;
  }
}

/** Pliega en la memoria los mensajes que ya no entran en la ventana reciente. */
export async function refreshThreadMemory(d: ServiceDeps, threadId: string): Promise<AgentThread> {
  const thread = await authorizedThread(d, threadId);
  const memory = normalizeMemory(thread.memory);
  const messages = await listAgentMessages(d, thread.id);
  const folded = messagesToFold(messages, memory);
  if (folded.length === 0) return thread;
  const next = await foldThreadMemory(memory, folded, d.now());
  // La memoria la escribe el servidor: la persona no puede alterarla desde el navegador.
  return sysRepo(d).agentThreads.update(thread.id, { memory: next });
}
