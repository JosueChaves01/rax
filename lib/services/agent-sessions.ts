import "server-only";
import type { AgentMessage, AgentSession, AgentSessionNotes, AgentThread } from "@/types/domain";
import { notFound, validation } from "@/lib/errors";
import { guard, sysRepo, type ServiceDeps } from "./base";

/**
 * Sesiones del asistente (Proyecto → Sesión → Hilo, como los proyectos de Claude).
 * Una sesión agrupa hilos de un mismo frente de trabajo y guarda notas que mantiene el agente.
 * Los hilos sin sesión (anteriores a esta función o creados desde otras pantallas) se agrupan en
 * «Sesión general». Si la migración de sesiones todavía no está aplicada, todo sigue funcionando con
 * una sesión virtual que reúne todos los hilos.
 */

export const GENERAL_SESSION_TITLE = "Sesión general";
/** Id de la sesión virtual cuando la base todavía no tiene la tabla de sesiones. */
export const VIRTUAL_SESSION_ID = "general";

export const SESSION_LIMITS = {
  title: 200,
  goal: 2000,
  summary: 3000,
  listItems: 12,
  itemChars: 300,
} as const;

export const EMPTY_SESSION_NOTES: AgentSessionNotes = { summary: "", decisions: [], openQuestions: [], nextSteps: [] };

export interface SessionWithThreads extends AgentSession {
  threads: AgentThread[];
  /** Sesión virtual (sin migración): no se puede renombrar ni archivar. */
  virtual?: boolean;
  /** Última actividad de la sesión o de cualquiera de sus hilos. */
  lastActivityAt: string;
}

export interface ProjectSessionsView {
  sessions: SessionWithThreads[];
  /** false si falta la migración de sesiones: se muestra una única sesión virtual. */
  supported: boolean;
}

function ensureChatRole(role: ServiceDeps["actor"]["role"]) {
  if (role !== "entrepreneur" && role !== "mentor") throw notFound("Este proyecto no existe o no tenés acceso.");
}

/** Errores de esquema faltante (tabla o columna inexistente) de Postgres y PostgREST. */
export function isMissingSchemaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /42P01|42703|PGRST205|PGRST204|does not exist|schema cache|Could not find the/i.test(msg);
}

export function normalizeSessionNotes(notes: Partial<AgentSessionNotes> | null | undefined): AgentSessionNotes {
  const strings = (xs: unknown) =>
    Array.isArray(xs)
      ? [...new Set(xs.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, SESSION_LIMITS.itemChars)))]
      : [];
  return {
    summary: typeof notes?.summary === "string" ? notes.summary.slice(0, SESSION_LIMITS.summary) : "",
    decisions: strings(notes?.decisions).slice(-SESSION_LIMITS.listItems),
    openQuestions: strings(notes?.openQuestions).slice(-SESSION_LIMITS.listItems),
    nextSteps: strings(notes?.nextSteps).slice(-SESSION_LIMITS.listItems),
    ...(notes?.updatedAt ? { updatedAt: notes.updatedAt } : {}),
  };
}

const activeThreads = (threads: AgentThread[]) => threads.filter((t) => t.status !== "closed");
const byRecent = <T extends { updatedAt: string }>(xs: T[]) => [...xs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

function withThreads(session: AgentSession, threads: AgentThread[], virtual = false): SessionWithThreads {
  const sorted = byRecent(threads);
  const lastActivityAt = [session.updatedAt, ...sorted.map((t) => t.updatedAt)].sort().at(-1) ?? session.updatedAt;
  return { ...session, threads: sorted, lastActivityAt, ...(virtual ? { virtual: true } : {}) };
}

/** Sesión del actor, verificando que sea suya y que siga teniendo acceso al proyecto. */
export async function authorizedSession(d: ServiceDeps, sessionId: string): Promise<AgentSession> {
  const session = await d.repo.agentSessions.get(sessionId);
  if (!session || session.creatorId !== d.actor.id) throw notFound("Esta sesión no existe o no tenés acceso.");
  await guard(d, session.projectId, "project.read");
  ensureChatRole(d.actor.role);
  return session;
}

/** Crea una sesión nueva en el proyecto. */
export async function createAgentSession(
  d: ServiceDeps,
  projectId: string,
  input: { title?: string; goal?: string } = {},
): Promise<AgentSession> {
  await guard(d, projectId, "project.read");
  ensureChatRole(d.actor.role);
  const title = (input.title ?? "").trim().replace(/[\r\n]+/g, " ").slice(0, SESSION_LIMITS.title) || "Nueva sesión";
  const goal = (input.goal ?? "").trim().slice(0, SESSION_LIMITS.goal);
  const now = d.now();
  return d.repo.agentSessions.insert({
    id: d.newId("ags"),
    projectId,
    creatorId: d.actor.id,
    title,
    goal,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Sesiones del actor en el proyecto, cada una con sus hilos activos, de la más reciente a la más vieja.
 * Los hilos sin sesión se mueven (una sola vez) a «Sesión general».
 */
export async function listProjectSessions(d: ServiceDeps, projectId: string): Promise<ProjectSessionsView> {
  await guard(d, projectId, "project.read");
  ensureChatRole(d.actor.role);
  const threads = activeThreads(await d.repo.agentThreads.list({ projectId, creatorId: d.actor.id }));

  let sessions: AgentSession[];
  try {
    sessions = await d.repo.agentSessions.list({ projectId, creatorId: d.actor.id });
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
    const now = d.now();
    const virtual: AgentSession = {
      id: VIRTUAL_SESSION_ID,
      projectId,
      creatorId: d.actor.id,
      title: GENERAL_SESSION_TITLE,
      goal: "",
      status: "active",
      createdAt: threads.map((t) => t.createdAt).sort()[0] ?? now,
      updatedAt: threads.map((t) => t.updatedAt).sort().at(-1) ?? now,
    };
    return { supported: false, sessions: [withThreads(virtual, threads, true)] };
  }

  const known = new Set(sessions.map((s) => s.id));
  const orphans = threads.filter((t) => !t.sessionId || !known.has(t.sessionId));
  if (orphans.length > 0) {
    let general = sessions.find((s) => s.title === GENERAL_SESSION_TITLE && s.status === "active");
    if (!general) {
      const oldest = orphans.map((t) => t.createdAt).sort()[0] ?? d.now();
      general = await d.repo.agentSessions.insert({
        id: d.newId("ags"),
        projectId,
        creatorId: d.actor.id,
        title: GENERAL_SESSION_TITLE,
        goal: "Conversaciones que empezaron antes de organizar el trabajo en sesiones.",
        status: "active",
        createdAt: oldest,
        updatedAt: orphans.map((t) => t.updatedAt).sort().at(-1) ?? oldest,
      });
      sessions.push(general);
    }
    const sys = sysRepo(d);
    for (const t of orphans) {
      // El hilo conserva su fecha: moverlo de sesión no es actividad nueva.
      await sys.agentThreads.update(t.id, { sessionId: general.id });
      t.sessionId = general.id;
    }
  }

  const grouped = sessions.map((s) => withThreads(s, threads.filter((t) => t.sessionId === s.id)));
  grouped.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  return { supported: true, sessions: grouped };
}

/** Cambia título, objetivo o estado (archivar / reactivar) de una sesión. */
export async function updateAgentSession(
  d: ServiceDeps,
  sessionId: string,
  patch: { title?: string; goal?: string; status?: AgentSession["status"] },
): Promise<AgentSession> {
  const session = await authorizedSession(d, sessionId);
  const next: Partial<AgentSession> = { updatedAt: d.now() };
  if (patch.title !== undefined) {
    const title = patch.title.trim().replace(/[\r\n]+/g, " ").slice(0, SESSION_LIMITS.title);
    if (!title) throw validation("La sesión necesita un nombre.");
    next.title = title;
  }
  if (patch.goal !== undefined) next.goal = patch.goal.trim().slice(0, SESSION_LIMITS.goal);
  if (patch.status !== undefined) {
    if (patch.status !== "active" && patch.status !== "archived") throw validation("Estado de sesión inválido.");
    next.status = patch.status;
  }
  // La persona ya fue verificada como dueña: la escritura la hace el servidor.
  return sysRepo(d).agentSessions.update(session.id, next);
}

/**
 * Notas de la sesión que escribe el agente (herramienta update_session_notes). Se integran con las
 * existentes: las decisiones y próximos pasos se acumulan, las preguntas resueltas se quitan.
 */
export async function updateSessionNotes(
  d: ServiceDeps,
  sessionId: string,
  input: {
    summary?: string;
    goal?: string;
    addDecisions?: string[];
    addOpenQuestions?: string[];
    resolveOpenQuestions?: string[];
    nextSteps?: string[];
  },
): Promise<AgentSession> {
  const session = await authorizedSession(d, sessionId);
  const current = normalizeSessionNotes(session.notes);
  const resolved = new Set((input.resolveOpenQuestions ?? []).map((q) => q.trim().toLowerCase()));
  const notes = normalizeSessionNotes({
    summary: input.summary?.trim() ? input.summary.trim() : current.summary,
    decisions: [...current.decisions, ...(input.addDecisions ?? [])],
    openQuestions: [...current.openQuestions.filter((q) => !resolved.has(q.toLowerCase())), ...(input.addOpenQuestions ?? [])],
    nextSteps: input.nextSteps ? input.nextSteps : current.nextSteps,
    updatedAt: d.now(),
  });
  const patch: Partial<AgentSession> = { notes, updatedAt: d.now() };
  if (input.goal?.trim()) patch.goal = input.goal.trim().slice(0, SESSION_LIMITS.goal);
  return sysRepo(d).agentSessions.update(session.id, patch);
}

/** Archiva un hilo: deja de aparecer en la sesión, pero sus mensajes se conservan. */
export async function archiveAgentThread(d: ServiceDeps, threadId: string): Promise<AgentThread> {
  const thread = await d.repo.agentThreads.get(threadId);
  if (!thread || thread.creatorId !== d.actor.id) throw notFound("Este hilo no existe o no tenés acceso.");
  await guard(d, thread.projectId, "project.read");
  ensureChatRole(d.actor.role);
  return sysRepo(d).agentThreads.update(thread.id, { status: "closed", updatedAt: d.now() });
}

/** Contexto de la sesión para el agente: la sesión y lo esencial de los otros hilos de la sesión. */
export interface SessionAgentContext {
  id: string;
  title: string;
  goal: string;
  notes: AgentSessionNotes;
  siblings: Array<{ id: string; title: string; messages: number; summary: string; lastExchange: string[] }>;
}

const MAX_SIBLINGS = 6;

export async function loadSessionAgentContext(d: ServiceDeps, thread: AgentThread): Promise<SessionAgentContext | undefined> {
  if (!thread.sessionId) return undefined;
  let session: AgentSession | undefined;
  try {
    session = await d.repo.agentSessions.get(thread.sessionId);
  } catch (e) {
    if (isMissingSchemaError(e)) return undefined;
    throw e;
  }
  if (!session || session.creatorId !== d.actor.id || session.projectId !== thread.projectId) return undefined;

  const others = byRecent(
    activeThreads(await d.repo.agentThreads.list({ projectId: thread.projectId, creatorId: d.actor.id })).filter(
      (t) => t.sessionId === session!.id && t.id !== thread.id,
    ),
  ).slice(0, MAX_SIBLINGS);

  const siblings = await Promise.all(
    others.map(async (t) => {
      const messages = (await d.repo.agentMessages.list({ threadId: t.id }))
        .filter((m) => m.status !== "failed")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const lastExchange = messages.slice(-2).map((m) => `${m.author === "user" ? "Persona" : "RAX"}: ${m.content.replace(/\s+/g, " ").slice(0, 280)}`);
      return { id: t.id, title: t.title, messages: messages.length, summary: t.memory?.summary?.slice(0, 600) ?? "", lastExchange };
    }),
  );

  return { id: session.id, title: session.title, goal: session.goal, notes: normalizeSessionNotes(session.notes), siblings };
}

/** Mensajes recientes de otro hilo de la misma sesión (herramienta read_session_thread). */
export async function readSessionThread(
  d: ServiceDeps,
  currentThread: AgentThread,
  otherThreadId: string,
  limit = 16,
): Promise<{ title: string; messages: Array<{ autor: string; texto: string }> }> {
  const other = await d.repo.agentThreads.get(otherThreadId);
  if (
    !other ||
    other.creatorId !== d.actor.id ||
    other.projectId !== currentThread.projectId ||
    !currentThread.sessionId ||
    other.sessionId !== currentThread.sessionId
  ) {
    throw notFound("Ese hilo no pertenece a esta sesión.");
  }
  const messages: AgentMessage[] = (await d.repo.agentMessages.list({ threadId: other.id }))
    .filter((m) => m.status !== "failed")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-limit);
  return {
    title: other.title,
    messages: messages.map((m) => ({ autor: m.author === "user" ? "persona" : "RAX", texto: m.content.slice(0, 1500) })),
  };
}

/** Bloque del prompt con el estado de la sesión. */
export function renderSessionState(s: SessionAgentContext): string {
  const list = (xs: string[], empty: string) => (xs.length ? xs.map((x) => `- ${x}`).join("\n") : `- ${empty}`);
  const siblings = s.siblings.length
    ? s.siblings
        .map(
          (t) =>
            `- [${t.id}] «${t.title}» (${t.messages} mensajes)${t.summary ? `\n  Resumen: ${t.summary}` : ""}${t.lastExchange.length ? `\n  Último intercambio:\n  ${t.lastExchange.join("\n  ")}` : ""}`,
        )
        .join("\n")
    : "- ninguno: este es el único hilo de la sesión";
  return `<session_state id="${s.id}" title="${s.title.replace(/"/g, "'")}">
Objetivo de la sesión: ${s.goal || "sin definir (si la persona lo deja claro, regístralo con update_session_notes)"}
Resumen de la sesión: ${s.notes.summary || "sin resumen todavía"}
Decisiones de la sesión:
${list(s.notes.decisions, "ninguna registrada")}
Preguntas abiertas de la sesión:
${list(s.notes.openQuestions, "ninguna")}
Próximos pasos:
${list(s.notes.nextSteps, "ninguno")}
Otros hilos de esta sesión (puedes leerlos completos con read_session_thread):
${siblings}
</session_state>`;
}
