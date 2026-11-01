"use client";

import { useState } from "react";
import { cx } from "@/shared/ui/primitives";
import type { SessionWithThreads } from "@/lib/services/agent-sessions";
import { ChatInput } from "./chat-input";
import { Chevron, PlusIcon } from "./session-sidebar";
import { timeAgo } from "./time-ago";

/**
 * Portada de un proyecto en el asistente (como un proyecto en Claude): nombre y descripción, un
 * compositor para empezar una sesión nueva, la lista de sesiones con sus hilos y, a la derecha,
 * las instrucciones y el conocimiento que comparten todas las sesiones.
 */
export function ProjectOverview({
  project,
  sessions,
  sessionsSupported,
  loading,
  isStarting,
  instructions,
  knowledgeTokens,
  knowledgeMode,
  canGoBack,
  onBack,
  onStartSession,
  onNewEmptySession,
  onOpenSession,
  onOpenThread,
  onOpenInstructions,
  onOpenKnowledge,
}: {
  project: { id: string; name: string; description?: string };
  sessions: SessionWithThreads[];
  sessionsSupported: boolean;
  loading: boolean;
  isStarting: boolean;
  instructions: string;
  knowledgeTokens: number;
  knowledgeMode: "in_context" | "rag";
  canGoBack: boolean;
  onBack: () => void;
  onStartSession: (firstMessage: string) => void;
  onNewEmptySession: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenThread: (sessionId: string, threadId: string) => void;
  onOpenInstructions: () => void;
  onOpenKnowledge: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const active = sessions.filter((s) => s.status !== "archived");
  const archived = sessions.filter((s) => s.status === "archived");
  const visible = showArchived ? sessions : active;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="h-full overflow-y-auto bg-slate-50/30">
      <div className="max-w-6xl mx-auto px-4 py-5 lg:px-8 lg:py-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] gap-6 lg:gap-8">
        <div className="min-w-0 space-y-6">
          {/* Encabezado */}
          <div>
            {canGoBack && (
              <button
                type="button"
                onClick={onBack}
                className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Todos los proyectos
              </button>
            )}
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900 break-words">{project.name}</h1>
            {project.description && <p className="mt-1 text-sm text-slate-500 leading-relaxed line-clamp-3">{project.description}</p>}
          </div>

          {/* Compositor: empezar una sesión */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="px-4 pt-3 text-xs font-semibold text-slate-500">Empieza una sesión nueva</div>
            <ChatInput
              onSend={onStartSession}
              isLoading={isStarting}
              disabled={isStarting}
              placeholder="¿En qué quieres trabajar hoy? Ej.: preparar la entrevista con clientes"
            />
          </div>

          {/* Sesiones */}
          <section aria-labelledby="sessions-title">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 id="sessions-title" className="text-sm font-bold text-slate-900">
                Sesiones <span className="text-slate-400 font-medium">({active.length})</span>
              </h2>
              {sessionsSupported && (
                <button
                  type="button"
                  onClick={onNewEmptySession}
                  disabled={isStarting}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl disabled:opacity-50"
                >
                  <PlusIcon /> Nueva sesión
                </button>
              )}
            </div>

            {!sessionsSupported && (
              <p className="mb-3 p-3 text-xs rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                Las sesiones se activan cuando se aplique la migración de sesiones en la base de datos. Mientras tanto, tus hilos se
                muestran juntos en «Sesión general».
              </p>
            )}

            {loading && visible.length === 0 ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-16 rounded-2xl bg-white border border-slate-200/70 animate-pulse" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-2xl bg-white">
                Todavía no hay sesiones. Escribe arriba qué quieres trabajar y se abrirá la primera.
              </div>
            ) : (
              <ul className="space-y-2">
                {visible.map((s) => {
                  const open = expanded.has(s.id);
                  const pending = s.notes?.openQuestions.length ?? 0;
                  return (
                    <li key={s.id} className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
                      <div className="flex items-stretch">
                        <button
                          type="button"
                          onClick={() => onOpenSession(s.id)}
                          className="flex-1 min-w-0 text-left px-4 py-3 hover:bg-slate-50/80 transition"
                        >
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 truncate">{s.title}</span>
                            {s.status === "archived" && (
                              <span className="shrink-0 text-[0.625rem] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Archivada</span>
                            )}
                          </span>
                          {s.goal && <span className="block mt-0.5 text-xs text-slate-500 truncate">{s.goal}</span>}
                          <span className="block mt-1 text-[0.6875rem] text-slate-400">
                            {s.threads.length} {s.threads.length === 1 ? "hilo" : "hilos"} · {timeAgo(s.lastActivityAt)}
                            {s.notes?.decisions.length ? ` · ${s.notes.decisions.length} ${s.notes.decisions.length === 1 ? "decisión" : "decisiones"}` : ""}
                            {pending ? ` · ${pending} ${pending === 1 ? "pendiente" : "pendientes"}` : ""}
                          </span>
                        </button>
                        {s.threads.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggle(s.id)}
                            className="px-3 text-slate-400 hover:text-slate-700 hover:bg-slate-50 border-l border-slate-100"
                            aria-expanded={open}
                            aria-label={open ? `Ocultar hilos de ${s.title}` : `Ver hilos de ${s.title}`}
                          >
                            <Chevron open={open} />
                          </button>
                        )}
                      </div>
                      {open && (
                        <ul className="border-t border-slate-100 bg-slate-50/50 py-1">
                          {s.threads.map((t) => (
                            <li key={t.id}>
                              <button
                                type="button"
                                onClick={() => onOpenThread(s.id, t.id)}
                                className="w-full flex items-center gap-2 px-4 py-2 text-left text-xs text-slate-600 hover:bg-white hover:text-slate-900"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" aria-hidden="true" />
                                <span className="flex-1 min-w-0 truncate">{t.title}</span>
                                <span className="shrink-0 text-[0.625rem] text-slate-400">{timeAgo(t.updatedAt)}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {archived.length > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="mt-3 text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                {showArchived ? "Ocultar archivadas" : `Ver archivadas (${archived.length})`}
              </button>
            )}
          </section>
        </div>

        {/* Columna derecha: lo que comparten todas las sesiones */}
        <aside className="space-y-3 lg:pt-1">
          <ResourceCard
            title="Instrucciones del proyecto"
            action="Editar"
            onClick={onOpenInstructions}
            body={
              instructions.trim() ? (
                <p className="text-xs text-slate-600 leading-relaxed line-clamp-4 whitespace-pre-line">{instructions}</p>
              ) : (
                <p className="text-xs text-slate-400">Dile al agente cómo debe trabajar en este proyecto: tono, foco, qué evitar.</p>
              )
            }
          />
          <ResourceCard
            title="Conocimiento"
            action="Abrir"
            onClick={onOpenKnowledge}
            body={
              <div className="text-xs text-slate-600">
                <p>{knowledgeTokens > 0 ? `${knowledgeTokens.toLocaleString("es")} tokens en documentos` : "Sin documentos todavía."}</p>
                <span
                  className={cx(
                    "mt-1.5 inline-block text-[0.625rem] font-bold px-1.5 py-0.5 rounded-full",
                    knowledgeMode === "rag" ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800",
                  )}
                >
                  {knowledgeMode === "rag" ? "Búsqueda en documentos" : "Todo en contexto"}
                </span>
              </div>
            }
          />
          <div className="p-4 rounded-2xl border border-slate-200/80 bg-white text-[0.6875rem] text-slate-500 leading-relaxed">
            <p className="font-semibold text-slate-700 mb-1">Cómo se organiza</p>
            Cada <strong>sesión</strong> es un frente de trabajo con su objetivo y sus notas. Dentro, cada <strong>hilo</strong> es una
            conversación. El agente conoce el proyecto, las notas de la sesión y lo hablado en sus otros hilos.
          </div>
        </aside>
      </div>
    </div>
  );
}

function ResourceCard({ title, action, onClick, body }: { title: string; action: string; onClick: () => void; body: React.ReactNode }) {
  return (
    <div className="p-4 rounded-2xl border border-slate-200/80 bg-white shadow-2xs">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-bold text-slate-900">{title}</h3>
        <button type="button" onClick={onClick} className="text-xs font-semibold text-orange-700 hover:underline">
          {action}
        </button>
      </div>
      {body}
    </div>
  );
}
