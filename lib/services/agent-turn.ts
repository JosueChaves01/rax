import "server-only";
import type { AgentMessage, AgentThread } from "@/types/domain";
import { executeClaudeAgentTurn, foldThreadMemory, type ClaudeTurnResult, type SessionContext } from "@/lib/ai/claude-orchestrator";
import { getProjectKnowledgeContext } from "@/lib/ai/knowledge-retrieval";
import { buildProjectState, type ProjectStateSnapshot } from "@/lib/ai/project-state";
import { conversationalMessages, messagesToFold, normalizeMemory, recentHistory } from "@/lib/ai/thread-memory";
import { guard, sysRepo, type ServiceDeps } from "./base";
import { getWorkspace } from "./projects";
import { appendAgentAssistantMessage, appendAgentUserMessage, authorizedThread, getOrCreateAgentThread, listAgentMessages } from "./agent-chat";

export interface AgentTurnResult {
  thread: AgentThread;
  userMessage?: AgentMessage;
  assistantMessage?: AgentMessage;
  result: ClaudeTurnResult;
}

/** Estado del proyecto visto por quien conversa. Si no se puede armar, el agente sigue con lo básico. */
export async function loadProjectState(d: ServiceDeps, projectId: string): Promise<ProjectStateSnapshot | undefined> {
  try {
    return buildProjectState(await getWorkspace(d, projectId), d.actor.role, d.now());
  } catch (e) {
    console.warn("[agent] No se pudo armar el estado del proyecto:", e instanceof Error ? e.message : e);
    return undefined;
  }
}

/**
 * Un turno completo del agente sobre un hilo persistente:
 * 1. guarda el mensaje de la persona en el hilo,
 * 2. arma el contexto (estado del proyecto, memoria del hilo, mensajes recientes, conocimiento),
 * 3. llama al agente y guarda su respuesta (o el fallo, sin inventar contenido),
 * 4. actualiza la memoria del hilo si la conversación ya no entra en la ventana.
 *
 * Con `ephemeral` (borradores de un campo, tareas de un experimento) no se escribe en ningún hilo:
 * el agente igual conoce el proyecto, pero el pedido no ensucia la conversación de la persona.
 */
export async function runAgentTurn(
  d: ServiceDeps,
  input: { projectId: string; threadId?: string; message: string; sessionContext?: SessionContext; ephemeral?: boolean },
): Promise<AgentTurnResult> {
  const { project } = await guard(d, input.projectId, "agent.chat");
  const thread = input.threadId ? await authorizedThread(d, input.threadId) : await getOrCreateAgentThread(d, project.id);
  if (thread.projectId !== project.id) throw new Error("thread_project_mismatch");

  const memory = normalizeMemory(thread.memory);
  const previous = input.ephemeral ? [] : await listAgentMessages(d, thread.id);
  const userMessage = input.ephemeral ? undefined : await appendAgentUserMessage(d, thread.id, input.message);

  const [projectState, knowledge] = await Promise.all([
    loadProjectState(d, project.id),
    getProjectKnowledgeContext(d.repo, project.id, input.message),
  ]);

  const result = await executeClaudeAgentTurn({
    project,
    userMessage: input.message,
    history: recentHistory(previous, memory),
    knowledge,
    role: d.actor.role,
    deps: d,
    sessionContext: input.sessionContext,
    projectState,
    thread: input.ephemeral ? undefined : { title: thread.title, memory, totalMessages: conversationalMessages(previous).length },
  });

  if (input.ephemeral) return { thread, result };

  const assistantMessage = await appendAgentAssistantMessage(d, thread.id, {
    content: result.reply,
    artifacts: result.artifacts,
    citations: result.citations,
    proposals: result.proposals,
    ...(result.unavailable ? { error: result.unavailable } : {}),
  });

  await refreshThreadMemory(d, thread.id).catch((e) => {
    // La memoria es una optimización: si falla (p. ej. falta la migración), el hilo sigue funcionando.
    console.warn("[agent] No se pudo actualizar la memoria del hilo:", e instanceof Error ? e.message : e);
  });

  return { thread, userMessage, assistantMessage, result };
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
