"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PROPOSAL_TYPE_LABEL } from "@/lib/ai/step-actions";
import { cx } from "@/shared/ui/primitives";
import type { AgentArtifact, AgentThread, KnowledgeCitation } from "@/types/domain";
import {
  applyAiProposalAction,
  createProjectThreadAction,
  listProjectThreadsAction,
  loadThreadMessagesAction,
  sendClaudeAgentMessageAction,
} from "@/app/actions";
import { FormattedText } from "@/app/app/chat/formatted-text";
import { DocumentCard, isDocumentArtifact } from "@/app/app/chat/document-card";

/** Borrar el proyecto es el único paso que no se deshace desde la pantalla: se confirma aparte. */
const isDeleteProject = (proposal: Record<string, unknown>) =>
  (proposal.metadata as Record<string, unknown> | undefined)?.action === "delete_project";

interface MessageView {
  id: string;
  sender: "user" | "ai";
  senderName: string;
  text: string;
  time: string;
  artifacts?: AgentArtifact[];
  citations?: KnowledgeCitation[];
  proposals?: Array<Record<string, unknown>>;
  cachedPromptUsed?: boolean;
  /** La IA no respondió: el texto explica el motivo, no es una respuesta del agente. */
  failed?: boolean;
}

const QUICK_PROMPTS = [
  "¿Qué preguntas me harías para diagnosticar mi punto de partida?",
  "Sintetizar lo que sabemos en esta conversación como contexto para la etapa de Orientar",
  "¿Cuáles son los supuestos y bloqueos principales que debo revisar con mi mentor?",
  "Quiero ordenar mis dudas y objetivos antes de la primera sesión",
];

export function ProjectConversationClient({
  projectId,
  projectName,
  stage = "entender",
  phase = "conversation",
  stageId = "entender",
  stageLabel = "Entender",
  stageQuestion = "¿Qué sé, qué supongo y qué me falta?",
  diagnosisSummary,
  summaryConfirmed = false,
  diagnosisItemCount = 0,
  hasMentor = false,
  mentorNames = [],
  canWrite = true,
  isMentorView = false,
}: {
  projectId: string;
  projectName: string;
  stage?: string;
  phase?: string;
  stageId?: string;
  stageLabel?: string;
  stageQuestion?: string;
  diagnosisSummary?: string;
  summaryConfirmed?: boolean;
  diagnosisItemCount?: number;
  hasMentor?: boolean;
  mentorNames?: string[];
  canWrite?: boolean;
  isMentorView?: boolean;
}) {
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [appliedProposals, setAppliedProposals] = useState<Set<string>>(new Set());
  const [applyingTitle, setApplyingTitle] = useState<string | null>(null);
  const [applyFeedback, setApplyFeedback] = useState<Record<string, { ok: boolean; text: string }>>({});
  const router = useRouter();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const loadThreads = useCallback(
    async (preferredId?: string) => {
      const res = await listProjectThreadsAction(projectId);
      let currentThreads = res.ok && res.data ? res.data : [];

      if (currentThreads.length === 0) {
        const created = await createProjectThreadAction(projectId, "Chat principal");
        if (created.ok && created.data) {
          currentThreads = [created.data];
        }
      }

      setThreads(currentThreads);
      const selected =
        preferredId && currentThreads.some((t) => t.id === preferredId)
          ? preferredId
          : (currentThreads[0]?.id ?? null);
      setActiveThreadId(selected);

      if (selected) {
        const msgRes = await loadThreadMessagesAction(projectId, selected);
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
              failed: m.status === "failed",
            })),
          );
        }
      } else {
        setMessages([]);
      }
    },
    [projectId],
  );

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const handleSelectThread = async (threadId: string) => {
    setActiveThreadId(threadId);
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
          failed: m.status === "failed",
        })),
      );
    }
  };

  const handleNewThread = async () => {
    const res = await createProjectThreadAction(projectId, "Nuevo chat");
    if (res.ok && res.data) {
      setThreads((prev) => [res.data!, ...prev]);
      setActiveThreadId(res.data.id);
      setMessages([]);
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    const trimmed = textToSend.trim();
    if (!trimmed || isLoading || !canWrite) return;

    setInputText("");
    setIsLoading(true);

    try {
      const res = await sendClaudeAgentMessageAction({
        projectId,
        threadId: activeThreadId ?? undefined,
        message: trimmed,
        sessionContext: {
          location: "project_conversation",
          pageTitle: `Conversación del proyecto «${projectName}»`,
          stage: stageId,
          phase,
          isMentorView,
          diagnosisSummary,
          summaryConfirmed,
          diagnosisItemCount,
          hasMentor,
          mentorNames,
        },
      });

      if (res.ok && res.data) {
        const { userMessage, assistantMessage, artifacts, citations, proposals, threadId } = res.data;

        if (threadId !== activeThreadId) {
          setActiveThreadId(threadId);
          await loadThreads(threadId);
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
            senderName: "RAX Copilot",
            text: assistantMessage.content,
            time: new Date(assistantMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            artifacts,
            citations,
            proposals,
            cachedPromptUsed: res.data?.cachedPromptUsed,
            failed: assistantMessage.status === "failed",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: "ai",
            senderName: "RAX Copilot",
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
          senderName: "RAX Copilot",
          text: `Error al comunicar con el agente: ${err instanceof Error ? err.message : String(err)}`,
          time: "Error",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyProposal = async (proposal: Record<string, unknown>) => {
    const title = String(proposal.title || "propuesta");
    const deleting = isDeleteProject(proposal);
    if (deleting && !window.confirm("¿Borrar este proyecto? Desaparece para ti y para tu mentor.")) return;
    setApplyingTitle(title);
    try {
      const res = await applyAiProposalAction(projectId, proposal);
      if (res.ok && deleting) {
        window.location.assign("/app?borrado=1");
        return;
      }
      if (res.ok) {
        setAppliedProposals((prev) => new Set(prev).add(title));
        const notice = res.data && "notice" in res.data ? res.data.notice : undefined;
        setApplyFeedback((prev) => ({ ...prev, [title]: { ok: true, text: notice ?? "Aplicado al proyecto." } }));
        // El paso puede cambiar la etapa: se refresca la navegación del proyecto.
        router.refresh();
      } else {
        setApplyFeedback((prev) => ({ ...prev, [title]: { ok: false, text: res.error } }));
      }
    } finally {
      setApplyingTitle(null);
    }
  };

  const activeThread = threads.find((t) => t.id === activeThreadId);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── SECCIÓN PRINCIPAL: CONVERSACIÓN CON EL AGENTE ── */}
      <section
        aria-labelledby="conv-title"
        className="flex min-h-[70vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden"
      >
        {/* Cabecera unificada con selector de hilos/sesiones */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50/70 px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
              RAX
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="conv-title" className="text-sm font-bold text-slate-900 truncate">
                  IA Assistant · {projectName}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                  En línea
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">
                Mismo agente y contexto sincronizado con el espacio completo de IA Assistant.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Selector de hilos / sesiones del proyecto */}
            {threads.length > 1 && (
              <select
                value={activeThreadId ?? ""}
                onChange={(e) => handleSelectThread(e.target.value)}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-blue-500"
              >
                {threads.map((t) => (
                  <option key={t.id} value={t.id}>
                    💬 {t.title}
                  </option>
                ))}
              </select>
            )}

            {canWrite && (
              <button
                type="button"
                onClick={handleNewThread}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 transition shadow-2xs flex items-center gap-1 cursor-pointer"
                title="Comenzar una nueva sesión o hilo de chat en este proyecto"
              >
                <span>+</span>
                <span className="hidden sm:inline">Nuevo hilo</span>
              </button>
            )}

            <Link
              href={`/app/chat?project=${projectId}${activeThreadId ? `&thread=${activeThreadId}` : ""}`}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition shadow-xs flex items-center gap-1.5 shrink-0"
              title="Abrir este hilo en la vista completa de IA Assistant con visor de artefactos y base de conocimiento"
            >
              <span>IA Assistant</span>
              <span>↗</span>
            </Link>
          </div>
        </header>

        {/* ── BARRA DE ETAPA Y CONTEXTO PARA ORIENTAR ── */}
        <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/60 to-slate-50 border-b border-blue-100/90 px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-blue-600 text-white font-mono text-[10px] font-bold uppercase tracking-wider shadow-2xs">
                  Etapa 1 · {stageLabel}
                </span>
                <span className="text-xs font-semibold text-slate-800 italic">
                  «{stageQuestion}»
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white text-slate-600 border border-slate-200">
                  Fase: {phase === "new" ? "Descubrimiento inicial" : phase === "summary_pending" ? "Resumen pendiente" : "Conversación diagnóstica"}
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                En esta etapa conversamos para identificar qué sabés, tus bloqueos y tus metas. Tus respuestas se convierten en hallazgos para tu diagnóstico vivo y preparan el contexto que revisarán tu mentor y vos en la <strong>Etapa 2 · Orientar</strong>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link
                href={`/app/p/${projectId}/diagnostico`}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition shadow-2xs flex items-center gap-1.5"
                title="Ver el Diagnóstico Vivo del proyecto"
              >
                <span>📋</span>
                <span>{diagnosisItemCount} hallazgo{diagnosisItemCount === 1 ? "" : "s"}</span>
              </Link>

              {summaryConfirmed ? (
                <Link
                  href={`/app/p/${projectId}/orientar`}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition shadow-2xs flex items-center gap-1.5"
                  title="Contexto confirmado. Ir a las sesiones de mentoría en Orientar"
                >
                  <span>✓</span>
                  <span>Contexto listo · Ir a Orientar →</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    handleSendMessage(
                      "Sintetizar lo que sabemos en esta conversación para consolidar el contexto de la etapa Entender y preparar la etapa Orientar.",
                    )
                  }
                  disabled={isLoading || !canWrite}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="Pedirle al agente que consolide el contexto de la conversación para la etapa de Orientar"
                >
                  <span>⚡</span>
                  <span>Sintetizar para Orientar</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Lista de Mensajes del Hilo Activo */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4 max-h-[62vh]" aria-label="Mensajes del hilo">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center text-2xl shadow-2xs">
                ✨
              </div>
              <div className="space-y-1.5 max-w-md">
                <p className="text-sm font-bold text-slate-800">
                  Etapa 1 · Entender: Diagnóstico vivo para «{projectName}»
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  El agente te irá haciendo preguntas reflexivas para entender tus metas, conocimientos y bloqueos.
                  Con cada respuesta construiremos tu diagnóstico vivo, convirtiéndolo en el contexto estructurado
                  para la <strong>Etapa 2 · Orientar</strong> junto a tu mentor.
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-2 pt-2 max-w-lg">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={isLoading || !canWrite}
                    onClick={() => handleSendMessage(prompt)}
                    className="px-3 py-1.5 text-xs bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-slate-700 shadow-2xs transition cursor-pointer"
                  >
                    💬 {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.sender === "user";

              return (
                <div key={m.id} className={cx("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                  <div className="flex items-center gap-2 px-1 text-[10px] text-slate-500">
                    <span className="font-semibold text-slate-700">{m.senderName}</span>
                    <span>·</span>
                    <span>{m.time}</span>
                    {m.failed && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-semibold">
                        IA no disponible
                      </span>
                    )}
                    {m.cachedPromptUsed && (
                      <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 font-mono text-[9px]">
                        ⚡ Prompt Cache
                      </span>
                    )}
                  </div>

                  <div
                    className={cx(
                      "max-w-[88%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-2xs space-y-3",
                      mine
                        ? "bg-blue-600 text-white rounded-br-xs"
                        : "bg-slate-50 text-slate-900 border border-slate-200/80 rounded-bl-xs",
                    )}
                  >
                    <FormattedText content={m.text} isUser={mine} />

                    {/* Documentos descargables (PDF / Word) generados por el agente */}
                    {m.artifacts?.some(isDocumentArtifact) && (
                      <div className="pt-2 border-t border-slate-200/60 space-y-2">
                        {m.artifacts.filter(isDocumentArtifact).map((art) => (
                          <DocumentCard key={art.id} artifact={art} messageId={m.id} />
                        ))}
                      </div>
                    )}

                    {/* Citaciones de conocimiento si las hay */}
                    {m.citations && m.citations.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/60 space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Fuentes consultadas:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {m.citations.map((c, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] text-slate-700"
                              title={c.snippet}
                            >
                              📄 {c.title || c.filename}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Propuestas de acción estructuradas */}
                    {m.proposals && m.proposals.length > 0 && (
                      <div className="pt-2 border-t border-slate-200/70 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-900">
                          Propuestas generadas por el agente:
                        </p>
                        <div className="space-y-1.5">
                          {m.proposals.map((prop, idx) => {
                            const pTitle = String(prop.title || `Propuesta #${idx + 1}`);
                            const pType = String(prop.type || "task");
                            const isApplied = appliedProposals.has(pTitle);
                            const isApplying = applyingTitle === pTitle;

                            return (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3 text-slate-800"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={cx(
                                        "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                                        pType === "flow_action" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800",
                                      )}
                                    >
                                      {PROPOSAL_TYPE_LABEL[pType] ?? pType}
                                    </span>
                                    <p className="text-xs font-semibold truncate">{pTitle}</p>
                                  </div>
                                  {Boolean(prop.description) && (
                                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                      {String(prop.description)}
                                    </p>
                                  )}
                                  {applyFeedback[pTitle] && (
                                    <p
                                      role={applyFeedback[pTitle].ok ? "status" : "alert"}
                                      className={cx("text-[11px] mt-0.5", applyFeedback[pTitle].ok ? "text-emerald-700" : "text-red-700")}
                                    >
                                      {applyFeedback[pTitle].text}
                                    </p>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  disabled={isApplied || isApplying || !canWrite}
                                  onClick={() => handleApplyProposal(prop)}
                                  className={cx(
                                    "px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 transition-all cursor-pointer",
                                    isApplied
                                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                      : "bg-blue-600 hover:bg-blue-700 text-white shadow-xs",
                                  )}
                                >
                                  {isApplied ? "✓ Aplicado" : isApplying ? "Aplicando..." : "Aplicar"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {isLoading && (
            <div className="flex items-center gap-2 p-3 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-xl w-fit animate-pulse">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
              <span>RAX Copilot está analizando el contexto de «{projectName}»...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Sugerencias contextuales rápidas */}
        {canWrite && (
          <div className="px-5 py-2 bg-slate-50/50 border-t border-slate-100 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((qp, i) => (
              <button
                key={i}
                type="button"
                disabled={isLoading}
                onClick={() => handleSendMessage(qp)}
                className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-[11px] text-slate-600 hover:text-blue-600 hover:border-blue-400 transition cursor-pointer"
              >
                {qp}
              </button>
            ))}
          </div>
        )}

        {/* Barra de Entrada / Composer */}
        {canWrite ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            className="p-4 border-t border-slate-200 bg-white flex items-end gap-2"
          >
            <textarea
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(inputText);
                }
              }}
              placeholder={`Escribe a RAX para ${projectName}. Enter envía, Shift+Enter para salto de línea...`}
              className="flex-1 p-3 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none leading-relaxed"
            />
            <button
              type="submit"
              disabled={isLoading || !inputText.trim()}
              className="px-5 py-3 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition shadow-xs shrink-0 cursor-pointer"
            >
              Enviar
            </button>
          </form>
        ) : (
          <div className="p-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 text-center">
            {isMentorView
              ? "Como mentor podés leer las conversaciones y sesiones del proyecto compartidas por el emprendedor."
              : "Modo solo lectura."}
          </div>
        )}
      </section>

      {/* ── PANEL LATERAL: SINCRONIZACIÓN Y ACCESOS RÁPIDOS ── */}
      <aside aria-labelledby="assistant-context" className="space-y-4">
        {/* Tarjeta de Ciclo Metodológico: De Entender a Orientar */}
        <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-indigo-50/60 via-blue-50/40 to-white p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🧭</span>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Ciclo RAX: Entender → Orientar
            </h4>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Tu conversación en esta etapa se convierte en contexto para tu mentor en la siguiente etapa:
          </p>

          <ol className="space-y-2 text-xs">
            <li className="flex items-start gap-2 p-2 rounded-xl bg-white/90 border border-blue-100">
              <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                1
              </span>
              <div>
                <p className="font-semibold text-slate-900">Etapa 1 · Entender (En curso)</p>
                <p className="text-[11px] text-slate-500">
                  El agente te hace preguntas clave sobre lo que sabés, tus bloqueos y metas.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-2 p-2 rounded-xl bg-white/90 border border-slate-200/80">
              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                2
              </span>
              <div>
                <p className="font-semibold text-slate-900">Diagnóstico vivo y síntesis</p>
                <p className="text-[11px] text-slate-500">
                  Tus respuestas se extraen como hallazgos y consolidan el resumen de la etapa.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-2 p-2 rounded-xl bg-white/90 border border-slate-200/80">
              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                3
              </span>
              <div>
                <p className="font-semibold text-slate-900">Etapa 2 · Orientar</p>
                <p className="text-[11px] text-slate-500">
                  Tu mentor revisa el resumen contigo, pactan acuerdos y priorizan el primer desafío.
                </p>
              </div>
            </li>
          </ol>

          <div className="pt-1">
            <button
              type="button"
              disabled={isLoading || !canWrite}
              onClick={() =>
                handleSendMessage(
                  "Sintetizar lo que sabemos en esta conversación para consolidar el contexto de la etapa Entender y preparar la etapa Orientar.",
                )
              }
              className="w-full py-2 px-3 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition text-center cursor-pointer disabled:opacity-50"
            >
              ⚡ Sintetizar contexto para Orientar
            </button>
          </div>
        </div>

        {/* Tarjeta de integración con IA Assistant */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-indigo-50/50 to-white p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">✨</span>
            <h3 id="assistant-context" className="text-sm font-bold text-slate-900">
              Mismo Agente Unificado
            </h3>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Todas las sesiones e hilos de chat creados en este proyecto quedan organizados bajo{" "}
            <span className="font-semibold text-slate-900">«{projectName}»</span> en la sección de IA Assistant.
          </p>

          <div className="p-3 rounded-xl bg-white/80 border border-slate-200/80 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Sesión activa:</span>
              <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                {activeThread?.title || "Chat principal"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total de hilos:</span>
              <span className="font-semibold text-slate-800">{threads.length}</span>
            </div>
          </div>

          <Link
            href={`/app/chat?project=${projectId}${activeThreadId ? `&thread=${activeThreadId}` : ""}`}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition shadow-xs"
          >
            <span>Abrir en IA Assistant</span>
            <span>↗</span>
          </Link>
        </div>

        {/* Accesos rápidos de acción en el proyecto */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Navegación del proyecto
          </h4>
          <ul className="space-y-2 text-xs">
            <li>
              <Link
                href={`/app/p/${projectId}/diagnostico`}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 text-slate-700 transition"
              >
                <span>📋 Tablero de diagnóstico</span>
                <span className="text-slate-400">→</span>
              </Link>
            </li>
            <li>
              <Link
                href={`/app/p/${projectId}/tareas`}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 text-slate-700 transition"
              >
                <span>🎯 Tareas y experimentos</span>
                <span className="text-slate-400">→</span>
              </Link>
            </li>
            <li>
              <Link
                href={`/app/p/${projectId}/acuerdos`}
                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 text-slate-700 transition"
              >
                <span>📜 Acuerdo de mentoría formal</span>
                <span className="text-slate-400">→</span>
              </Link>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
