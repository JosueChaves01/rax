import "server-only";
import type { AgentArtifact, AgentMessage, AgentThread, KnowledgeCitation } from "@/types/domain";
import { notFound, validation } from "@/lib/errors";
import { guard, sysRepo, type ServiceDeps } from "./base";

const MAX_AGENT_MESSAGE_LENGTH = 10_000;
const MAX_PROPOSALS = 50;

function ensureChatRole(role: ServiceDeps["actor"]["role"]) {
  if (role !== "entrepreneur" && role !== "mentor") throw notFound("Este proyecto no existe o no tenés acceso.");
}

export async function authorizedThread(d: ServiceDeps, threadId: string): Promise<AgentThread> {
  const thread = await d.repo.agentThreads.get(threadId);
  if (!thread || thread.creatorId !== d.actor.id) throw notFound("Este hilo no existe o no tenés acceso.");
  await guard(d, thread.projectId, "project.read");
  ensureChatRole(d.actor.role);
  return thread;
}

/** Crea un nuevo hilo de conversación aislado para el proyecto actual. */
export async function createAgentThread(d: ServiceDeps, projectId: string, title?: string): Promise<AgentThread> {
  await guard(d, projectId, "project.read");
  ensureChatRole(d.actor.role);
  const cleanTitle = (title ?? "Nuevo chat").trim().slice(0, 200) || "Nuevo chat";
  const now = d.now();
  const thread: AgentThread = {
    id: d.newId("agt"),
    projectId,
    creatorId: d.actor.id,
    title: cleanTitle,
    isPinned: false,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  return d.repo.agentThreads.insert(thread);
}

/** Devuelve los hilos del actor en el proyecto ordenados por actualización reciente. */
export async function listProjectThreads(d: ServiceDeps, projectId: string): Promise<AgentThread[]> {
  await guard(d, projectId, "project.read");
  ensureChatRole(d.actor.role);
  let threads = await d.repo.agentThreads.list({ projectId, creatorId: d.actor.id });
  if (threads.length === 0) {
    const defaultThread = await getOrCreateAgentThread(d, projectId);
    threads = [defaultThread];
  }
  return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Cambia el título de un hilo existente. */
export async function renameAgentThread(d: ServiceDeps, threadId: string, newTitle: string): Promise<AgentThread> {
  const thread = await authorizedThread(d, threadId);
  const clean = newTitle.trim().slice(0, 200);
  if (!clean) throw validation("El título del chat no puede estar vacío.");
  return d.repo.agentThreads.update(thread.id, { title: clean, updatedAt: d.now() });
}

/** Recupera el hilo más reciente o crea uno nuevo por defecto si no hay ninguno. */
export async function getOrCreateAgentThread(d: ServiceDeps, projectId: string): Promise<AgentThread> {
  await guard(d, projectId, "project.read");
  ensureChatRole(d.actor.role);
  const threads = await d.repo.agentThreads.list({ projectId, creatorId: d.actor.id });
  const sorted = threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (sorted[0]) return sorted[0];
  return createAgentThread(d, projectId, "Chat principal");
}

/** Returns the current actor's thread without creating one, for history loading. */
export async function getAgentThread(d: ServiceDeps, projectId: string): Promise<AgentThread | undefined> {
  await guard(d, projectId, "project.read");
  ensureChatRole(d.actor.role);
  const threads = await d.repo.agentThreads.list({ projectId, creatorId: d.actor.id });
  return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export async function listAgentMessages(d: ServiceDeps, threadId: string): Promise<AgentMessage[]> {
  await authorizedThread(d, threadId);
  const messages = await d.repo.agentMessages.list({ threadId });
  return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function appendAgentUserMessage(d: ServiceDeps, threadId: string, content: string): Promise<AgentMessage> {
  const thread = await authorizedThread(d, threadId);
  const clean = content.trim();
  if (!clean || clean.length > MAX_AGENT_MESSAGE_LENGTH) {
    throw validation(`El mensaje debe tener entre 1 y ${MAX_AGENT_MESSAGE_LENGTH} caracteres.`);
  }
  const userMsg = await d.repo.agentMessages.insert({
    id: d.newId("agtmsg"),
    threadId,
    projectId: thread.projectId,
    author: "user",
    authorId: d.actor.id,
    content: clean,
    proposals: [],
    artifacts: [],
    citations: [],
    status: "complete",
    createdAt: d.now(),
  });
  // Si el hilo tenía el título por defecto "Nuevo chat", auto-asignarle las primeras palabras del mensaje
  if (thread.title === "Nuevo chat") {
    const autoTitle = clean.slice(0, 40).replace(/[\r\n]+/g, " ");
    await d.repo.agentThreads.update(thread.id, { title: autoTitle, updatedAt: d.now() }).catch(() => { });
  } else {
    await d.repo.agentThreads.update(thread.id, { updatedAt: d.now() }).catch(() => { });
  }
  return userMsg;
}

/** Server-only persistence path for model output; never accepts a client-selected author. */
export async function appendAgentAssistantMessage(
  d: ServiceDeps,
  threadId: string,
  input: {
    content: string;
    proposals?: Array<Record<string, unknown>>;
    artifacts?: AgentArtifact[];
    citations?: KnowledgeCitation[];
    error?: { code: string; message: string };
  },
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
    id: d.newId("agtmsg"),
    threadId,
    projectId: thread.projectId,
    author: "assistant",
    authorId: thread.creatorId,
    content: clean,
    proposals,
    artifacts: input.artifacts ?? [],
    citations: input.citations ?? [],
    status: input.error ? "failed" : "complete",
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
