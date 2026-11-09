import Link from "next/link";
import { notFound } from "next/navigation";
import { isB2BFlow } from "@/lib/flags";
import { AGREEMENT_FREQUENCY_LABEL, AGREEMENT_STATUS_LABEL, GOAL_STATUS_LABEL } from "@/features/labels";
import { Card, Empty, Tag, cx } from "@/shared/ui/primitives";
import type { CycleOverview, CycleSessionView } from "@/lib/services/cycle";
import { listAssessments, type AssessmentListItem } from "@/lib/services/assessments";
import { loadWorkspace } from "../data";
import { loadB2B } from "../evaluaciones/data";
import { loadCycleOverview, sessionTitle, sessionWhen } from "../cycle-data";
import { AgendaEditor, AgendaList, ConfirmAttendanceButton, ScheduleSessionForm } from "./session-controls";

export const metadata = { title: "Sesiones · RAX" };

const STATUS_TAG: Record<CycleSessionView["status"], { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "#d97706" },
  in_progress: { label: "En curso", color: "#0284c7" },
  completed: { label: "Realizada", color: "#059669" },
};

/**
 * Sesiones de un proyecto B2B (mentor y cliente): número, tipo, fecha, estado y temas de cada una;
 * el mentor agenda y edita la agenda, el cliente confirma asistencia; acuerdo vigente (solo lectura
 * para el cliente) y síntesis de cada sesión realizada.
 */
export default async function SessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isB2BFlow()) notFound();
  const { w } = await loadWorkspace(id);
  if (!w.project.mentorId) notFound();
  const [o, assessments] = await Promise.all([loadCycleOverview(id), loadB2B((d) => listAssessments(d, id))]);
  const isMentor = o.viewer === "mentor";
  const open = o.sessions.filter((s) => s.status !== "completed");
  const done = o.sessions.filter((s) => s.status === "completed").reverse();

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-6">
        <section aria-labelledby="abiertas" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="abiertas" className="text-xl font-bold text-slate-900">
              Próximas sesiones
            </h2>
          </div>
          {open.length === 0 ? (
            <Empty title="No hay sesiones abiertas">
              {isMentor ? "Agenda la siguiente sesión del ciclo." : "Tu mentor agenda las sesiones; aquí verás la próxima."}
            </Empty>
          ) : (
            open.map((s) => <SessionCard key={s.id} s={s} o={o} assessments={assessments} />)
          )}
          {isMentor && o.stage !== "closed" && o.stage !== "intake" && !open.some((s) => s.kind === "follow_up" && s.status === "pending" && !s.scheduledAt) && (
            <Card className="p-5">
              <p className="mb-2 text-sm font-semibold text-slate-800">Agendar una sesión de seguimiento</p>
              <ScheduleSessionForm projectId={o.projectId} kind="follow_up" label="Agendar sesión" />
            </Card>
          )}
          {isMentor && o.stage === "intake" && !open.some((s) => s.kind === "kickoff") && (
            <Card className="p-5">
              <p className="mb-2 text-sm font-semibold text-slate-800">Agendar la Sesión 1</p>
              <ScheduleSessionForm projectId={o.projectId} kind="kickoff" label="Agendar Sesión 1" />
            </Card>
          )}
        </section>

        <section aria-labelledby="realizadas" className="space-y-3">
          <h2 id="realizadas" className="text-xl font-bold text-slate-900">
            Sesiones realizadas
          </h2>
          {done.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay sesiones realizadas.</p> : done.map((s) => <SessionCard key={s.id} s={s} o={o} assessments={assessments} />)}
        </section>
      </div>

      <aside className="space-y-4">
        <AgreementCard o={o} />
      </aside>
    </div>
  );
}

function SessionCard({ s, o, assessments }: { s: CycleSessionView; o: CycleOverview; assessments: AssessmentListItem[] }) {
  const linked = assessments.filter((a) => a.assessment.sessionId === s.id);
  const isMentor = o.viewer === "mentor";
  const tag = STATUS_TAG[s.status];
  const editable = isMentor && s.status !== "completed";
  return (
    <Card as="article" className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <Tag color={tag.color}>{tag.label}</Tag>
            {s.status === "pending" && s.scheduledAt && (
              <span className="text-[0.6875rem] text-slate-500">
                {s.attendance.length ? `Asistencia confirmada${o.mode === "group" ? ` (${s.attendance.length})` : ""}` : "Sin confirmar asistencia"}
              </span>
            )}
          </p>
          <h3 className="mt-1.5 text-lg font-bold text-slate-900">{sessionTitle(s)}</h3>
          <p className="text-sm text-slate-600">{sessionWhen(s)}</p>
        </div>
        {s.status !== "completed" && (s.scheduledAt || s.status === "in_progress") && (
          <Link
            href={`/app/llamada/${s.id}`}
            className="inline-flex h-9 items-center rounded-full bg-blue-600 px-4 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-white hover:bg-blue-700"
          >
            {isMentor ? "Abrir la sala" : "Unirme"}
          </Link>
        )}
      </div>

      {!isMentor && s.status === "pending" && s.scheduledAt && (
        <ConfirmAttendanceButton projectId={o.projectId} sessionId={s.id} confirmed={s.attendance.includes(o.viewerId)} />
      )}
      {isMentor && s.status === "pending" && (
        <ScheduleSessionForm
          projectId={o.projectId}
          kind={s.kind === "kickoff" ? "kickoff" : "follow_up"}
          sessionId={s.kind === "kickoff" ? undefined : s.id}
          scheduledAt={s.scheduledAt}
          label={s.scheduledAt ? "Cambiar fecha" : "Agendar"}
        />
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Temas</p>
        {editable ? <AgendaEditor key={JSON.stringify(s.agenda)} projectId={o.projectId} sessionId={s.id} agenda={s.agenda} /> : <AgendaList agenda={s.agenda} />}
      </div>

      {(linked.length > 0 || isMentor) && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Evaluaciones</p>
          {linked.length > 0 && (
            <ul className="space-y-1 text-sm">
              {linked.map(({ assessment: a, mine }) => (
                <li key={a.id}>
                  <Link href={`/app/p/${o.projectId}/evaluaciones/${a.id}`} className="font-medium text-blue-700 hover:underline">
                    {a.title}
                  </Link>
                  <span className="ml-2 text-[0.6875rem] text-slate-500">
                    {a.status === "draft" ? "Borrador" : a.status === "closed" ? "Cerrada" : isMentor ? "Abierta" : mine && mine.status !== "draft" ? "Enviada" : "Por responder"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {isMentor && (
            <Link href={`/app/p/${o.projectId}/evaluaciones?sesion=${s.id}`} className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:underline">
              + Crear evaluación para esta sesión
            </Link>
          )}
        </div>
      )}

      {s.synthesis && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm text-slate-700">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Síntesis</p>
          <p className="mt-1.5 whitespace-pre-line">{s.synthesis.summary}</p>
          {s.synthesis.agreedDecisions.length > 0 && (
            <>
              <p className="mt-3 font-semibold">Acuerdos</p>
              <ul className="list-disc pl-4">
                {s.synthesis.agreedDecisions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </>
          )}
          {s.synthesis.commitments.length > 0 && (
            <>
              <p className="mt-3 font-semibold">{isMentor ? "Compromisos del cliente" : "Tus compromisos"}</p>
              <ul className="list-disc pl-4">
                {s.synthesis.commitments.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          )}
          {s.synthesis.nextSteps && (
            <p className="mt-3">
              <span className="font-semibold">Próximos pasos: </span>
              {s.synthesis.nextSteps}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function AgreementCard({ o }: { o: CycleOverview }) {
  const a = o.agreement;
  const isMentor = o.viewer === "mentor";
  return (
    <Card className="space-y-3 p-5">
      <p className="eyebrow text-slate-500">Acuerdo de trabajo</p>
      {!a ? (
        <p className="text-sm text-slate-500">
          {isMentor ? "Todavía no hay acuerdo. Se arma en la sala durante la Sesión 1." : "Todavía no hay un acuerdo confirmado. Lo arman tú y tu mentor en la Sesión 1."}
        </p>
      ) : (
        <div className="space-y-3 text-sm text-slate-700">
          <p className="flex flex-wrap items-center gap-2">
            <Tag color={a.status === "active" ? "#059669" : "#d97706"}>{AGREEMENT_STATUS_LABEL[a.status]}</Tag>
            <span className="text-xs text-slate-500">Versión {a.version}</span>
          </p>
          <p>
            {AGREEMENT_FREQUENCY_LABEL[a.frequency]} · sesiones de {a.sessionDurationMinutes} min · {a.expectedDurationWeeks} semanas
          </p>
          {a.scope && <Block title="Alcance" text={a.scope} />}
          {a.entrepreneurCommitments && <Block title={isMentor ? "Compromisos del cliente" : "Tus compromisos"} text={a.entrepreneurCommitments} />}
          {a.mentorCommitments && <Block title={isMentor ? "Tus compromisos" : "Compromisos de tu mentor"} text={a.mentorCommitments} />}
          {!isMentor && <p className="text-xs text-slate-500">Solo lectura: si algo cambió, coméntalo con tu mentor en la próxima sesión.</p>}
        </div>
      )}
      {o.goals.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Objetivos</p>
          <ul className="mt-1.5 space-y-1.5 text-sm">
            {o.goals.map((g) => (
              <li key={g.id}>
                <span className={cx("font-medium", g.status === "achieved" ? "text-emerald-700" : "text-slate-800")}>{g.title}</span>
                <span className="ml-2 text-[0.6875rem] text-slate-500">{GOAL_STATUS_LABEL[g.status]}</span>
                {g.targetResult && <span className="block text-xs text-slate-500">{g.targetResult}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{title}</p>
      <p className="mt-0.5 whitespace-pre-line">{text}</p>
    </div>
  );
}
