import Link from "next/link";
import { notFound } from "next/navigation";
import { isB2BFlow } from "@/lib/flags";
import { getAssessment, type AssessmentAggregate } from "@/lib/services/assessments";
import type { Assessment, AssessmentAnswer, AssessmentQuestion } from "@/types/b2b";
import { Card, Empty, Notice, Tag, formatDate } from "@/shared/ui/primitives";
import { loadWorkspace } from "../../data";
import { loadCycleOverview, sessionTitle } from "../../cycle-data";
import { ASSESSMENT_STATUS_TAG, loadB2B } from "../data";
import { AnswerForm, AssessmentEditor, AssessmentStatusButton, ReviewForm } from "../assessment-forms";

export const metadata = { title: "Evaluación · RAX" };

/**
 * Una evaluación. La persona cliente la responde (borrador y envío) y, cuando el mentor la revisa, ve
 * su puntaje y comentario. El mentor la edita mientras es borrador, la publica o la cierra, revisa
 * cada entrega y, en un proyecto grupal, ve el promedio y la dispersión por pregunta.
 */
export default async function AssessmentPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = await params;
  if (!isB2BFlow()) notFound();
  const { w } = await loadWorkspace(id);
  if (!w.project.mentorId) notFound();
  const v = await loadB2B((d) => getAssessment(d, aid));
  if (v.assessment.projectId !== id) notFound();
  const a = v.assessment;
  const tag = ASSESSMENT_STATUS_TAG[a.status];
  const isMentor = v.viewer === "mentor";
  const o = isMentor && a.status === "draft" ? await loadCycleOverview(id) : null;

  return (
    <div className="space-y-6">
      <Link href={`/app/p/${id}/evaluaciones`} className="text-sm text-blue-700 hover:underline">
        ← Todas las evaluaciones
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <Tag color={tag.color}>{tag.label}</Tag>
            {a.dueAt && <span className="text-xs text-slate-500">Hasta el {formatDate(a.dueAt)}</span>}
          </p>
          <h2 className="text-2xl font-bold text-slate-900">{a.title}</h2>
          {a.instructions && <p className="whitespace-pre-line text-sm text-slate-600">{a.instructions}</p>}
        </div>
        {isMentor && <AssessmentStatusButton projectId={id} assessmentId={a.id} status={a.status} />}
      </header>

      {isMentor ? (
        a.status === "draft" ? (
          <Card className="space-y-3 p-5">
            <p className="text-sm text-slate-600">Es un borrador: tu cliente no lo ve hasta que lo publiques.</p>
            <AssessmentEditor projectId={id} assessment={a} sessions={(o?.sessions ?? []).map((s) => ({ id: s.id, label: sessionTitle(s) }))} />
          </Card>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section aria-labelledby="entregas" className="space-y-3">
              <h3 id="entregas" className="text-lg font-bold text-slate-900">
                Entregas
              </h3>
              {(v.submissions ?? []).length === 0 ? (
                <Empty title="Todavía no hay entregas">Te avisamos cuando alguien responda.</Empty>
              ) : (
                v.submissions!.map((s) => (
                  <Card as="article" key={s.id} className="space-y-4 p-5">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{s.clientName}</span>
                      <Tag color={s.status === "reviewed" ? "#059669" : "#d97706"}>{s.status === "reviewed" ? "Revisada" : "Por revisar"}</Tag>
                      {s.submittedAt && <span className="text-xs text-slate-500">Enviada el {formatDate(s.submittedAt)}</span>}
                    </p>
                    <Answers questions={a.questions} answers={s.answers} />
                    <ReviewForm projectId={id} submission={s} />
                  </Card>
                ))
              )}
              {(v.pending ?? []).length > 0 && (
                <p className="text-sm text-slate-500">
                  Falta{v.pending!.length === 1 ? "" : "n"}: {v.pending!.map((p) => p.name).join(", ")}.
                </p>
              )}
            </section>
            {v.aggregate && (
              <aside>
                <GroupAggregate aggregate={v.aggregate} />
              </aside>
            )}
          </div>
        )
      ) : (
        <ClientSide projectId={id} assessment={a} submission={v.mySubmission} />
      )}
    </div>
  );
}

function ClientSide({ projectId, assessment, submission }: { projectId: string; assessment: Assessment; submission?: { status: string; answers: AssessmentAnswer[]; score?: number; mentorFeedback?: string; submittedAt?: string } }) {
  if (!submission || submission.status === "draft") {
    if (assessment.status !== "published") return <Notice tone="info">Esta evaluación ya se cerró y no la respondiste.</Notice>;
    return (
      <Card className="p-5">
        <AnswerForm projectId={projectId} assessment={assessment} initial={submission?.answers ?? []} />
      </Card>
    );
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card className="space-y-3 p-5">
        <p className="text-sm text-slate-500">Tus respuestas{submission.submittedAt ? ` · enviadas el ${formatDate(submission.submittedAt)}` : ""}</p>
        <Answers questions={assessment.questions} answers={submission.answers} />
      </Card>
      <Card className="space-y-2 p-5">
        <p className="eyebrow text-slate-500">Revisión de tu mentor</p>
        {submission.status === "reviewed" ? (
          <>
            {submission.score !== undefined && <p className="text-2xl font-bold text-slate-900">{submission.score} pts</p>}
            {submission.mentorFeedback && <p className="whitespace-pre-line text-sm text-slate-700">{submission.mentorFeedback}</p>}
          </>
        ) : (
          <p className="text-sm text-slate-500">Tu mentor todavía no la revisa. Te avisamos cuando lo haga.</p>
        )}
      </Card>
    </div>
  );
}

function answerText(q: AssessmentQuestion, v: AssessmentAnswer["value"] | undefined): string {
  if (v === undefined) return "Sin respuesta";
  if (Array.isArray(v)) return v.join(", ") || "Sin respuesta";
  if (q.kind === "scale") return `${v} de 5`;
  return String(v);
}

function Answers({ questions, answers }: { questions: AssessmentQuestion[]; answers: AssessmentAnswer[] }) {
  return (
    <ol className="space-y-3">
      {questions.map((q, i) => (
        <li key={q.id} className="text-sm">
          <p className="font-semibold text-slate-800">
            {i + 1}. {q.prompt}
          </p>
          <p className="mt-0.5 whitespace-pre-line text-slate-700">{answerText(q, answers.find((a) => a.questionId === q.id)?.value)}</p>
        </li>
      ))}
    </ol>
  );
}

/** Vista agregada del grupo: puntaje promedio y dispersión, y por pregunta (escala y opciones). */
function GroupAggregate({ aggregate }: { aggregate: AssessmentAggregate }) {
  return (
    <Card className="space-y-4 p-5">
      <p className="eyebrow text-slate-500">Resultados del grupo</p>
      <p className="text-sm text-slate-700">
        {aggregate.submissions} de {aggregate.clients} personas respondieron.
      </p>
      {aggregate.score && (
        <p className="text-sm text-slate-700">
          Puntaje promedio <span className="font-semibold">{aggregate.score.average}</span> · dispersión ±{aggregate.score.spread} · rango {aggregate.score.min}–{aggregate.score.max} ({aggregate.score.count} revisadas)
        </p>
      )}
      <ol className="space-y-3">
        {aggregate.questions.map((q, i) => (
          <li key={q.questionId} className="text-sm">
            <p className="font-semibold text-slate-800">
              {i + 1}. {q.prompt}
            </p>
            {q.kind === "scale" && q.average !== undefined && (
              <p className="text-slate-600">
                Promedio {q.average} · dispersión ±{q.spread} · rango {q.min}–{q.max}
              </p>
            )}
            {q.options && (
              <ul className="mt-1 space-y-1">
                {q.options.map((o) => (
                  <li key={o.option} className="flex items-center gap-2">
                    <span className="h-1.5 rounded-full bg-blue-600" style={{ width: `${aggregate.submissions ? Math.max(4, (o.count / aggregate.submissions) * 120) : 4}px` }} aria-hidden />
                    <span className="text-slate-700">
                      {o.option} · {o.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {q.kind === "open" && <p className="text-slate-600">{q.answered} respuesta(s) abiertas: revísalas en cada entrega.</p>}
          </li>
        ))}
      </ol>
    </Card>
  );
}
