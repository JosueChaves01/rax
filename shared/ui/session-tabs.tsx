"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { cx, formatDate } from "@/shared/ui/primitives";
import type { Evidence, MentorSession, ProjectKnowledgeDocument, SessionNote, SessionNoteKind, SessionNoteReply, Task } from "@/types/domain";
import {
  addNoteAction,
  replyToNoteAction,
  updateNoteReplyAction,
  updateSessionNoteAction,
  getMentorSessionWorkspaceAction,
} from "@/app/actions";

/** Datos de las pestañas de una sesión de mentoría (ver getMentorSessionWorkspace). */
export interface SessionWorkspace {
  session: MentorSession;
  notes: Array<SessionNote & { authorName: string; replies?: Array<SessionNoteReply & { authorName: string }> }>;
  tasks: Array<Task & { assigneeName: string }>;
  documents: Array<Omit<ProjectKnowledgeDocument, "content"> & { preview: string }>;
  evidence: Evidence[];
  permissions: { canNote: boolean; canManageTasks: boolean; canAddDocuments: boolean; canReply?: boolean; actorId?: string };
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

type ActionRes = { ok: true } | { ok: false; error: string };

/** Texto de una nota o respuesta; su autor puede corregirlo en el lugar. */
function EditableText({
  text,
  canEdit,
  onSave,
  onSaved,
  className,
}: {
  text: string;
  canEdit: boolean;
  onSave: (body: string) => Promise<ActionRes>;
  onSaved: () => Promise<void>;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!editing)
    return (
      <div className={cx("group flex items-start gap-2", className)}>
        <p className="flex-1 leading-relaxed whitespace-pre-line">{text}</p>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
            className="shrink-0 text-[11px] font-semibold text-slate-500 hover:text-blue-700"
          >
            Editar
          </button>
        )}
      </div>
    );
  const save = () =>
    start(async () => {
      setError(null);
      const res = await onSave(draft.trim());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      await onSaved();
    });
  return (
    <div className={cx("space-y-1.5", className)}>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={2} className={cx(fieldClass, "w-full resize-y")} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !draft.trim() || draft.trim() === text}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800">
          Cancelar
        </button>
        {error && <span className="text-[11px] text-red-700">{error}</span>}
      </div>
    </div>
  );
}

/** Respuestas de una nota y el campo para responderla. */
function NoteReplies({
  projectId,
  noteId,
  replies,
  actorId,
  canReply,
  onChanged,
}: {
  projectId: string;
  noteId: string;
  replies: Array<SessionNoteReply & { authorName: string }>;
  actorId?: string;
  canReply: boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      const res = await replyToNoteAction(projectId, noteId, body.trim());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBody("");
      setOpen(false);
      await onChanged();
    });
  if (!replies.length && !canReply) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {replies.map((r) => (
        <div key={r.id} className="ml-3 pl-3 border-l-2 border-slate-200">
          <div className="text-[11px] text-slate-500">
            {r.authorName} · {formatDate(r.createdAt)}
            {r.updatedAt ? " · editada" : ""}
          </div>
          <EditableText
            text={r.body}
            canEdit={!!actorId && r.authorId === actorId}
            onSave={(text) => updateNoteReplyAction(projectId, r.id, text)}
            onSaved={onChanged}
            className="text-xs text-slate-700"
          />
        </div>
      ))}
      {canReply &&
        (open ? (
          <div className="ml-3 space-y-1.5">
            <label className="sr-only" htmlFor={`reply-${noteId}`}>
              Respuesta
            </label>
            <textarea
              id={`reply-${noteId}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Escribe tu respuesta…"
              className={cx(fieldClass, "w-full resize-y")}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={pending || !body.trim()}
                className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? "Enviando…" : "Responder"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800">
                Cancelar
              </button>
              {error && <span className="text-[11px] text-red-700">{error}</span>}
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="ml-3 text-[11px] font-semibold text-blue-700 hover:text-blue-900">
            Responder
          </button>
        ))}
    </div>
  );
}

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
                {n.updatedAt && <span>· editada</span>}
                {n.isPrivate && <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">Privada</span>}
              </div>
              <EditableText
                text={n.body}
                canEdit={!!permissions.actorId && n.authorId === permissions.actorId}
                onSave={(body) => updateSessionNoteAction(session.projectId, n.id, body)}
                onSaved={onChanged}
                className="mt-1.5 text-xs text-slate-800"
              />
              <NoteReplies
                projectId={session.projectId}
                noteId={n.id}
                replies={n.replies ?? []}
                actorId={permissions.actorId}
                canReply={permissions.canReply === true}
                onChanged={onChanged}
              />
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
            : "Las notas las registra el mentor de la sesión. Puedes responderlas aquí o pedirle al asistente que lo haga por ti."}
        </p>
      )}
    </Panel>
  );
}
