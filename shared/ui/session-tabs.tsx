"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { cx, formatDate } from "@/shared/ui/primitives";
import type { Evidence, MentorSession, ProjectKnowledgeDocument, SessionNote, SessionNoteKind, Task, TaskStatus } from "@/types/domain";
import {
  addNoteAction,
  addProjectDocumentAction,
  createTaskAction,
  getMentorSessionWorkspaceAction,
  setTaskStatusAction,
} from "@/app/actions";

/** Datos de las pestañas de una sesión de mentoría (ver getMentorSessionWorkspace). */
export interface SessionWorkspace {
  session: MentorSession;
  notes: Array<SessionNote & { authorName: string }>;
  tasks: Array<Task & { assigneeName: string }>;
  documents: Array<Omit<ProjectKnowledgeDocument, "content"> & { preview: string }>;
  evidence: Evidence[];
  permissions: { canNote: boolean; canManageTasks: boolean; canAddDocuments: boolean };
}

const NOTE_KINDS: Array<[SessionNoteKind, string]> = [
  ["observation", "Observación"],
  ["question", "Pregunta"],
  ["suggestion", "Sugerencia"],
  ["agreement", "Acuerdo"],
  ["commitment", "Compromiso"],
  ["blocker", "Bloqueo"],
  ["decision", "Decisión"],
];
const NOTE_LABEL = Object.fromEntries(NOTE_KINDS) as Record<SessionNoteKind, string>;
const NOTE_TONE: Record<SessionNoteKind, string> = {
  observation: "bg-slate-100 text-slate-700",
  question: "bg-amber-100 text-amber-800",
  suggestion: "bg-blue-100 text-blue-800",
  agreement: "bg-emerald-100 text-emerald-800",
  commitment: "bg-orange-100 text-orange-800",
  blocker: "bg-red-100 text-red-800",
  decision: "bg-violet-100 text-violet-800",
};
const TASK_STATUS: Array<[TaskStatus, string]> = [
  ["todo", "Pendiente"],
  ["doing", "En curso"],
  ["done", "Hecha"],
  ["blocked", "Bloqueada"],
];

const fieldClass =
  "w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500";

/** Carga (y recarga) lo que muestran las pestañas de la sesión seleccionada. */
export function useSessionWorkspace(projectId: string | undefined, sessionId: string | undefined) {
  const [data, setData] = useState<SessionWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId || !sessionId) return;
    setLoading(true);
    try {
      const res = await getMentorSessionWorkspaceAction(projectId, sessionId);
      if (res.ok && res.data) {
        setData(res.data as SessionWorkspace);
        setError(null);
      } else setError(!res.ok ? res.error : "No se pudo cargar la sesión.");
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId]);

  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}

function AskAgent({ projectId, label }: { projectId: string; label: string }) {
  return (
    <Link href={`/app/chat?project=${projectId}`} className="text-xs font-semibold text-blue-600 hover:underline">
      {label} →
    </Link>
  );
}

function Panel({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 mb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

/* ───────────── Notas ───────────── */

export function NotesTab({ ws, onChanged }: { ws: SessionWorkspace; onChanged: () => Promise<void> }) {
  const [kind, setKind] = useState<SessionNoteKind>("observation");
  const [body, setBody] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { session, notes, permissions } = ws;

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await addNoteAction(session.projectId, session.id, kind, body.trim(), undefined, isPrivate);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      setIsPrivate(false);
      await onChanged();
    });

  return (
    <Panel
      title={`Notas de la sesión (${notes.length})`}
      subtitle="Observaciones, preguntas, acuerdos y compromisos que quedan registrados en el proyecto."
      actions={<AskAgent projectId={session.projectId} label="Pedir al agente un resumen" />}
    >
      {notes.length === 0 ? (
        <p className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">Todavía no hay notas en esta sesión.</p>
      ) : (
        <ul className="space-y-2.5">
          {notes.map((n) => (
            <li key={n.id} className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/50">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className={cx("px-2 py-0.5 rounded-full font-semibold", NOTE_TONE[n.kind])}>{NOTE_LABEL[n.kind] ?? n.kind}</span>
                <span>{n.authorName}</span>
                <span>· {formatDate(n.createdAt)}</span>
                {n.isPrivate && <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">Privada</span>}
              </div>
              <p className="mt-1.5 text-xs text-slate-800 leading-relaxed whitespace-pre-line">{n.body}</p>
            </li>
          ))}
        </ul>
      )}

      {permissions.canNote ? (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="sr-only" htmlFor="note-kind">
              Tipo de nota
            </label>
            <select id="note-kind" value={kind} onChange={(e) => setKind(e.target.value as SessionNoteKind)} className={cx(fieldClass, "sm:w-44")}>
              {NOTE_KINDS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="note-body">
              Nota
            </label>
            <textarea
              id="note-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Escribe la nota…"
              className={cx(fieldClass, "flex-1 resize-y")}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Solo para mí
            </label>
            <button
              type="button"
              onClick={submit}
              disabled={pending || !body.trim()}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Agregar nota"}
            </button>
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
      ) : (
        <p className="mt-4 text-[11px] text-slate-500">
          {session.status === "completed"
            ? "La sesión ya terminó: sus notas quedan como registro."
            : "Las notas las registra el mentor de la sesión. Tú puedes llevar tus preguntas al chat del asistente."}
        </p>
      )}
    </Panel>
  );
}

/* ───────────── Documentos ───────────── */

export function DocumentsTab({ ws, onChanged }: { ws: SessionWorkspace; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { session, documents, evidence, permissions } = ws;

  const submit = () =>
    start(async () => {
      setError(null);
      const clean = title.trim();
      const res = await addProjectDocumentAction(session.projectId, {
        title: clean,
        filename: `${clean.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "documento"}.md`,
        content: content.trim(),
        fileType: "markdown",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTitle("");
      setContent("");
      setAdding(false);
      await onChanged();
    });

  return (
    <div className="space-y-4">
      <Panel
        title={`Documentos del proyecto (${documents.length})`}
        subtitle="La base de conocimiento que también usa el agente en todas las conversaciones."
        actions={
          permissions.canAddDocuments && !adding ? (
            <button type="button" onClick={() => setAdding(true)} className="text-xs font-semibold text-blue-600 hover:underline">
              + Agregar documento
            </button>
          ) : undefined
        }
      >
        {adding && (
          <div className="mb-4 p-3 rounded-xl border border-blue-100 bg-blue-50/40 space-y-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Título" className={fieldClass} aria-label="Título del documento" />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="Contenido (texto o Markdown): acuerdos de la sesión, guion de entrevista, datos…"
              className={cx(fieldClass, "resize-y")}
              aria-label="Contenido del documento"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancelar
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !title.trim() || !content.trim()}
                className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? "Guardando…" : "Guardar documento"}
              </button>
            </div>
            {error && <p className="text-xs text-red-700">{error}</p>}
          </div>
        )}

        {documents.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
            Este proyecto no tiene documentos todavía.
          </p>
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li key={doc.id} className="rounded-xl border border-slate-200/80 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpen(open === doc.id ? null : doc.id)}
                  className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-slate-50"
                  aria-expanded={open === doc.id}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-slate-900 truncate">{doc.title}</span>
                    <span className="block text-[11px] text-slate-500 font-mono truncate">
                      {doc.filename} · {doc.tokenCount.toLocaleString("es")} tokens · {formatDate(doc.updatedAt)}
                    </span>
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{open === doc.id ? "Ocultar" : "Ver"}</span>
                </button>
                {open === doc.id && (
                  <pre className="px-3 pb-3 text-[11px] text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {doc.preview}
                    {doc.preview.length >= 600 ? "…" : ""}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Evidencia registrada (${evidence.length})`} subtitle="Enlaces, notas y archivos que respaldan resultados y tareas.">
        {evidence.length === 0 ? (
          <p className="text-xs text-slate-500">Todavía no hay evidencia en este proyecto.</p>
        ) : (
          <ul className="space-y-2">
            {evidence.map((ev) => (
              <li key={ev.id} className="p-3 rounded-xl border border-slate-200/80 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 truncate">{ev.title}</span>
                  <span className="text-[11px] text-slate-400 shrink-0">{formatDate(ev.createdAt)}</span>
                </div>
                {ev.description && <p className="mt-1 text-slate-600">{ev.description}</p>}
                {ev.url && (
                  <a href={ev.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-blue-600 hover:underline break-all">
                    {ev.url}
                  </a>
                )}
                {ev.file && <p className="mt-1 text-[11px] text-slate-500 font-mono">{ev.file.name}</p>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/* ───────────── Tareas ───────────── */

export function TasksTab({ ws, onChanged }: { ws: SessionWorkspace; onChanged: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { session, tasks, permissions } = ws;
  const synthesis = session.postSessionSynthesis;
  const visible = filter === "open" ? tasks.filter((t) => t.status !== "done") : tasks;
  const done = tasks.filter((t) => t.status === "done").length;

  const add = () =>
    start(async () => {
      setError(null);
      const res = await createTaskAction(session.projectId, { title: title.trim(), ...(dueDate ? { dueDate } : {}) });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTitle("");
      setDueDate("");
      await onChanged();
    });

  const changeStatus = (taskId: string, status: TaskStatus) =>
    start(async () => {
      setError(null);
      const res = await setTaskStatusAction(session.projectId, taskId, status);
      if (!res.ok) setError(res.error);
      await onChanged();
    });

  return (
    <div className="space-y-4">
      {synthesis && (synthesis.entrepreneurCommitments.length > 0 || synthesis.mentorCommitments.length > 0) && (
        <Panel title="Compromisos de esta sesión" subtitle="Salieron de la síntesis posterior a la sesión.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-semibold text-slate-700 mb-1">Emprendedor/a</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                {synthesis.entrepreneurCommitments.map((c, i) => (
                  <li key={i}>
                    {c.title}
                    {c.dueDate ? ` · ${c.dueDate}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-slate-700 mb-1">Mentor/a</p>
              <ul className="list-disc pl-4 space-y-1 text-slate-600">
                {synthesis.mentorCommitments.map((c, i) => (
                  <li key={i}>
                    {c.title}
                    {c.dueDate ? ` · ${c.dueDate}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>
      )}

      <Panel
        title={`Tareas del proyecto (${done}/${tasks.length} hechas)`}
        subtitle="Lo que hay que hacer antes de la próxima sesión."
        actions={
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
            {(
              [
                ["open", "Abiertas"],
                ["all", "Todas"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cx("px-2.5 py-1 text-xs font-semibold rounded-md", filter === k ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500")}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {visible.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
            {filter === "open" ? "No hay tareas abiertas." : "Este proyecto no tiene tareas todavía."}
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((t) => (
              <li key={t.id} className="p-3 rounded-xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                <div className="flex-1 min-w-0">
                  <p className={cx("text-xs font-semibold", t.status === "done" ? "text-slate-400 line-through" : "text-slate-900")}>{t.title}</p>
                  <p className="text-[11px] text-slate-500">
                    {t.assigneeName}
                    {t.dueDate ? ` · vence ${t.dueDate.slice(0, 10)}` : ""}
                    {t.status === "blocked" && t.blockedReason ? ` · ${t.blockedReason}` : ""}
                  </p>
                </div>
                {permissions.canManageTasks ? (
                  <select
                    value={t.status}
                    onChange={(e) => changeStatus(t.id, e.target.value as TaskStatus)}
                    disabled={pending}
                    aria-label={`Estado de ${t.title}`}
                    className="text-xs p-1.5 rounded-lg border border-slate-200 bg-white sm:w-32"
                  >
                    {TASK_STATUS.map(([s, label]) => (
                      <option key={s} value={s}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-600">{TASK_STATUS.find(([s]) => s === t.status)?.[1]}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {permissions.canManageTasks && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && title.trim() && add()}
              maxLength={200}
              placeholder="Nueva tarea…"
              aria-label="Nueva tarea"
              className={cx(fieldClass, "flex-1")}
            />
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Fecha límite" className={cx(fieldClass, "sm:w-40")} />
            <button
              type="button"
              onClick={add}
              disabled={pending || !title.trim()}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              Agregar
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-4">
          <AskAgent projectId={session.projectId} label="Pedir al agente que proponga tareas" />
          <Link href={`/app/p/${session.projectId}/tareas`} className="text-xs font-semibold text-slate-600 hover:underline">
            Abrir el tablero completo →
          </Link>
        </div>
      </Panel>
    </div>
  );
}
