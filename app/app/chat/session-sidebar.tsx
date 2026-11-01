"use client";

import { useState } from "react";
import { cx } from "@/shared/ui/primitives";
import type { AgentThread } from "@/types/domain";
import type { SessionWithThreads } from "@/lib/services/agent-sessions";
import { timeAgo } from "./time-ago";

/**
 * Panel izquierdo dentro de una sesión (como un proyecto de Claude abierto en una conversación):
 * volver al proyecto, la sesión actual con su objetivo y notas, sus hilos y las otras sesiones.
 */
export function SessionSidebar({
  projectName,
  session,
  otherSessions,
  activeThreadId,
  sessionsSupported,
  onBackToProject,
  onSelectThread,
  onNewThread,
  onRenameThread,
  onArchiveThread,
  onOpenSession,
  onUpdateSession,
  onOpenInstructions,
  onOpenKnowledge,
  onClose,
  knowledgeTokens = 0,
}: {
  projectName: string;
  session: SessionWithThreads;
  otherSessions: SessionWithThreads[];
  activeThreadId: string | null;
  sessionsSupported: boolean;
  onBackToProject: () => void;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onRenameThread: (threadId: string, title: string) => void;
  onArchiveThread: (thread: AgentThread) => void;
  onOpenSession: (sessionId: string) => void;
  onUpdateSession: (patch: { title?: string; goal?: string; status?: "active" | "archived" }) => void;
  onOpenInstructions: () => void;
  onOpenKnowledge: () => void;
  onClose?: () => void;
  knowledgeTokens?: number;
}) {
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingSession, setEditingSession] = useState(false);
  const [sessionTitle, setSessionTitle] = useState(session.title);
  const [sessionGoal, setSessionGoal] = useState(session.goal);
  const [notesOpen, setNotesOpen] = useState(true);
  const [othersOpen, setOthersOpen] = useState(false);

  const notes = session.notes;
  const hasNotes = !!notes && (notes.summary || notes.decisions.length || notes.openQuestions.length || notes.nextSteps.length);
  const canEditSession = sessionsSupported && !session.virtual;

  const saveRename = (threadId: string) => {
    if (editingTitle.trim()) onRenameThread(threadId, editingTitle.trim());
    setEditingThreadId(null);
  };

  const saveSession = () => {
    const patch: { title?: string; goal?: string } = {};
    if (sessionTitle.trim() && sessionTitle.trim() !== session.title) patch.title = sessionTitle.trim();
    if (sessionGoal.trim() !== session.goal) patch.goal = sessionGoal.trim();
    if (Object.keys(patch).length) onUpdateSession(patch);
    setEditingSession(false);
  };

  return (
    <div className="w-[85vw] max-w-80 lg:w-72 shrink-0 border-r border-slate-200 bg-slate-50/70 flex flex-col h-full overflow-hidden">
      {/* Volver al proyecto */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBackToProject}
          className="min-w-0 flex items-center gap-1.5 px-2 py-1.5 -ml-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition"
          title="Volver al proyecto"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="truncate">{projectName}</span>
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Cerrar panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Sesión actual */}
        <div className="mx-3 mb-3 p-3 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.625rem] font-bold uppercase tracking-wider text-orange-600">Sesión</span>
            {canEditSession && !editingSession && (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setSessionTitle(session.title);
                    setSessionGoal(session.goal);
                    setEditingSession(true);
                  }}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  title="Editar sesión"
                  aria-label="Editar sesión"
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSession({ status: session.status === "archived" ? "active" : "archived" })}
                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  title={session.status === "archived" ? "Reactivar sesión" : "Archivar sesión"}
                  aria-label={session.status === "archived" ? "Reactivar sesión" : "Archivar sesión"}
                >
                  <ArchiveIcon />
                </button>
              </div>
            )}
          </div>

          {editingSession ? (
            <div className="mt-2 space-y-2">
              <input
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                maxLength={200}
                autoFocus
                className="w-full text-xs font-semibold p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                placeholder="Nombre de la sesión"
              />
              <textarea
                value={sessionGoal}
                onChange={(e) => setSessionGoal(e.target.value)}
                maxLength={2000}
                rows={3}
                className="w-full text-xs p-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                placeholder="¿Qué quieres lograr en esta sesión?"
              />
              <div className="flex justify-end gap-1.5">
                <button type="button" onClick={() => setEditingSession(false)} className="px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">
                  Cancelar
                </button>
                <button type="button" onClick={saveSession} className="px-2.5 py-1 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg">
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mt-1 text-sm font-bold text-slate-900 leading-snug break-words">{session.title}</h2>
              {session.status === "archived" && (
                <span className="mt-1 inline-block text-[0.625rem] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">Archivada</span>
              )}
              <p className={cx("mt-1 text-[0.6875rem] leading-relaxed", session.goal ? "text-slate-600" : "text-slate-400 italic")}>
                {session.goal || (canEditSession ? "Sin objetivo todavía. El agente lo anotará cuando lo definas, o edítalo aquí." : "Todos tus hilos del proyecto.")}
              </p>
            </>
          )}

          {/* Notas que mantiene el agente */}
          {sessionsSupported && !session.virtual && (
            <div className="mt-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setNotesOpen((v) => !v)}
                className="w-full flex items-center justify-between text-[0.6875rem] font-semibold text-slate-700"
                aria-expanded={notesOpen}
              >
                <span>Notas de la sesión</span>
                <Chevron open={notesOpen} />
              </button>
              {notesOpen && (
                <div className="mt-2 space-y-2 text-[0.6875rem] text-slate-600">
                  {!hasNotes && (
                    <p className="text-slate-400 leading-relaxed">
                      Aún no hay notas. Pídele al agente «anota que…» o deja que registre decisiones y pendientes mientras conversan.
                    </p>
                  )}
                  {notes?.summary && <p className="leading-relaxed whitespace-pre-line">{notes.summary}</p>}
                  <NoteList title="Decisiones" items={notes?.decisions} tone="emerald" />
                  <NoteList title="Preguntas abiertas" items={notes?.openQuestions} tone="amber" />
                  <NoteList title="Próximos pasos" items={notes?.nextSteps} tone="slate" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hilos de la sesión */}
        <div className="px-3">
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400">Hilos ({session.threads.length})</span>
            <button
              type="button"
              onClick={onNewThread}
              className="flex items-center gap-1 px-2 py-1 text-[0.6875rem] font-semibold text-orange-700 hover:bg-orange-50 rounded-lg transition"
            >
              <PlusIcon /> Nuevo hilo
            </button>
          </div>
          <ul className="space-y-0.5">
            {session.threads.length === 0 && <li className="px-2 py-3 text-xs text-slate-400">Esta sesión no tiene hilos todavía.</li>}
            {session.threads.map((t) => {
              const active = t.id === activeThreadId;
              const editing = editingThreadId === t.id;
              return (
                <li key={t.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => !editing && onSelectThread(t.id)}
                    onKeyDown={(e) => {
                      if (!editing && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onSelectThread(t.id);
                      }
                    }}
                    className={cx(
                      "group flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs cursor-pointer transition",
                      active ? "bg-white text-slate-900 font-semibold shadow-2xs border border-slate-200/80" : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900",
                    )}
                  >
                    <span className={cx("w-1.5 h-1.5 rounded-full shrink-0", active ? "bg-orange-500" : "bg-slate-300")} aria-hidden="true" />
                    {editing ? (
                      <input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={() => saveRename(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveRename(t.id);
                          if (e.key === "Escape") setEditingThreadId(null);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 text-xs p-1 rounded border border-orange-400 bg-white"
                      />
                    ) : (
                      <span className="flex-1 min-w-0 truncate">{t.title}</span>
                    )}
                    {!editing && (
                      <span className="flex items-center gap-0.5 shrink-0 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingThreadId(t.id);
                            setEditingTitle(t.title);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-700"
                          title="Renombrar hilo"
                          aria-label={`Renombrar ${t.title}`}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onArchiveThread(t);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-slate-700"
                          title="Archivar hilo"
                          aria-label={`Archivar ${t.title}`}
                        >
                          <ArchiveIcon />
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Otras sesiones del proyecto */}
        {otherSessions.length > 0 && (
          <div className="px-3 mt-4 mb-3">
            <button
              type="button"
              onClick={() => setOthersOpen((v) => !v)}
              className="w-full flex items-center justify-between px-1 mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600"
              aria-expanded={othersOpen}
            >
              <span>Otras sesiones ({otherSessions.length})</span>
              <Chevron open={othersOpen} />
            </button>
            {othersOpen && (
              <ul className="space-y-0.5">
                {otherSessions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onOpenSession(s.id)}
                      className="w-full text-left px-2.5 py-2 rounded-xl text-xs text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 transition"
                    >
                      <span className="block truncate font-medium">{s.title}</span>
                      <span className="block text-[0.625rem] text-slate-400">
                        {s.threads.length} {s.threads.length === 1 ? "hilo" : "hilos"} · {timeAgo(s.lastActivityAt)}
                        {s.status === "archived" ? " · archivada" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Recursos del proyecto, compartidos por todas las sesiones */}
      <div className="p-3 border-t border-slate-200/80 bg-white grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={onOpenInstructions}
          className="px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition text-left"
        >
          Instrucciones
          <span className="block text-[0.625rem] text-slate-400">del proyecto</span>
        </button>
        <button
          type="button"
          onClick={onOpenKnowledge}
          className="px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition text-left"
        >
          Conocimiento
          <span className="block text-[0.625rem] text-slate-400">{knowledgeTokens > 0 ? `${Math.round(knowledgeTokens / 1000)}k tokens` : "sin archivos"}</span>
        </button>
      </div>
    </div>
  );
}

function NoteList({ title, items, tone }: { title: string; items?: string[]; tone: "emerald" | "amber" | "slate" }) {
  if (!items?.length) return null;
  const dot = tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-slate-400";
  return (
    <div>
      <p className="font-semibold text-slate-700 mb-1">{title}</p>
      <ul className="space-y-1">
        {items.map((x, i) => (
          <li key={i} className="flex gap-1.5 leading-snug">
            <span className={cx("mt-1.5 w-1 h-1 rounded-full shrink-0", dot)} aria-hidden="true" />
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={cx("w-3.5 h-3.5 transition-transform", open && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  );
}
