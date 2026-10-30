import "server-only";
import type { AgentMessage, AgentThread } from "@/types/domain";
import { notFound, validation } from "@/lib/errors";
import { guard, sysRepo, type ServiceDeps } from "./base";

const MAX_AGENT_MESSAGE_LENGTH = 10_000;
const MAX_PROPOSALS = 50;

function ensureChatRole(role: ServiceDeps["actor"]["role"]) {
  if (role !== "entrepreneur" && role !== "mentor") throw notFound("Este proyecto no existe o no tenés acceso.");
}

async function authorizedThread(d: ServiceDeps, threadId: string): Promise<AgentThread> {
  const thread = await d.repo.agentThreads.get(threadId);
  if (!thread || thread.creatorId !== d.actor.id) throw notFound("Este hilo no existe o no tenés acceso.");
  await guard(d, thread.projectId, "project.read");
  ensureChatRole(d.actor.role);
  return thread;
}

/** One private unified-agent thread per actor and project, independent from interview chat. */
export async function getOrCreateAgentThread(d: ServiceDeps, projectId: string): Promise<AgentThread> {
  await guard(d, projectId, "project.read");
  ensureChatRole(d.actor.role);
  const existing = (await d.repo.agentThreads.list({ projectId, creatorId: d.actor.id }))[0];
  if (existing) return existing;
  const now = d.now();
  const thread: AgentThread = {
    id: d.newId("agt"), projectId, creatorId: d.actor.id, status: "active", createdAt: now, updatedAt: now,
  };
  try {
    return await d.repo.agentThreads.insert(thread);
  } catch (error) {
    // Concurrent creation is resolved through the unique (project, creator) constraint.
    const raced = (await d.repo.agentThreads.list({ projectId, creatorId: d.actor.id }))[0];
    if (raced) return raced;
    throw error;
  }
}

/** Returns the current actor's thread without creating one, for history loading. */
export async function getAgentThread(d: ServiceDeps, projectId: string): Promise<AgentThread | undefined> {
  await guard(d, projectId, "project.read");
  ensureChatRole(d.actor.role);
  return (await d.repo.agentThreads.list({ projectId, creatorId: d.actor.id }))[0];
}

export async function listAgentMessages(d: ServiceDeps, threadId: string): Promise<AgentMessage[]> {
  await authorizedThread(d, threadId);
  return d.repo.agentMessages.list({ threadId });
}

export async function appendAgentUserMessage(d: ServiceDeps, threadId: string, content: string): Promise<AgentMessage> {
  const thread = await authorizedThread(d, threadId);
  const clean = content.trim();
  if (!clean || clean.length > MAX_AGENT_MESSAGE_LENGTH) {
    throw validation(`El mensaje debe tener entre 1 y ${MAX_AGENT_MESSAGE_LENGTH} caracteres.`);
  }
  return d.repo.agentMessages.insert({
    id: d.newId("agtmsg"), threadId, projectId: thread.projectId, author: "user", authorId: d.actor.id,
    content: clean, proposals: [], status: "complete", createdAt: d.now(),
  });
}

/** Server-only persistence path for model output; never accepts a client-selected author. */
export async function appendAgentAssistantMessage(
  d: ServiceDeps,
  threadId: string,
  input: { content: string; proposals?: Array<Record<string, unknown>>; error?: { code: string; message: string } },
): Promise<AgentMessage> {
  const thread = await authorizedThread(d, threadId);
  const clean = input.content.trim().slice(0, MAX_AGENT_MESSAGE_LENGTH) || (input.error ? "No se pudo completar esta respuesta." : "");
  if (!clean) throw validation("La respuesta del agente está vacía.");
  if ((input.proposals?.length ?? 0) > MAX_PROPOSALS) throw validation("La respuesta supera el límite de propuestas.");
  let proposals: Array<Record<string, unknown>>;
  try {
    const serialized = JSON.stringify(input.proposals ?? []);
    proposals = JSON.parse(serialized) as Array<Record<string, unknown>>;
    if (!Array.isArray(proposals)) throw new Error("not_array");
  } catch {
    throw validation("Las propuestas deben ser datos JSON válidos.");
  }

  const sys = sysRepo(d);
  const row: AgentMessage = {
    id: d.newId("agtmsg"), threadId, projectId: thread.projectId, author: "assistant", authorId: thread.creatorId,
    content: clean, proposals, status: input.error ? "failed" : "complete",
    ...(input.error ? { errorCode: input.error.code.slice(0, 100), errorMessage: input.error.message.slice(0, 1000) } : {}),
    createdAt: d.now(),
  };
  const saved = await sys.agentMessages.insert(row);
  await sys.agentThreads.update(thread.id, {
    status: input.error ? "error" : "active",
    lastErrorCode: input.error?.code.slice(0, 100),
    lastErrorMessage: input.error?.message.slice(0, 1000),
    updatedAt: d.now(),
  });
  return saved;
}
