import type { MentorSession, ProjectKnowledgeDocument, SessionNote, SessionNoteReply } from "@/types/domain";
import type { BriefingNote, BriefingPreviousSession, BriefingQuestion } from "@/lib/ai/provider";
import { SESSION_KIND_LABEL } from "@/features/labels";
import { plainText } from "@/lib/ai/plain-text";
import { isB2BFlow } from "@/lib/flags";
import { sysRepo, type ServiceDeps } from "./base";
import { sessionTranscriptForAi } from "./session-transcript";
import { cycleSignalsForBriefing } from "./cycle";

/** Los documentos eliminados quedan vacíos (ver project-knowledge.ts). */
const isActiveDocument = (doc: Pick<ProjectKnowledgeDocument, "content">) => doc.content !== "";

/**
 * Memoria de las sesiones anteriores para el briefing de la próxima: notas compartidas con sus
 * respuestas, preguntas del mentor (respondidas o no), síntesis, decisiones, compromisos, un tramo de
 * la última transcripción y los documentos del proyecto. Las notas privadas nunca entran.
 *
 * Los límites mantienen el contexto dentro de lo que aceptan los modelos gratuitos.
 */

const MAX_PREVIOUS_SESSIONS = 4;
const MAX_NOTES_PER_SESSION = 15;
const MAX_REPLIES_PER_NOTE = 4;
const MAX_TRANSCRIPT = 5_000;
const MAX_DOCUMENTS = 6;
const MAX_CYCLE_SIGNALS = 10;

export interface BriefingHistory {
  /** Notas (con respuestas) de la sesión anterior más reciente. */
  previousSessionNotes: BriefingNote[];
  previousSessions?: BriefingPreviousSession[];
  questionsFromNotes?: BriefingQuestion[];
  currentSessionNotes?: BriefingNote[];
  previousSessionPending?: string[];
  documents?: Array<{ title: string; source: string; updatedAt: string; excerpt: string }>;
}

/** Sin la migración de respuestas la tabla no existe: el briefing sigue sin ellas. */
async function projectReplies(d: ServiceDeps, projectId: string): Promise<SessionNoteReply[]> {
  try {
    return await d.repo.sessionNoteReplies.list({ projectId });
  } catch (e) {
    console.warn("[briefing] no se pudieron leer las respuestas a notas (¿falta la migración 20261102000002?)", e);
    return [];
  }
}

const day = (iso?: string) => (iso ? iso.slice(0, 10) : undefined);

function clipTranscript(text: string): string {
  if (text.length <= MAX_TRANSCRIPT) return text;
  // Se conserva sobre todo el cierre de la llamada, donde quedan los acuerdos.
  return `${text.slice(0, MAX_TRANSCRIPT * 0.25)}\n[… parte central omitida …]\n${text.slice(-MAX_TRANSCRIPT * 0.75)}`;
}

export async function buildBriefingHistory(
  d: ServiceDeps,
  current: MentorSession,
  allSessions: MentorSession[],
  allNotes: SessionNote[],
  documents: ProjectKnowledgeDocument[],
): Promise<BriefingHistory> {
  const replies = await projectReplies(d, current.projectId);
  const mentorIds = new Set(allSessions.map((s) => s.mentorId));
  const who = (authorId: string): BriefingNote["author"] => (mentorIds.has(authorId) ? "mentor" : "emprendedor");

  const shared = allNotes.filter((n) => !n.isPrivate);
  const repliesByNote = new Map<string, SessionNoteReply[]>();
  for (const r of replies) repliesByNote.set(r.noteId, [...(repliesByNote.get(r.noteId) ?? []), r]);

  const toNote = (n: SessionNote): BriefingNote => {
    const rs = (repliesByNote.get(n.id) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      kind: n.kind,
      author: who(n.authorId),
      body: plainText(n.body, 500),
      ...(rs.length
        ? { replies: rs.slice(-MAX_REPLIES_PER_NOTE).map((r) => ({ author: who(r.authorId), body: plainText(r.body, 500), date: day(r.updatedAt ?? r.createdAt) })) }
        : {}),
    };
  };
  const notesOf = (sessionId: string) =>
    shared
      .filter((n) => n.sessionId === sessionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-MAX_NOTES_PER_SESSION);

  // De la más reciente a la más antigua.
  const previous = allSessions
    .filter((s) => s.id !== current.id)
    .sort((a, b) => (b.scheduledAt ?? b.createdAt).localeCompare(a.scheduledAt ?? a.createdAt))
    .slice(0, MAX_PREVIOUS_SESSIONS);

  // Transcripción: solo la de la sesión anterior más reciente que tuvo llamada.
  let transcriptFor: string | undefined;
  let transcript: string | undefined;
  for (const s of previous) {
    const t = await sessionTranscriptForAi(d, s.id);
    if (t) {
      transcriptFor = s.id;
      transcript = clipTranscript(t);
      break;
    }
  }

  const previousSessions: BriefingPreviousSession[] = previous.map((s) => {
    const syn = s.postSessionSynthesis;
    return {
      kind: SESSION_KIND_LABEL[s.kind] ?? s.kind,
      date: day(s.completedAt ?? s.scheduledAt ?? s.createdAt),
      status: s.status,
      agenda: s.preSessionBriefing?.suggestedAgenda?.slice(0, 5),
      notes: notesOf(s.id).map(toNote),
      ...(syn
        ? {
            summary: plainText(syn.summary, 900),
            agreedDecisions: syn.agreedDecisions.map((x) => plainText(x, 240)).slice(0, 8),
            entrepreneurCommitments: syn.entrepreneurCommitments.map((c) => plainText(c.title, 200)).slice(0, 8),
            mentorCommitments: syn.mentorCommitments.map((c) => plainText(c.title, 200)).slice(0, 8),
            nextSteps: syn.nextSteps ? plainText(syn.nextSteps, 400) : undefined,
          }
        : {}),
      ...(s.decision ? { mentorDecision: `${s.decision.value}: ${plainText(s.decision.justification, 300)}` } : {}),
      ...(transcriptFor === s.id && transcript ? { transcriptExcerpt: transcript } : {}),
    };
  });

  // Las preguntas que dejó el mentor en cualquier sesión, con lo que respondió la persona.
  const sessionLabel = new Map(allSessions.map((s) => [s.id, `${SESSION_KIND_LABEL[s.kind] ?? s.kind} ${day(s.scheduledAt ?? s.createdAt) ?? ""}`.trim()]));
  const questionsFromNotes: BriefingQuestion[] = shared
    .filter((n) => n.kind === "question" || n.body.trim().endsWith("?"))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-20)
    .map((n) => {
      const answers = (repliesByNote.get(n.id) ?? [])
        .filter((r) => r.authorId !== n.authorId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((r) => plainText(r.body, 500));
      return { session: sessionLabel.get(n.sessionId) ?? "", question: plainText(n.body, 400), answered: answers.length > 0, answers };
    });

  const last = previous[0];
  const lastSyn = previous.find((s) => s.postSessionSynthesis)?.postSessionSynthesis;
  const previousSessionPending = lastSyn
    ? [
        ...lastSyn.entrepreneurCommitments.map((c) => `Compromiso del emprendedor: ${plainText(c.title, 160)}`),
        ...lastSyn.mentorCommitments.map((c) => `Compromiso del mentor: ${plainText(c.title, 160)}`),
        ...(lastSyn.nextSteps ? [`Próximos pasos acordados: ${plainText(lastSyn.nextSteps, 240)}`] : []),
      ].slice(0, 8)
    : [];

  // Pivot B2B: lo que pasó en el ciclo desde la última sesión (comentarios del cliente al material
  // y resultados de evaluaciones), del proveedor de Dev B (cycle.ts).
  const cycleSignals = isB2BFlow() ? await cycleSignalLines(d, current, previous, documents) : [];
  const pending = [...previousSessionPending, ...cycleSignals];

  const currentNotes = notesOf(current.id).map(toNote);
  const docs = documents
    .filter(isActiveDocument)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_DOCUMENTS)
    .map((doc) => ({ title: doc.title || doc.filename, source: doc.source, updatedAt: day(doc.updatedAt) ?? "", excerpt: plainText(doc.content, 500) }));

  return {
    previousSessionNotes: last ? notesOf(last.id).map(toNote) : [],
    previousSessions: previousSessions.length ? previousSessions : undefined,
    questionsFromNotes: questionsFromNotes.length ? questionsFromNotes : undefined,
    currentSessionNotes: currentNotes.length ? currentNotes : undefined,
    previousSessionPending: pending.length ? pending : undefined,
    documents: docs.length ? docs : undefined,
  };
}

/**
 * Señales del ciclo para el briefing en texto plano: comentarios nuevos del cliente (sobre material
 * publicado o sobre una sesión) y resultados de evaluaciones, desde la última sesión cerrada. Si el
 * proveedor falla o todavía no existe, el briefing sigue sin ellas.
 */
async function cycleSignalLines(d: ServiceDeps, current: MentorSession, previous: MentorSession[], documents: ProjectKnowledgeDocument[]): Promise<string[]> {
  const since = previous.map((s) => s.completedAt).filter((x): x is string => !!x).sort().pop();
  let signals;
  try {
    signals = await cycleSignalsForBriefing(d, current.projectId, since ? { since } : {});
  } catch (e) {
    console.warn("[briefing] sin señales del ciclo:", e instanceof Error ? e.message : e);
    return [];
  }
  const ids = [...new Set([...(signals.newComments ?? []).map((c) => c.authorId), ...(signals.assessmentResults ?? []).map((r) => r.clientId)])];
  const people = await Promise.all(ids.map((id) => sysRepo(d).profiles.get(id).catch(() => undefined)));
  const name = (id: string) => people.find((p) => p?.id === id)?.name ?? "El cliente";
  const docTitle = new Map(documents.map((doc) => [doc.id, doc.title || doc.filename]));
  const lines = [
    ...(signals.newComments ?? []).map((c) => {
      const on = c.targetType === "document" ? `el material «${docTitle.get(c.targetId) ?? "publicado"}»` : "una sesión";
      return `Comentario de ${name(c.authorId)} sobre ${on} (${day(c.createdAt) ?? ""}): ${plainText(c.body, 240)}`;
    }),
    ...(signals.assessmentResults ?? []).map((r) => {
      const state = r.status === "reviewed" ? "revisada" : r.status === "submitted" ? "entregada, sin revisar" : "sin entregar";
      return `Evaluación «${plainText(r.title, 120)}» de ${name(r.clientId)}: ${state}${typeof r.score === "number" ? `, puntaje ${r.score}` : ""}`;
    }),
  ];
  return lines.slice(0, MAX_CYCLE_SIGNALS);
}
