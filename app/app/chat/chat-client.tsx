"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/shared/ui/primitives";
import type { AgentArtifact, AgentMessage, AgentThread } from "@/types/domain";
import type { ProjectSessionsView } from "@/lib/services/agent-sessions";
import {
  applyAiProposalAction,
  archiveProjectThreadAction,
  createProjectSessionAction,
  createProjectThreadAction,
  getProjectKnowledgeStatsAction,
  listProjectSessionsAction,
  loadThreadMessagesAction,
  promoteDecisionToKnowledgeAction,
  renameProjectThreadAction,
  sendClaudeAgentMessageAction,
  updateProjectSessionAction,
} from "@/app/actions";
import { ChatInput } from "./chat-input";
import { ProjectInstructionsModal } from "./project-instructions-modal";
import { ProjectKnowledgePanel } from "./project-knowledge-panel";
import { ArtifactViewer } from "./artifact-viewer";
import { ProjectsGrid } from "./projects-grid";
import { ProjectOverview } from "./project-overview";
import { SessionSidebar } from "./session-sidebar";
import { ThreadMessages, type MessageView } from "./thread-messages";

/** Dónde está la persona: lista de proyectos → proyecto → sesión → hilo. Se refleja en la URL. */
interface Route {
  projectId?: string;
  sessionId?: string;
  threadId?: string;
}

/** Sesión virtual cuando la base todavía no tiene la tabla de sesiones (ver lib/services/agent-sessions). */
const VIRTUAL_SESSION_ID = "general";

function urlOf(r: Route): string {
  const p = new URLSearchParams();
  if (r.projectId) p.set("project", r.projectId);
  if (r.sessionId) p.set("session", r.sessionId);
  if (r.threadId) p.set("thread", r.threadId);
  const qs = p.toString();
  return qs ? `/app/chat?${qs}` : "/app/chat";
}

function readUrl(): Route {
  const p = new URLSearchParams(window.location.search);
  return { projectId: p.get("project") ?? undefined, sessionId: p.get("session") ?? undefined, threadId: p.get("thread") ?? undefined };
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function toView(m: AgentMessage): MessageView {
  return {
    id: m.id,
    sender: m.author === "user" ? "user" : "ai",
    senderName: m.author === "user" ? "Tú" : "RAX Copilot",
    text: m.content,
    time: time(m.createdAt),
    artifacts: m.artifacts,
    citations: m.citations,
    proposals: m.proposals,
    cacheStatus: m.status === "failed" ? "unavailable" : undefined,
  };
}

/** Título corto de una sesión a partir del primer mensaje. */
function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line || "Nueva sesión";
}

export default function ChatClient({
  projects,
  initialProjectId,
  initialSessionId,
  initialThreadId,
}: {
  projects: Array<{ id: string; name: string; description?: string; updatedAt?: string }>;
  initialProjectId?: string;
  initialSessionId?: string;
  initialThreadId?: string;
}) {
  const [route, setRoute] = useState<Route>(() => {
    const valid = initialProjectId && projects.some((p) => p.id === initialProjectId);
    if (valid) return { projectId: initialProjectId, sessionId: initialSessionId, threadId: initialThreadId };
    // Con un solo proyecto no hace falta pasar por la lista.
    return projects.length === 1 ? { projectId: projects[0].id } : {};
  });
  const [sessionsView, setSessionsView] = useState<ProjectSessionsView | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [appliedProposals, setAppliedProposals] = useState<Set<string>>(new Set());
  const [applyingProposalTitle, setApplyingProposalTitle] = useState<string | null>(null);

  const [activeArtifact, setActiveArtifact] = useState<AgentArtifact | null>(null);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isKnowledgeOpen, setIsKnowledgeOpen] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [knowledgeStats, setStats] = useState<{
    totalTokens: number;
    evaluation: { mode: "in_context" | "rag"; percentOfLimit: number };
  } | null>(null);

  const [saveModalMessage, setSaveModalMessage] = useState<MessageView | null>(null);
  const [saveDecisionTitle, setSaveDecisionTitle] = useState("");
  const [isSavingDecision, setIsSavingDecision] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** Hilo recién creado desde aquí: sus mensajes ya están en pantalla y no hay que recargarlos. */
  const freshThreadRef = useRef<string | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;

  const projectId = route.projectId ?? "";
  const activeProject = projects.find((p) => p.id === projectId);
  const sessions = useMemo(() => sessionsView?.sessions ?? [], [sessionsView]);
  const activeSession = sessions.find((s) => s.id === route.sessionId);
  const activeThread = activeSession?.threads.find((t) => t.id === route.threadId);

  /* ── Navegación ── */

  const go = useCallback((next: Route, opts: { replace?: boolean } = {}) => {
    if (next.threadId !== freshThreadRef.current) freshThreadRef.current = null;
    setRoute(next);
    setActiveArtifact(null);
    setIsSidebarOpen(false);
    if (typeof window === "undefined") return;
    const url = urlOf(next);
    if (opts.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  }, []);

  useEffect(() => {
    // La URL inicial puede haber cambiado (proyecto único, proyecto inválido): dejarla igual al estado.
    window.history.replaceState(null, "", urlOf(routeRef.current));
    const onPop = () => {
      const r = readUrl();
      setRoute(r.projectId && projects.some((p) => p.id === r.projectId) ? r : {});
      setActiveArtifact(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [projects]);

  /* ── Datos ── */

  const loadSessions = useCallback(async (pId: string) => {
    setLoadingSessions(true);
    try {
      const res = await listProjectSessionsAction(pId);
      if (routeRef.current.projectId !== pId) return null;
      if (res.ok && res.data) {
        setSessionsView(res.data);
        return res.data;
      }
      setNotice(!res.ok ? res.error : "No se pudieron cargar las sesiones.");
      return null;
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadKnowledgeStats = useCallback(async (pId: string) => {
    const res = await getProjectKnowledgeStatsAction(pId);
    if (res.ok && res.data) {
      setStats(res.data);
      setCustomInstructions(res.data.customInstructions || "");
    }
  }, []);

  // Al cambiar de proyecto: sesiones, instrucciones y conocimiento.
  useEffect(() => {
    setSessionsView(null);
    setStats(null);
    setCustomInstructions("");
    if (!projectId) return;
    loadSessions(projectId);
    loadKnowledgeStats(projectId);
  }, [projectId, loadSessions, loadKnowledgeStats]);

  // Completar la ruta cuando ya hay sesiones: el hilo sin sesión busca su sesión; la sesión sin hilo abre el más reciente.
  useEffect(() => {
    if (!sessionsView || !route.projectId) return;
    if (route.threadId && route.threadId === freshThreadRef.current) return; // recién creado; la lista se está recargando
    if (route.threadId && !route.sessionId) {
      const owner = sessionsView.sessions.find((s) => s.threads.some((t) => t.id === route.threadId));
      go({ ...route, sessionId: owner?.id ?? sessionsView.sessions[0]?.id, threadId: owner ? route.threadId : undefined }, { replace: true });
      return;
    }
    if (route.sessionId) {
      const s = sessionsView.sessions.find((x) => x.id === route.sessionId);
      if (!s) {
        go({ projectId: route.projectId }, { replace: true });
        return;
      }
      if (!route.threadId || !s.threads.some((t) => t.id === route.threadId)) {
        if (s.threads[0]) go({ ...route, threadId: s.threads[0].id }, { replace: true });
      }
    }
  }, [sessionsView, route, go]);

  // Mensajes del hilo abierto.
  useEffect(() => {
    const threadId = route.threadId;
    if (!projectId || !threadId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    if (freshThreadRef.current === threadId) {
      setLoadingMessages(false);
      return;
    }
    let cancelled = false;
    setLoadingMessages(true);
    setMessages([]);
    loadThreadMessagesAction(projectId, threadId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.data) setMessages(res.data.messages.map(toView));
        else setNotice(!res.ok ? res.error : "No se pudo abrir el hilo.");
      })
      .finally(() => !cancelled && setLoadingMessages(false));
    return () => {
      cancelled = true;
    };
  }, [projectId, route.threadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  /* ── Acciones ── */

  const sendMessageToAgent = async (textToSend: string, explicitThreadId?: string) => {
    const threadId = explicitThreadId ?? route.threadId;
    if (!textToSend.trim() || isLoading || !projectId || !threadId) return;
    setIsLoading(true);
    setNotice(null);
    try {
      const res = await sendClaudeAgentMessageAction({
        projectId,
        threadId,
        message: textToSend.trim(),
        sessionContext: { location: "global_assistant", pageTitle: "Asistente de IA de RAX (/app/chat)" },
      });
      if (res.ok && res.data) {
        const { userMessage, assistantMessage, artifacts, citations, proposals } = res.data;
        setMessages((prev) => [
          ...prev,
          toView(userMessage),
          {
            ...toView(assistantMessage),
            artifacts,
            citations,
            proposals,
            cachedPromptUsed: res.data!.cachedPromptUsed,
            cacheStatus: res.data!.unavailable ? "unavailable" : res.data!.cacheStatus,
            cachedTokens: res.data!.cachedTokens,
          },
        ]);
        if (artifacts && artifacts.length > 0) setActiveArtifact(artifacts[0]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: `err-${Date.now()}`, sender: "ai", senderName: "RAX Copilot", text: !res.ok ? res.error : "No se pudo procesar la respuesta.", time: "Aviso" },
        ]);
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "ai",
          senderName: "RAX Copilot",
          text: `Error al comunicar con el agente: ${err instanceof Error ? err.message : String(err)}`,
          time: "Error",
        },
      ]);
    } finally {
      setIsLoading(false);
      // Títulos automáticos, notas que escribió el agente y orden por actividad.
      await loadSessions(projectId);
      freshThreadRef.current = null;
    }
  };

  /** Abre un hilo nuevo (vacío) y deja la pantalla lista para escribir. */
  const openFreshThread = (sessionId: string, thread: AgentThread) => {
    freshThreadRef.current = thread.id;
    setMessages([]);
    go({ projectId, sessionId, threadId: thread.id });
  };

  const handleStartSession = async (firstMessage: string) => {
    if (!projectId || isStarting) return;
    setIsStarting(true);
    setNotice(null);
    try {
      let sessionId: string;
      let thread: AgentThread;
      if (sessionsView && !sessionsView.supported) {
        const res = await createProjectThreadAction(projectId, "Nuevo chat");
        if (!res.ok || !res.data) throw new Error(!res.ok ? res.error : "No se pudo crear el hilo.");
        sessionId = VIRTUAL_SESSION_ID;
        thread = res.data;
      } else {
        const res = await createProjectSessionAction(projectId, { title: titleFrom(firstMessage) });
        if (!res.ok || !res.data) throw new Error(!res.ok ? res.error : "No se pudo crear la sesión.");
        sessionId = res.data.session.id;
        thread = res.data.thread;
      }
      openFreshThread(sessionId, thread);
      await sendMessageToAgent(firstMessage, thread.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setIsStarting(false);
    }
  };

  const handleNewEmptySession = async () => {
    if (!projectId) return;
    setIsStarting(true);
    try {
      const res = await createProjectSessionAction(projectId, { title: "Nueva sesión" });
      if (!res.ok || !res.data) {
        setNotice(!res.ok ? res.error : "No se pudo crear la sesión.");
        return;
      }
      openFreshThread(res.data.session.id, res.data.thread);
      await loadSessions(projectId);
    } finally {
      setIsStarting(false);
    }
  };

  const handleNewThread = async () => {
    if (!projectId || !activeSession) return;
    const res = await createProjectThreadAction(projectId, "Nuevo chat", activeSession.virtual ? undefined : activeSession.id);
    if (!res.ok || !res.data) {
      setNotice(!res.ok ? res.error : "No se pudo crear el hilo.");
      return;
    }
    openFreshThread(activeSession.id, res.data);
    await loadSessions(projectId);
  };

  const handleRenameThread = async (threadId: string, title: string) => {
    const res = await renameProjectThreadAction(projectId, threadId, title);
    if (!res.ok) setNotice(res.error);
    await loadSessions(projectId);
  };

  const handleArchiveThread = async (thread: AgentThread) => {
    if (!window.confirm(`¿Archivar el hilo «${thread.title}»? Dejará de aparecer en la sesión.`)) return;
    const res = await archiveProjectThreadAction(projectId, thread.id);
    if (!res.ok) {
      setNotice(res.error);
      return;
    }
    const view = await loadSessions(projectId);
    if (thread.id === route.threadId) {
      const s = view?.sessions.find((x) => x.id === route.sessionId);
      if (s?.threads[0]) go({ projectId, sessionId: s.id, threadId: s.threads[0].id }, { replace: true });
      else go({ projectId }, { replace: true });
    }
  };

  const handleUpdateSession = async (patch: { title?: string; goal?: string; status?: "active" | "archived" }) => {
    if (!activeSession || activeSession.virtual) return;
    const res = await updateProjectSessionAction(projectId, activeSession.id, patch);
    if (!res.ok) setNotice(res.error);
    await loadSessions(projectId);
    if (patch.status === "archived") go({ projectId });
  };

  const handleApplyProposal = async (proposal: Record<string, unknown>) => {
    if (!projectId || typeof proposal.title !== "string") return;
    setApplyingProposalTitle(proposal.title);
    try {
      const res = await applyAiProposalAction(projectId, proposal);
      if (res.ok) setAppliedProposals((prev) => new Set(prev).add(String(proposal.title)));
      else setNotice(res.error);
    } finally {
      setApplyingProposalTitle(null);
    }
  };

  const handleSaveDecisionConfirm = async () => {
    if (!saveModalMessage || !saveDecisionTitle.trim() || !projectId) return;
    setIsSavingDecision(true);
    try {
      const res = await promoteDecisionToKnowledgeAction(projectId, {
        title: saveDecisionTitle.trim(),
        content: saveModalMessage.text,
        messageId: saveModalMessage.id,
      });
      if (res.ok) {
        setSaveModalMessage(null);
        setSaveDecisionTitle("");
        await loadKnowledgeStats(projectId);
      }
    } finally {
      setIsSavingDecision(false);
    }
  };

  /* ── Vistas ── */

  const inThread = !!(route.projectId && route.sessionId);
  const knowledgeMode = knowledgeStats?.evaluation.mode ?? "in_context";

  let content: React.ReactNode;
  if (!activeProject) {
    content = <ProjectsGrid projects={projects} onOpen={(id) => go({ projectId: id })} />;
  } else if (!inThread) {
    content = (
      <ProjectOverview
        project={activeProject}
        sessions={sessions}
        sessionsSupported={sessionsView?.supported ?? true}
        loading={loadingSessions}
        isStarting={isStarting}
        instructions={customInstructions}
        knowledgeTokens={knowledgeStats?.totalTokens ?? 0}
        knowledgeMode={knowledgeMode}
        canGoBack={projects.length > 1}
        onBack={() => go({})}
        onStartSession={handleStartSession}
        onNewEmptySession={handleNewEmptySession}
        onOpenSession={(sessionId) => go({ projectId, sessionId })}
        onOpenThread={(sessionId, threadId) => go({ projectId, sessionId, threadId })}
        onOpenInstructions={() => setIsInstructionsOpen(true)}
        onOpenKnowledge={() => setIsKnowledgeOpen(true)}
      />
    );
  } else {
    content = (
      <div className="flex h-full min-w-0">
        {isSidebarOpen && <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/40" onClick={() => setIsSidebarOpen(false)} aria-hidden="true" />}
        <div
          className={cx(
            "fixed inset-y-0 left-0 z-50 h-dvh bg-white shadow-2xl transition-transform duration-200 ease-out",
            "lg:static lg:z-auto lg:h-full lg:shadow-none lg:translate-x-0 lg:transition-none",
            isSidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {activeSession ? (
            <SessionSidebar
              key={activeSession.id}
              projectName={activeProject.name}
              session={activeSession}
              otherSessions={sessions.filter((s) => s.id !== activeSession.id)}
              activeThreadId={route.threadId ?? null}
              sessionsSupported={sessionsView?.supported ?? true}
              onBackToProject={() => go({ projectId })}
              onSelectThread={(threadId) => go({ projectId, sessionId: activeSession.id, threadId })}
              onNewThread={handleNewThread}
              onRenameThread={handleRenameThread}
              onArchiveThread={handleArchiveThread}
              onOpenSession={(sessionId) => go({ projectId, sessionId })}
              onUpdateSession={handleUpdateSession}
              onOpenInstructions={() => {
                setIsSidebarOpen(false);
                setIsInstructionsOpen(true);
              }}
              onOpenKnowledge={() => {
                setIsSidebarOpen(false);
                setIsKnowledgeOpen(true);
              }}
              onClose={() => setIsSidebarOpen(false)}
              knowledgeTokens={knowledgeStats?.totalTokens ?? 0}
            />
          ) : (
            <div className="w-72 h-full p-4 space-y-2 border-r border-slate-200 bg-slate-50/70" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 rounded-xl bg-white animate-pulse" />
              ))}
            </div>
          )}
        </div>

        {/* Conversación */}
        <div className="@container flex-1 flex flex-col min-w-0 bg-white">
          <div className="px-2.5 py-2 @lg:px-4 @lg:py-3 border-b border-slate-200/80 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden w-9 h-9 shrink-0 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center"
                aria-label="Abrir sesión e hilos"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="min-w-0">
                <nav aria-label="Ubicación" className="flex items-center gap-1 text-[0.6875rem] text-slate-400 min-w-0">
                  <button type="button" onClick={() => go({ projectId })} className="truncate max-w-[9rem] hover:text-slate-700">
                    {activeProject.name}
                  </button>
                  <span aria-hidden="true">›</span>
                  <span className="truncate max-w-[10rem] @lg:max-w-xs">{activeSession?.title ?? "Sesión"}</span>
                </nav>
                <h1 className="text-sm font-bold text-slate-900 truncate">{activeThread?.title ?? "Nuevo chat"}</h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleNewThread}
                disabled={!activeSession}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition disabled:opacity-50"
                title="Nuevo hilo en esta sesión"
              >
                +<span className="hidden @lg:inline"> Nuevo hilo</span>
              </button>
              {activeArtifact && (
                <button
                  type="button"
                  onClick={() => setActiveArtifact(null)}
                  className="hidden lg:inline-flex px-2.5 py-1.5 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition"
                >
                  Cerrar artefacto
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 @lg:p-6 space-y-5 bg-slate-50/30">
            {loadingMessages ? (
              <div className="space-y-3" aria-busy="true">
                <div className="h-12 w-2/3 rounded-2xl bg-white border border-slate-200/70 animate-pulse" />
                <div className="h-20 w-4/5 ml-auto rounded-2xl bg-slate-200/50 animate-pulse" />
              </div>
            ) : messages.length === 0 && !isLoading ? (
              <div className="min-h-full flex flex-col items-center justify-center text-center p-3 @lg:p-6 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-orange-600 text-xl font-bold">⚡</div>
                <h2 className="text-sm font-bold text-slate-800">Nuevo hilo en «{activeSession?.title ?? activeProject.name}»</h2>
                <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                  El agente conoce el proyecto, sus instrucciones y conocimiento, las notas de esta sesión y lo que se habló en sus otros hilos.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {(
                    [
                      ["🎯 Supuestos críticos", "¿Cuáles son los supuestos más críticos de este proyecto?"],
                      ["🧭 ¿Qué sigue?", "¿Cuál es el siguiente paso concreto en esta sesión?"],
                      ["📝 Resumen de la sesión", "Resume lo que llevamos en esta sesión y anota las decisiones y pendientes."],
                    ] as const
                  ).map(([label, prompt]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => sendMessageToAgent(prompt)}
                      className="px-3 py-1.5 text-xs bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-2xs transition"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ThreadMessages
                messages={messages}
                appliedProposals={appliedProposals}
                applyingProposalTitle={applyingProposalTitle}
                onApplyProposal={handleApplyProposal}
                onOpenArtifact={setActiveArtifact}
                onSaveToKnowledge={(m) => {
                  setSaveModalMessage(m);
                  setSaveDecisionTitle(`Decisión: ${m.text.slice(0, 30)}...`);
                }}
              />
            )}

            {isLoading && (
              <div className="flex flex-col items-start space-y-1">
                <span className="text-[10px] text-slate-400 font-mono px-1">RAX Copilot • pensando con el contexto de la sesión…</span>
                <div className="bg-white text-slate-600 border border-slate-200/80 rounded-2xl p-3.5 text-xs flex items-center gap-2.5 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-orange-600 animate-ping" />
                  <span>Generando respuesta…</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <ChatInput
            onSend={(text) => sendMessageToAgent(text)}
            isLoading={isLoading}
            disabled={!route.threadId || loadingMessages}
            placeholder="Escribe tu consulta o pide un artefacto…"
          />
        </div>

        {activeArtifact && (
          <ArtifactViewer
            artifact={activeArtifact}
            onClose={() => setActiveArtifact(null)}
            onSaveToKnowledge={async (art) => {
              await promoteDecisionToKnowledgeAction(projectId, { title: art.title, filename: `${art.identifier}.md`, content: art.content });
              await loadKnowledgeStats(projectId);
              setNotice("Artefacto guardado en el conocimiento del proyecto.");
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative max-w-[1600px] mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm h-[calc(100dvh-176px)] min-h-[420px] md:h-[calc(100vh-130px)] md:min-h-[640px] overflow-hidden">
      {content}

      {notice && (
        <div role="status" className="absolute left-1/2 -translate-x-1/2 bottom-24 z-40 max-w-[90%] px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs shadow-lg flex items-center gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-slate-300 hover:text-white" aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {activeProject && (
        <>
          <ProjectInstructionsModal
            key={`instr-${projectId}-${customInstructions.length}`}
            projectId={projectId}
            projectName={activeProject.name}
            initialInstructions={customInstructions}
            isOpen={isInstructionsOpen}
            onClose={() => setIsInstructionsOpen(false)}
            onSaved={(inst) => {
              setCustomInstructions(inst);
              loadKnowledgeStats(projectId);
            }}
          />
          <ProjectKnowledgePanel
            projectId={projectId}
            projectName={activeProject.name}
            isOpen={isKnowledgeOpen}
            onClose={() => setIsKnowledgeOpen(false)}
            onKnowledgeUpdated={() => loadKnowledgeStats(projectId)}
          />
        </>
      )}

      {saveModalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Guardar en el conocimiento del proyecto</h3>
            <p className="text-xs text-slate-500">
              Esta conclusión se convertirá en un documento del proyecto y estará disponible en todas las sesiones.
            </p>
            <div>
              <label htmlFor="decision-title" className="block text-xs font-semibold text-slate-700 mb-1">
                Título
              </label>
              <input
                id="decision-title"
                type="text"
                value={saveDecisionTitle}
                onChange={(e) => setSaveDecisionTitle(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                placeholder="Ej. Criterio de precio validado"
              />
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 max-h-36 overflow-y-auto text-xs text-slate-600 font-mono">{saveModalMessage.text}</div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setSaveModalMessage(null)} className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveDecisionConfirm}
                disabled={isSavingDecision || !saveDecisionTitle.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-xl shadow-xs"
              >
                {isSavingDecision ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
