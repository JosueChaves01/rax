"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { cx } from "@/shared/ui/primitives";
import type { AgentArtifact, AgentThread, KnowledgeCitation } from "@/types/domain";
import {
  applyAiProposalAction,
  createProjectThreadAction,
  getProjectKnowledgeStatsAction,
  listProjectThreadsAction,
  loadThreadMessagesAction,
  promoteDecisionToKnowledgeAction,
  renameProjectThreadAction,
  sendClaudeAgentMessageAction,
} from "@/app/actions";
import { ChatInput } from "./chat-input";
import { FormattedText } from "./formatted-text";
import { ProjectSidebar } from "./project-sidebar";
import { ProjectInstructionsModal } from "./project-instructions-modal";
import { ProjectKnowledgePanel } from "./project-knowledge-panel";
import { ArtifactViewer } from "./artifact-viewer";

interface MessageView {
  id: string;
  sender: "user" | "ai";
  senderName: string;
  text: string;
  time: string;
  chips?: string[];
  artifacts?: AgentArtifact[];
  citations?: KnowledgeCitation[];
  proposals?: Array<Record<string, unknown>>;
  cachedPromptUsed?: boolean;
  cacheStatus?: string;
  cachedTokens?: number;
}

export default function ChatClient({
  projects,
  initialProjectId,
  initialThreadId,
}: {
  projects: Array<{ id: string; name: string }>;
  initialProjectId?: string;
  initialThreadId?: string;
}) {
  const [projectId, setProjectId] = useState(() => {
    if (initialProjectId && projects.some((p) => p.id === initialProjectId)) {
      return initialProjectId;
    }
    return projects[0]?.id ?? "";
  });
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [appliedProposals, setAppliedProposals] = useState<Set<string>>(new Set());
  const [applyingProposalTitle, setApplyingProposalTitle] = useState<string | null>(null);

  // Claude Projects context & artifacts
  const [activeArtifact, setActiveArtifact] = useState<AgentArtifact | null>(null);
  const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
  const [isKnowledgeOpen, setIsKnowledgeOpen] = useState(false);
  const [customInstructions, setCustomInstructions] = useState("");
  const [knowledgeStats, setStats] = useState<{
    totalTokens: number;
    evaluation: { mode: "in_context" | "rag"; percentOfLimit: number };
  } | null>(null);

  // Modal para promover decisión a Project Knowledge
  const [saveModalMessage, setSaveModalMessage] = useState<MessageView | null>(null);
  const [saveDecisionTitle, setSaveDecisionTitle] = useState("");
  const [isSavingDecision, setIsSavingDecision] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const loadKnowledgeStats = useCallback(async (pId: string) => {
    const res = await getProjectKnowledgeStatsAction(pId);
    if (res.ok && res.data) {
      setStats(res.data);
      setCustomInstructions(res.data.customInstructions || "");
    }
  }, []);

  const loadThreadsForProject = useCallback(
    async (pId: string, preferredThreadId?: string) => {
      if (!pId) {
        setThreads([]);
        setActiveThreadId(null);
        setMessages([]);
        return;
      }

      const res = await listProjectThreadsAction(pId);
      let currentThreads = res.ok && res.data ? res.data : [];

      if (currentThreads.length === 0) {
        const created = await createProjectThreadAction(pId, "Chat principal");
        if (created.ok && created.data) {
          currentThreads = [created.data];
        }
      }

      setThreads(currentThreads);
      const targetId = preferredThreadId || initialThreadId;
      const selected =
        targetId && currentThreads.some((t) => t.id === targetId)
          ? targetId
          : (currentThreads[0]?.id ?? null);
      setActiveThreadId(selected);

      if (selected) {
        const msgRes = await loadThreadMessagesAction(pId, selected);
        if (msgRes.ok && msgRes.data) {
          setMessages(
            msgRes.data.messages.map((m) => ({
              id: m.id,
              sender: m.author === "user" ? "user" : "ai",
              senderName: m.author === "user" ? "Tú" : "RAX Copilot",
              text: m.content,
              time: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              artifacts: m.artifacts,
              citations: m.citations,
              proposals: m.proposals,
            })),
          );
        }
      } else {
        setMessages([]);
      }
    },
    [initialThreadId],
  );

  useEffect(() => {
    if (projectId) {
      loadThreadsForProject(projectId);
      loadKnowledgeStats(projectId);
    }
  }, [projectId, loadThreadsForProject, loadKnowledgeStats]);

  const handleSelectProject = (newProjectId: string) => {
    setProjectId(newProjectId);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/app/chat?project=${newProjectId}`);
    }
  };

  const handleSelectThread = async (threadId: string) => {
    setActiveThreadId(threadId);
    setActiveArtifact(null);
    if (!projectId) return;

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/app/chat?project=${projectId}&thread=${threadId}`);
    }

    const res = await loadThreadMessagesAction(projectId, threadId);
    if (res.ok && res.data) {
      setMessages(
        res.data.messages.map((m) => ({
          id: m.id,
          sender: m.author === "user" ? "user" : "ai",
          senderName: m.author === "user" ? "Tú" : "RAX Copilot",
          text: m.content,
          time: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          artifacts: m.artifacts,
          citations: m.citations,
          proposals: m.proposals,
        })),
      );
    }
  };

  const handleNewThread = async () => {
    if (!projectId) return;
    const res = await createProjectThreadAction(projectId, "Nuevo chat");
    if (res.ok && res.data) {
      setThreads((prev) => [res.data!, ...prev]);
      setActiveThreadId(res.data.id);
      setMessages([]);
      setActiveArtifact(null);
    }
  };

  const handleRenameThread = async (threadId: string, newTitle: string) => {
    if (!projectId) return;
    const res = await renameProjectThreadAction(projectId, threadId, newTitle);
    if (res.ok && res.data) {
      setThreads((prev) => prev.map((t) => (t.id === threadId ? res.data! : t)));
    }
  };

  const handleApplyProposal = async (proposal: Record<string, unknown>) => {
    if (!projectId || typeof proposal.title !== "string") return;
    setApplyingProposalTitle(proposal.title);
    try {
      const res = await applyAiProposalAction(projectId, proposal);
      if (res.ok) {
        setAppliedProposals((prev) => new Set(prev).add(String(proposal.title)));
      } else {
        alert(res.error);
      }
    } finally {
      setApplyingProposalTitle(null);
    }
  };

  const sendMessageToAgent = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;
    if (!projectId) return;

    setIsLoading(true);

    try {
      const res = await sendClaudeAgentMessageAction({
        projectId,
        threadId: activeThreadId ?? undefined,
        message: textToSend.trim(),
        sessionContext: {
          location: "global_assistant",
          pageTitle: "Asistente de IA General de RAX",
        },
      });

      if (res.ok && res.data) {
        const { userMessage, assistantMessage, artifacts, citations, proposals, threadId } = res.data;

        if (threadId !== activeThreadId) {
          setActiveThreadId(threadId);
          await loadThreadsForProject(projectId);
        }

        setMessages((prev) => [
          ...prev,
          {
            id: userMessage.id,
            sender: "user",
            senderName: "Tú",
            text: userMessage.content,
            time: new Date(userMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
          {
            id: assistantMessage.id,
            sender: "ai",
            senderName: "Claude Agent",
            text: assistantMessage.content,
            time: new Date(assistantMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            artifacts,
            citations,
            proposals,
            cachedPromptUsed: res.data?.cachedPromptUsed,
            cacheStatus: res.data?.cacheStatus,
            cachedTokens: res.data?.cachedTokens,
          },
        ]);

        // Si la respuesta generó artefactos, abrir automáticamente el primero en el visor lateral
        if (artifacts && artifacts.length > 0) {
          setActiveArtifact(artifacts[0]);
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: "ai",
            senderName: "Claude Agent",
            text: !res.ok ? res.error : "No se pudo procesar la respuesta.",
            time: "Aviso",
          },
        ]);
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: "ai",
          senderName: "Claude Agent",
          text: `Error al comunicar con el agente: ${err instanceof Error ? err.message : String(err)}`,
          time: "Error",
        },
      ]);
    } finally {
      setIsLoading(false);
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

  const activeProject = projects.find((p) => p.id === projectId);
  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="max-w-[1600px] mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm flex h-[calc(100vh-130px)] min-h-[640px] overflow-hidden">
      {/* 1. Panel Lateral Izquierdo: Proyectos e Hilos */}
      <ProjectSidebar
        projects={projects}
        activeProjectId={projectId}
        onSelectProject={handleSelectProject}
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={handleSelectThread}
        onNewThread={handleNewThread}
        onRenameThread={handleRenameThread}
        onOpenInstructions={() => setIsInstructionsOpen(true)}
        onOpenKnowledge={() => setIsKnowledgeOpen(true)}
        knowledgeTokens={knowledgeStats?.totalTokens ?? 0}
        knowledgeMode={knowledgeStats?.evaluation.mode ?? "in_context"}
      />

      {/* 2. Área Central de Conversación */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Header superior del chat */}
        <div className="p-3.5 border-b border-slate-200/80 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs uppercase shrink-0">
              ⚡
            </div>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-bold text-slate-900 truncate flex items-center gap-2">
                <span>{activeThread?.title || "Conversación"}</span>
                <span
                  className={`hidden sm:inline-flex text-[0.625rem] font-bold px-2 py-0.5 rounded-full ${knowledgeStats?.evaluation.mode === "rag"
                    ? "bg-purple-100 text-purple-800"
                    : "bg-emerald-100 text-emerald-800"
                    }`}
                >
                  {knowledgeStats?.evaluation.mode === "rag"
                    ? "Modo RAG Activo"
                    : "In-Context + Prompt Caching"}
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 truncate">
                Proyecto: <strong className="text-slate-600">{activeProject?.name ?? "..."}</strong> · Hilo aislado
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setIsInstructionsOpen(true)}
              title="Instrucciones del Proyecto"
              className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
            >
              ⚙️ Instrucciones
            </button>
            <button
              onClick={() => setIsKnowledgeOpen(true)}
              title="Base de Conocimiento"
              className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
            >
              📚 Conocimiento
            </button>
            {activeArtifact && (
              <button
                onClick={() => setActiveArtifact(null)}
                className="px-2.5 py-1 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition"
              >
                Cerrar Artefacto
              </button>
            )}
          </div>
        </div>

        {/* Mensajes del Hilo */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/30">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-orange-600 text-xl font-bold">
                ⚡
              </div>
              <h2 className="text-sm font-bold text-slate-800">
                Nuevo chat en «{activeProject?.name}»
              </h2>
              <p className="text-xs text-slate-500 max-w-md leading-relaxed">
                Este chat opera con las directrices de este proyecto y su base de conocimiento compartida.
                El historial permanece estrictamente aislado de otros chats.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  onClick={() => sendMessageToAgent("¿Cuáles son los supuestos más críticos de este proyecto?")}
                  className="px-3 py-1.5 text-xs bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-2xs transition"
                >
                  🎯 Supuestos críticos
                </button>
                <button
                  onClick={() => sendMessageToAgent("Crea una calculadora interactiva para nuestro experimento en HTML y Tailwind")}
                  className="px-3 py-1.5 text-xs bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-2xs transition"
                >
                  ⚡ Diseñar artefacto interactivo
                </button>
                <button
                  onClick={() => sendMessageToAgent("Genera un diagrama de embudo en Mermaid")}
                  className="px-3 py-1.5 text-xs bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-2xs transition"
                >
                  📊 Diagrama de embudo
                </button>
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={cx("flex flex-col group", m.sender === "user" ? "items-end" : "items-start")}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400 font-mono">
                  <span>{m.senderName}</span>
                  <span>•</span>
                  <span>{m.time}</span>
                  {m.cacheStatus === "hit" && (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded font-sans font-semibold inline-flex items-center gap-1">
                      ⚡ Prompt Cache Hit ({m.cachedTokens ? `${m.cachedTokens.toLocaleString()} tokens` : "activo"})
                    </span>
                  )}
                  {m.cacheStatus === "write" && (
                    <span className="text-blue-700 bg-blue-50 border border-blue-200/80 px-1.5 py-0.5 rounded font-sans font-semibold inline-flex items-center gap-1">
                      💾 Prompt Cache Escrito
                    </span>
                  )}
                  {m.cacheStatus === "simulated" && (
                    <span className="text-slate-500 bg-slate-100 border border-slate-200/80 px-1.5 py-0.5 rounded font-sans font-medium inline-flex items-center gap-1">
                      🧪 Simulado
                    </span>
                  )}
                </div>

                <div
                  className={cx(
                    "max-w-[90%] sm:max-w-[80%] p-4 rounded-2xl text-xs leading-relaxed",
                    m.sender === "user"
                      ? "bg-slate-900 text-white rounded-br-xs shadow-xs"
                      : "bg-white text-slate-900 border border-slate-200/80 shadow-2xs rounded-bl-xs",
                  )}
                >
                  <FormattedText content={m.text} isUser={m.sender === "user"} />

                  {/* Tarjetas de Artefactos generados */}
                  {m.artifacts && m.artifacts.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <div className="text-[0.6875rem] font-bold uppercase tracking-wider text-orange-600 flex items-center gap-1">
                        <span>Artefacto generado:</span>
                      </div>
                      {m.artifacts.map((art) => (
                        <div
                          key={art.id}
                          onClick={() => setActiveArtifact(art)}
                          className="p-3 bg-orange-50/50 hover:bg-orange-100/60 border border-orange-200/80 rounded-xl flex items-center justify-between cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="p-1.5 rounded-lg bg-orange-500 text-white">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                              </svg>
                            </span>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 text-xs truncate">{art.title}</p>
                              <p className="text-[0.625rem] text-slate-500 font-mono">{art.identifier} · {art.type.split(".").pop()}</p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-orange-600 shrink-0">Abrir en Panel →</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Citas de Fuentes Consultadas en Conocimiento */}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-2 flex flex-wrap items-center gap-1 text-[0.6875rem] text-slate-500">
                      <span className="font-semibold text-slate-700">Fuentes consultadas:</span>
                      {m.citations.map((c, idx) => (
                        <span
                          key={idx}
                          title={c.snippet}
                          className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[0.625rem] border border-slate-200"
                        >
                          📄 {c.filename}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Acciones propuestas para el proyecto (Workflows RAX-00..RAX-15) */}
                  {m.proposals && m.proposals.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <div className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <span>⚡ Acciones propuestas para el proyecto:</span>
                      </div>
                      {m.proposals.map((prop, idx) => {
                        const title = typeof prop.title === "string" ? prop.title : `Propuesta ${idx + 1}`;
                        const desc = typeof prop.description === "string" ? prop.description : undefined;
                        const rawType = typeof prop.type === "string" ? prop.type : "acción";
                        const isApplied = appliedProposals.has(title);
                        const isApplying = applyingProposalTitle === title;

                        return (
                          <div
                            key={idx}
                            className="p-3 bg-slate-50/80 border border-slate-200/90 rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[0.625rem] font-bold uppercase px-1.5 py-0.5 rounded-sm bg-orange-100 text-orange-800">
                                  {rawType.replace("_", " ")}
                                </span>
                                <span className="font-semibold text-slate-800 truncate">{title}</span>
                              </div>
                              {desc && <p className="text-[0.6875rem] text-slate-500 mt-1 leading-snug">{desc}</p>}
                            </div>

                            <button
                              onClick={() => handleApplyProposal(prop)}
                              disabled={isApplied || isApplying}
                              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${isApplied
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default"
                                : "bg-orange-600 hover:bg-orange-700 text-white shadow-2xs cursor-pointer"
                                }`}
                            >
                              {isApplied ? "✓ Aplicado" : isApplying ? "Aplicando..." : "Aplicar al Proyecto"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Acción: Guardar en el conocimiento del proyecto */}
                {m.sender === "ai" && (
                  <div className="mt-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition px-1">
                    <button
                      onClick={() => {
                        setSaveModalMessage(m);
                        setSaveDecisionTitle(`Decisión: ${m.text.slice(0, 30)}...`);
                      }}
                      className="text-[0.6875rem] font-medium text-slate-400 hover:text-orange-600 flex items-center gap-1 transition"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      Guardar en Conocimiento del Proyecto
                    </button>
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex flex-col items-start space-y-1">
              <span className="text-[10px] text-slate-400 font-mono px-1">Claude Agent • razonando con el contexto...</span>
              <div className="bg-white text-slate-600 border border-slate-200/80 rounded-2xl p-3.5 text-xs flex items-center gap-2.5 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-orange-600 animate-ping" />
                <span>Generando respuesta con instrucciones y conocimiento del proyecto...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Inferior */}
        <ChatInput
          onSend={sendMessageToAgent}
          isLoading={isLoading}
          disabled={!projectId}
          placeholder="Escribe tu consulta o pide crear un artefacto... (Soporta Markdown, código y análisis)"
        />
      </div>

      {/* 3. Panel Lateral Derecho: Visor de Artefactos */}
      {activeArtifact && (
        <ArtifactViewer
          artifact={activeArtifact}
          onClose={() => setActiveArtifact(null)}
          onSaveToKnowledge={async (art) => {
            if (!projectId) return;
            await promoteDecisionToKnowledgeAction(projectId, {
              title: art.title,
              filename: `${art.identifier}.md`,
              content: art.content,
            });
            await loadKnowledgeStats(projectId);
            alert("Artefacto guardado en la base de conocimientos del proyecto.");
          }}
        />
      )}

      {/* Modales */}
      <ProjectInstructionsModal
        projectId={projectId}
        projectName={activeProject?.name ?? ""}
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
        projectName={activeProject?.name ?? ""}
        isOpen={isKnowledgeOpen}
        onClose={() => setIsKnowledgeOpen(false)}
        onKnowledgeUpdated={() => loadKnowledgeStats(projectId)}
      />

      {/* Modal Rápido: Promover Decisión a Conocimiento */}
      {saveModalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Guardar en Conocimiento del Proyecto</h3>
            <p className="text-xs text-slate-500">
              Esta conclusión se convertirá en un documento persistente de este proyecto y estará disponible
              para todos los chats futuros.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Título de la Decisión:</label>
              <input
                type="text"
                value={saveDecisionTitle}
                onChange={(e) => setSaveDecisionTitle(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                placeholder="Ej. Criterio de Pricing Validado"
              />
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 max-h-36 overflow-y-auto text-xs text-slate-600 font-mono">
              {saveModalMessage.text}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSaveModalMessage(null)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveDecisionConfirm}
                disabled={isSavingDecision || !saveDecisionTitle.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-xl shadow-xs"
              >
                {isSavingDecision ? "Guardando..." : "Confirmar y Compartir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
