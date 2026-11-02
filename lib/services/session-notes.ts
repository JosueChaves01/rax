import type { MentorSession, SessionNote, SessionNoteKind, SessionNoteReply } from "@/types/domain";
import { forbidden, notFound, validation } from "@/lib/errors";
import { guard, type ServiceDeps } from "./base";
import { addNote, getMentorSessionWorkspace, refreshUpcomingBriefings } from "./mentoring";
import { inBackground } from "./background";
import { touch } from "./projects";

/**
 * Notas de las sesiones de mentoría y sus respuestas, para el agente y para las pestañas de sesión.
 *
 * - Leer: cualquiera que vea el proyecto (emprendedor, colaborador, mentor), sin las notas privadas de otra persona.
 * - Crear notas: el mentor de la sesión (regla de addNote en mentoring.ts).
 * - Editar una nota: solo su autor.
 * - Responder una nota: cualquiera que pueda leerla; editar la respuesta, solo su autor.
 */

export const NOTE_KINDS: SessionNoteKind[] = ["observation", "question", "suggestion", "agreement", "commitment", "blocker", "decision"];
export const isNoteKind = (v: unknown): v is SessionNoteKind => typeof v === "string" && (NOTE_KINDS as string[]).includes(v);

const MAX_BODY = 2000;

export type ReplyView = SessionNoteReply & { authorName: string };
export type NoteView = SessionNote & { authorName: string; replies: ReplyView[] };

const visibleTo = (d: ServiceDeps) => (n: SessionNote) => !n.isPrivate || n.authorId === d.actor.id;

function cleanBody(body: unknown, what: string): string {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) throw validation(`${what} está vacía.`);
  return text.slice(0, MAX_BODY);
}

async function names(d: ServiceDeps, ids: Iterable<string>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of new Set(ids)) {
    const p = await d.repo.profiles.get(id).catch(() => undefined);
    if (p) out.set(id, p.name);
  }
  return out;
}

/** Respuestas de una sesión o de todo un proyecto. Sin la migración de respuestas, no hay ninguna. */
async function loadReplies(d: ServiceDeps, where: Partial<SessionNoteReply>): Promise<SessionNoteReply[]> {
  try {
    return await d.repo.sessionNoteReplies.list(where);
  } catch (e) {
    console.warn("[session-notes] no se pudieron leer las respuestas (¿falta la migración 20261102000002?)", e);
    return [];
  }
}

/** Agrega a cada nota sus respuestas (en orden) y los nombres de quienes escribieron. */
export async function withReplies(d: ServiceDeps, notes: SessionNote[], replies: SessionNoteReply[]): Promise<NoteView[]> {
  const byNote = new Map<string, SessionNoteReply[]>();
  for (const r of replies) byNote.set(r.noteId, [...(byNote.get(r.noteId) ?? []), r]);
  const people = await names(d, [...notes.map((n) => n.authorId), ...replies.map((r) => r.authorId)]);
  const who = (id: string) => (id === d.actor.id ? `${people.get(id) ?? "Tú"} (tú)` : (people.get(id) ?? "Otra persona"));
  return notes.map((n) => ({
    ...n,
    authorName: who(n.authorId),
    replies: (byNote.get(n.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((r) => ({ ...r, authorName: who(r.authorId) })),
  }));
}

/** Notas visibles de una sesión con sus respuestas (pestaña Notas de la sesión). */
export async function sessionNotesWithReplies(d: ServiceDeps, session: MentorSession): Promise<NoteView[]> {
  const [notes, replies] = await Promise.all([d.repo.sessionNotes.list({ sessionId: session.id }), loadReplies(d, { sessionId: session.id })]);
  const visible = notes.filter(visibleTo(d)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return withReplies(d, visible, replies);
}

/**
 * Pestañas de una sesión de mentoría con las respuestas de cada nota y quién puede responder
 * (cualquiera que vea la sesión) o editar (el autor).
 */
export async function getSessionWorkspaceWithReplies(d: ServiceDeps, sessionId: string) {
  const ws = await getMentorSessionWorkspace(d, sessionId);
  const replies = await loadReplies(d, { sessionId });
  const byNote = new Map<string, ReplyView[]>();
  const people = await names(d, replies.map((r) => r.authorId));
  for (const r of replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    byNote.set(r.noteId, [...(byNote.get(r.noteId) ?? []), { ...r, authorName: people.get(r.authorId) ?? "Otra persona" }]);
  }
  return {
    ...ws,
    notes: ws.notes.map((n) => ({ ...n, replies: byNote.get(n.id) ?? [] })),
    permissions: { ...ws.permissions, canReply: true, actorId: d.actor.id },
  };
}

export interface ProjectNotesView {
  sessions: Array<Pick<MentorSession, "id" | "kind" | "status" | "mentorId" | "createdAt" | "scheduledAt" | "confirmedAt">>;
  notes: NoteView[];
  /** Notas visibles en total (antes de recortar a `limit`). */
  total: number;
}

/**
 * Notas del proyecto con sus respuestas, de una sesión o de todas. Devuelve las más recientes
 * (hasta `limit`) en orden cronológico.
 */
export async function listProjectNotes(d: ServiceDeps, projectId: string, opts: { sessionId?: string; limit?: number } = {}): Promise<ProjectNotesView> {
  await guard(d, projectId, "project.read");
  const sessions = (await d.repo.mentorSessions.list({ projectId })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (opts.sessionId && !sessions.some((s) => s.id === opts.sessionId)) throw notFound("Esa sesión no pertenece a este proyecto.");
  const where = opts.sessionId ? { sessionId: opts.sessionId } : { projectId };
  const [notes, replies] = await Promise.all([d.repo.sessionNotes.list(where), loadReplies(d, where)]);
  const visible = notes.filter((n) => n.projectId === projectId).filter(visibleTo(d)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const limit = Math.max(1, Math.min(opts.limit ?? 30, 100));
  return {
    sessions: sessions.map(({ id, kind, status, mentorId, createdAt, scheduledAt, confirmedAt }) => ({ id, kind, status, mentorId, createdAt, scheduledAt, confirmedAt })),
    notes: await withReplies(d, visible.slice(-limit), replies),
    total: visible.length,
  };
}

/** Nota que quien consulta puede ver; si no, «no encontrada» (no se revela que existe una privada). */
async function readableNote(d: ServiceDeps, noteId: string): Promise<SessionNote> {
  const note = await d.repo.sessionNotes.get(noteId);
  if (!note) throw notFound("No encontré esa nota.");
  await guard(d, note.projectId, "project.read");
  if (!visibleTo(d)(note)) throw notFound("No encontré esa nota.");
  return note;
}

/** Crea una nota en una sesión (solo el mentor de la sesión, mientras siga abierta). */
export async function createSessionNote(
  d: ServiceDeps,
  projectId: string,
  input: { sessionId: string; kind?: SessionNoteKind; body: string; isPrivate?: boolean },
): Promise<SessionNote> {
  const session = await d.repo.mentorSessions.get(input.sessionId);
  if (!session || session.projectId !== projectId) throw notFound("Esa sesión no pertenece a este proyecto.");
  return addNote(d, input.sessionId, input.kind ?? "observation", cleanBody(input.body, "La nota"), undefined, input.isPrivate === true);
}

/** Corrige una nota: texto, tipo o privacidad. Solo quien la escribió. */
export async function updateSessionNote(
  d: ServiceDeps,
  noteId: string,
  patch: { body?: string; kind?: SessionNoteKind; isPrivate?: boolean },
): Promise<SessionNote> {
  const note = await readableNote(d, noteId);
  if (note.authorId !== d.actor.id) throw forbidden("Solo quien escribió la nota puede editarla. Puedes responderla.");
  const changes: Partial<SessionNote> = {};
  if (patch.body !== undefined) changes.body = cleanBody(patch.body, "La nota");
  if (patch.kind !== undefined) {
    if (!isNoteKind(patch.kind)) throw validation("Ese tipo de nota no existe.");
    changes.kind = patch.kind;
  }
  if (typeof patch.isPrivate === "boolean") changes.isPrivate = patch.isPrivate;
  if (!Object.keys(changes).length) throw validation("No hay cambios para guardar en la nota.");
  const updated = await d.repo.sessionNotes.update(noteId, { ...changes, updatedAt: d.now() });
  await touch(d, note.projectId);
  return updated;
}

/** Responde una nota (p. ej. el emprendedor contesta una pregunta del mentor). */
export async function addNoteReply(d: ServiceDeps, noteId: string, body: string): Promise<SessionNoteReply> {
  const note = await readableNote(d, noteId);
  const reply: SessionNoteReply = {
    id: d.newId("nrep"),
    noteId,
    sessionId: note.sessionId,
    projectId: note.projectId,
    authorId: d.actor.id,
    body: cleanBody(body, "La respuesta"),
    createdAt: d.now(),
  };
  await d.repo.sessionNoteReplies.insert(reply);
  await touch(d, note.projectId);
  await inBackground("briefing", () => refreshUpcomingBriefings(d, note.projectId));
  return reply;
}

/** Corrige una respuesta. Solo quien la escribió. */
export async function updateNoteReply(d: ServiceDeps, replyId: string, body: string): Promise<SessionNoteReply> {
  const reply = await d.repo.sessionNoteReplies.get(replyId);
  if (!reply) throw notFound("No encontré esa respuesta.");
  await readableNote(d, reply.noteId);
  if (reply.authorId !== d.actor.id) throw forbidden("Solo quien escribió la respuesta puede editarla.");
  const updated = await d.repo.sessionNoteReplies.update(replyId, { body: cleanBody(body, "La respuesta"), updatedAt: d.now() });
  await touch(d, reply.projectId);
  await inBackground("briefing", () => refreshUpcomingBriefings(d, reply.projectId));
  return updated;
}

const KIND_LABEL: Record<SessionNoteKind, string> = {
  observation: "Observación",
  question: "Pregunta",
  suggestion: "Sugerencia",
  agreement: "Acuerdo",
  commitment: "Compromiso",
  blocker: "Bloqueo",
  decision: "Decisión",
};

/** Texto compacto para el modelo: cada nota con su id, tipo, autor y respuestas. */
export function renderNotesForAgent(view: ProjectNotesView): string {
  if (!view.notes.length) return "No hay notas visibles en las sesiones de este proyecto.";
  const day = (iso: string) => iso.slice(0, 10);
  const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);
  const lines = view.notes.map((n) => {
    const head = `[nota ${n.id}] (sesión ${n.sessionId}) ${KIND_LABEL[n.kind] ?? n.kind}${n.isPrivate ? " · privada" : ""} · ${n.authorName} · ${day(n.createdAt)}${n.updatedAt ? " (editada)" : ""}: ${clip(n.body, 700)}`;
    const replies = n.replies.map((r) => `   ↳ [respuesta ${r.id}] ${r.authorName} · ${day(r.createdAt)}${r.updatedAt ? " (editada)" : ""}: ${clip(r.body, 500)}`);
    return [head, ...replies].join("\n");
  });
  const more = view.total > view.notes.length ? `\n(Se muestran las ${view.notes.length} más recientes de ${view.total}.)` : "";
  return lines.join("\n") + more;
}
