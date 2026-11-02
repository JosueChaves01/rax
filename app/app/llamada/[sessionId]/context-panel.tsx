import type { ReactNode } from "react";
import type { MentorSession, ProjectKnowledgeDocument, SessionNoteReply, Task } from "@/types/domain";
import type { Workspace } from "@/lib/services/projects";
import {
  DIAGNOSIS_STATUS_LABEL,
  EXPERIMENT_STATUS_LABEL,
  GOAL_PRIORITY_LABEL,
  HYPOTHESIS_STATUS_LABEL,
  NATURE_LABEL,
  NOTE_KIND_LABEL,
  PHASE_LABEL,
  SESSION_KIND_LABEL,
  TASK_STATUS_LABEL,
} from "@/features/labels";
import { isCurrent, openQuestions, pendingReview } from "@/features/diagnosis/rules";
import { STAGES, stageOf } from "@/features/projects/stages";
import { nextAction } from "@/lib/services/next-action";
import { Meter, Tag, cx, formatDate } from "@/shared/ui/primitives";

/** Una sección del contexto: se abre como ventana desde la barra inferior de la llamada. */
export interface ContextSection {
  id: string;
  title: string;
  /** Nombre corto para la barra inferior. */
  short: string;
  count?: number;
  node: ReactNode;
}

const Body = ({ children }: { children: ReactNode }) => <div className="space-y-3 text-xs leading-relaxed text-slate-700">{children}</div>;

function Label({ children }: { children: ReactNode }) {
  return <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-500">{children}</p>;
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-4 marker:text-slate-300">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-slate-400">{children}</p>;

const TASK_ORDER: Record<Task["status"], number> = { blocked: 0, doing: 1, todo: 2, done: 3 };
const TASK_COLOR: Record<Task["status"], string> = {
  blocked: "var(--color-danger)",
  doing: "var(--color-accent)",
  todo: "var(--color-muted)",
  done: "var(--color-ok)",
};
const DOC_SOURCE: Record<ProjectKnowledgeDocument["source"], string> = { upload: "Subido", chat_extracted: "Del chat", note: "Nota o transcripción" };

/**
 * Todo el contexto vigente del proyecto, en secciones, ordenado para conversar: dónde está, qué se va a tratar,
 * qué se sabe, qué se está probando, qué se acordó, qué está pendiente y qué se ha escrito.
 */
export function buildContextSections({
  w,
  session,
  documents,
  replies,
}: {
  w: Workspace;
  session: MentorSession;
  documents: ProjectKnowledgeDocument[];
  replies: SessionNoteReply[];
}): ContextSection[] {
  const name = (id: string) => (id === "ai" ? "Agente" : (w.people[id]?.name ?? "Equipo del proyecto"));
  const stage = stageOf(w.phase);
  const next = nextAction(w);

  const current = w.items.filter(isCurrent);
  const problems = current.filter((i) => i.category === "problem");
  const prioritized = problems.filter((i) => i.priority).sort((a, b) => a.priority!.rank - b.priority!.rank);
  const otherProblems = problems.filter((i) => !i.priority);
  const questions = openQuestions(w.items);
  const toConfirm = pendingReview(w.items).length;

  const hypotheses = w.hypotheses.filter((h) => !h.supersededBy && h.status !== "discarded" && h.status !== "reformulated");
  const experimentsOf = (hId: string) => w.experiments.filter((e) => e.hypothesisId === hId);

  const agreement =
    [...w.mentorshipAgreements].reverse().find((a) => a.status === "active") ??
    [...w.mentorshipAgreements].reverse().find((a) => a.status !== "superseded");
  const goals = w.mentorshipGoals.filter((g) => g.status === "active");

  const previous = w.sessions
    .filter((s) => s.id !== session.id && s.status === "completed" && s.postSessionSynthesis)
    .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))[0];
  const prevSyn = previous?.postSessionSynthesis;
  const thisSyn = session.postSessionSynthesis;
  const decisions = [...(thisSyn?.agreedDecisions ?? []), ...(prevSyn?.agreedDecisions ?? [])];
  const mentorCommitments = [...(thisSyn?.mentorCommitments ?? []), ...(prevSyn?.mentorCommitments ?? [])];
  const pendingEntrepreneurCommitments =
    thisSyn && !thisSyn.commitmentsAdoptedAt ? thisSyn.entrepreneurCommitments : [];

  const tasks = w.tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => TASK_ORDER[a.status] - TASK_ORDER[b.status] || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
  const today = new Date().toISOString().slice(0, 10);

  const notes = w.notes.filter((n) => n.sessionId === session.id);
  const repliesOf = (noteId: string) => replies.filter((r) => r.noteId === noteId);

  const pre = session.preSessionBriefing;
  const det = session.briefing;


  const sections: ContextSection[] = [];

  sections.push({
    id: "proyecto",
    title: "Dónde está el proyecto",
    short: "Proyecto",
    node: (
      <Body>
        <div className="flex flex-wrap items-center gap-2">
          <Tag color="var(--color-cyan)">{SESSION_KIND_LABEL[session.kind]}</Tag>
          <span className="text-[0.6875rem] text-slate-500">{NATURE_LABEL[w.project.nature]}</span>
        </div>
        <div>
          <Meter value={stage.n} total={STAGES.length} label={`Etapa · ${stage.label}`} />
          <p className="mt-2 text-sm font-semibold text-slate-800">{PHASE_LABEL[w.phase]}</p>
        </div>
        <dl className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
          <div>
            <dt className="text-slate-500">Diagnóstico</dt>
            <dd className="mt-0.5 font-semibold text-slate-900">{DIAGNOSIS_STATUS_LABEL[w.diagnosis.status]}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Por confirmar</dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-900">{toConfirm}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Tareas abiertas</dt>
            <dd className="mt-0.5 font-mono font-semibold text-slate-900">{tasks.length}</dd>
          </div>
        </dl>
        <div className="rounded-xl border border-blue-200/80 bg-blue-50/50 px-3 py-2">
          <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-blue-700">Siguiente paso del proyecto</p>
          <p className="mt-1 text-slate-800">{next.text}</p>
        </div>
      </Body>
    ),
  });

  sections.push({
    id: "sesion",
    title: "Para esta sesión",
    short: "Agenda",
    count: pre?.suggestedAgenda.length || undefined,
    node: (
      <Body>
        {pre ? (
          <>
            {pre.suggestedAgenda.length > 0 && (
              <div className="space-y-1">
                <Label>Agenda sugerida</Label>
                <ol className="list-decimal space-y-1 pl-4 marker:text-slate-400">
                  {pre.suggestedAgenda.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              </div>
            )}
            {pre.suggestedQuestions.length > 0 && (
              <div className="space-y-1">
                <Label>Preguntas para conversar</Label>
                <Bullets items={pre.suggestedQuestions} />
              </div>
            )}
            {pre.pendingTopicsSummary && (
              <div className="space-y-1">
                <Label>Temas pendientes</Label>
                <p className="whitespace-pre-wrap">{pre.pendingTopicsSummary}</p>
              </div>
            )}
            {pre.recentProgressSummary && (
              <div className="space-y-1">
                <Label>Avance reciente</Label>
                <p className="whitespace-pre-wrap">{pre.recentProgressSummary}</p>
              </div>
            )}
          </>
        ) : det ? (
          <>
            {det.mainProblem && (
              <div className="space-y-1">
                <Label>Problema principal</Label>
                <p>{det.mainProblem}</p>
              </div>
            )}
            {det.openAssumptions.length > 0 && (
              <div className="space-y-1">
                <Label>Supuestos abiertos</Label>
                <Bullets items={det.openAssumptions} />
              </div>
            )}
            {det.questionsForMentor.length > 0 && (
              <div className="space-y-1">
                <Label>Preguntas para el mentor</Label>
                <Bullets items={det.questionsForMentor} />
              </div>
            )}
          </>
        ) : (
          <Empty>Esta sesión todavía no tiene briefing.</Empty>
        )}
      </Body>
    ),
  });

  sections.push({
    id: "diagnostico",
    title: "Diagnóstico",
    short: "Diagnóstico",
    count: prioritized.length || undefined,
    node: (
      <Body>
        {w.diagnosis.summary && (
          <div className="space-y-1">
            <Label>Resumen{w.diagnosis.summaryConfirmedAt ? " (confirmado)" : " (sin confirmar)"}</Label>
            <p className="whitespace-pre-wrap">{w.diagnosis.summary}</p>
          </div>
        )}
        <div className="space-y-1">
          <Label>Problemas priorizados</Label>
          {prioritized.length ? (
            <ol className="space-y-1.5">
              {prioritized.map((p) => (
                <li key={p.id} className="flex gap-2">
                  <span className="font-mono font-bold text-blue-700">#{p.priority!.rank}</span>
                  <span>
                    <span className="font-semibold text-slate-900">{p.title}</span>
                    {p.priority!.rationale && <span className="block text-slate-500">{p.priority!.rationale}</span>}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Todavía no hay problemas priorizados.</Empty>
          )}
        </div>
        {otherProblems.length > 0 && (
          <div className="space-y-1">
            <Label>Otros problemas detectados</Label>
            <Bullets items={otherProblems.map((p) => p.title)} />
          </div>
        )}
        {questions.length > 0 && (
          <div className="space-y-1">
            <Label>Preguntas abiertas ({questions.length})</Label>
            <Bullets items={questions.slice(0, 8).map((q) => q.title)} />
          </div>
        )}
      </Body>
    ),
  });

  sections.push({
    id: "hipotesis",
    title: "Hipótesis y experimentos",
    short: "Hipótesis",
    count: hypotheses.length || undefined,
    node: (
      <Body>
        {hypotheses.length ? (
          <ul className="space-y-2.5">
            {hypotheses.map((h) => (
              <li key={h.id} className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{h.statement}</p>
                  <span className="shrink-0 text-[0.6875rem] text-slate-500">{HYPOTHESIS_STATUS_LABEL[h.status]}</span>
                </div>
                {experimentsOf(h.id).map((e) => (
                  <p key={e.id} className="text-slate-500">
                    🧪 {e.question} · <span className="font-medium text-slate-700">{EXPERIMENT_STATUS_LABEL[e.status]}</span>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Aún no hay hipótesis.</Empty>
        )}
      </Body>
    ),
  });

  const agreementsCount = decisions.length + goals.length + (agreement ? 1 : 0);
  sections.push({
    id: "acuerdos",
    title: "Acuerdos",
    short: "Acuerdos",
    count: agreementsCount || undefined,
    node: (
      <Body>
        {decisions.length > 0 && (
          <div className="space-y-1">
            <Label>Decisiones acordadas</Label>
            <Bullets items={decisions} />
          </div>
        )}
        {goals.length > 0 && (
          <div className="space-y-1">
            <Label>Metas de la mentoría</Label>
            <ul className="space-y-1.5">
              {goals.map((g) => (
                <li key={g.id}>
                  <span className="font-semibold text-slate-900">{g.title}</span>{" "}
                  <span className="text-slate-400">· prioridad {GOAL_PRIORITY_LABEL[g.priority].toLowerCase()}</span>
                  {g.targetResult && <span className="block text-slate-500">Meta: {g.targetResult}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {agreement && (
          <div className="space-y-1">
            <Label>Acuerdo de mentoría</Label>
            {agreement.scope && <p>{agreement.scope}</p>}
            {agreement.entrepreneurCommitments && (
              <p>
                <span className="font-semibold">Emprendedor:</span> {agreement.entrepreneurCommitments}
              </p>
            )}
            {agreement.mentorCommitments && (
              <p>
                <span className="font-semibold">Mentor:</span> {agreement.mentorCommitments}
              </p>
            )}
          </div>
        )}
        {!agreementsCount && <Empty>Todavía no hay acuerdos registrados.</Empty>}
      </Body>
    ),
  });

  sections.push({
    id: "tareas",
    title: "Compromisos y tareas",
    short: "Tareas",
    count: tasks.length + mentorCommitments.length + pendingEntrepreneurCommitments.length || undefined,
    node: (
      <Body>
        {tasks.length > 0 ? (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-semibold text-slate-900">{t.title}</span>
                  <span className="block text-slate-500">
                    {name(t.assigneeId)}
                    {t.dueDate && (
                      <span className={cx(t.dueDate.slice(0, 10) < today && "font-semibold text-rose-600")}> · vence {t.dueDate.slice(0, 10)}</span>
                    )}
                    {t.status === "blocked" && t.blockedReason ? ` · ${t.blockedReason}` : ""}
                  </span>
                </span>
                <Tag color={TASK_COLOR[t.status]}>{TASK_STATUS_LABEL[t.status]}</Tag>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No hay tareas abiertas.</Empty>
        )}
        {pendingEntrepreneurCommitments.length > 0 && (
          <div className="space-y-1">
            <Label>Compromisos de esta sesión (aún no son tareas)</Label>
            <Bullets items={pendingEntrepreneurCommitments.map((c) => c.title)} />
          </div>
        )}
        {mentorCommitments.length > 0 && (
          <div className="space-y-1">
            <Label>Compromisos del mentor</Label>
            <Bullets items={mentorCommitments.map((c) => (c.dueDate ? `${c.title} (para ${c.dueDate})` : c.title))} />
          </div>
        )}
      </Body>
    ),
  });

  const syn = thisSyn ?? prevSyn;
  sections.push({
    id: "sintesis",
    title: thisSyn ? "Síntesis de esta sesión" : "Última sesión",
    short: thisSyn ? "Síntesis" : "Última sesión",
    node: (
      <Body>
        {syn ? (
          <>
            {!thisSyn && previous && (
              <p className="text-slate-500">
                {SESSION_KIND_LABEL[previous.kind]} · {formatDate(previous.completedAt ?? previous.createdAt)}
              </p>
            )}
            <p className="whitespace-pre-wrap">{syn.summary}</p>
            {syn.nextSteps && (
              <p>
                <span className="font-semibold">Próximos pasos:</span> {syn.nextSteps}
              </p>
            )}
          </>
        ) : (
          <Empty>Todavía no hay una sesión anterior con síntesis.</Empty>
        )}
      </Body>
    ),
  });

  sections.push({
    id: "notas",
    title: "Notas de la sesión",
    short: "Notas",
    count: notes.length || undefined,
    node: (
      <Body>
        {notes.length ? (
          <ul className="space-y-2.5">
            {notes.map((n) => (
              <li key={n.id} className="space-y-1">
                <p className="text-[0.6875rem] text-slate-500">
                  <span className="font-semibold text-slate-700">{NOTE_KIND_LABEL[n.kind]}</span> · {name(n.authorId)} · {formatDate(n.createdAt)}
                  {n.isPrivate && " · privada"}
                </p>
                <p className="whitespace-pre-wrap">{n.body}</p>
                {repliesOf(n.id).map((r) => (
                  <p key={r.id} className="ml-3 border-l-2 border-slate-200 pl-2 text-slate-600">
                    <span className="font-semibold">{name(r.authorId)}:</span> {r.body}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Aún no hay notas en esta sesión.</Empty>
        )}
      </Body>
    ),
  });

  sections.push({
    id: "documentos",
    title: "Documentos del proyecto",
    short: "Documentos",
    count: documents.length || undefined,
    node: (
      <Body>
        {documents.length ? (
          <ul className="space-y-1.5">
            {documents.slice(0, 20).map((doc) => (
              <li key={doc.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{doc.title || doc.filename}</span>
                  <span className="text-slate-400">
                    {DOC_SOURCE[doc.source]} · {formatDate(doc.updatedAt)}
                  </span>
                </span>
                <a
                  href={`/api/documentos?proyecto=${w.project.id}&documento=${doc.id}&formato=pdf`}
                  className="shrink-0 font-semibold text-blue-600 hover:underline"
                >
                  PDF
                </a>
              </li>
            ))}
            {documents.length > 20 && <li className="text-slate-400">y {documents.length - 20} más en el proyecto.</li>}
          </ul>
        ) : (
          <Empty>El proyecto no tiene documentos todavía.</Empty>
        )}
      </Body>
    ),
  });

  return sections;
}
