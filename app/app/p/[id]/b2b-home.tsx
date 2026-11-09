import Link from "next/link";
import type { CycleOverview } from "@/lib/services/cycle";
import { AGREEMENT_FREQUENCY_LABEL, AGREEMENT_STATUS_LABEL, TASK_STATUS_LABEL } from "@/features/labels";
import { b2bStageOf } from "@/features/projects/stages";
import { Card, Tag, formatDate } from "@/shared/ui/primitives";
import { INTAKE_STATUS_COLOR, INTAKE_STATUS_LABEL } from "@/app/app/mentor/b2b-labels";
import { B2BCycleTrack } from "./cycle-track";
import { sessionTitle, sessionWhen } from "./cycle-data";
import { AgendaList, ConfirmAttendanceButton, ScheduleSessionForm } from "./sesiones/session-controls";

const link = "text-xs font-semibold text-blue-600 hover:underline";

/**
 * Inicio de un proyecto B2B (RAX_B2B_FLOW + mentor_id): línea del ciclo, próxima sesión (confirmar,
 * unirse; el mentor la agenda), entrevista, última síntesis, acuerdo y compromisos.
 */
export function B2BProjectHome({ o }: { o: CycleOverview }) {
  const base = `/app/p/${o.projectId}`;
  const isMentor = o.viewer === "mentor";
  const stage = b2bStageOf(o.stage);
  const next = o.nextSession;
  const myIntake = o.intake.find((i) => i.clientId === o.viewerId);

  return (
    <div className="space-y-5">
      <B2BCycleTrack overview={o} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section aria-labelledby="proxima" className="rounded-2xl border border-blue-200/80 bg-blue-50/40 p-6 shadow-xs">
            <p id="proxima" className="eyebrow text-blue-700">
              Próxima sesión · {stage.label}
            </p>
            {!next ? (
              <p className="mt-3 text-sm text-slate-600">
                {o.stage === "closed"
                  ? "El ciclo está cerrado."
                  : o.stage === "intake"
                    ? isMentor
                      ? "La Sesión 1 aparece cuando tu cliente envía la entrevista. También puedes agendarla ya."
                      : "Primero responde la entrevista: con ella tu mentor prepara la Sesión 1."
                    : "No hay sesiones abiertas."}
              </p>
            ) : (
              <>
                <p className="mt-3 text-xl font-bold leading-snug text-slate-900 sm:text-2xl">{sessionTitle(next)}</p>
                <p className="mt-1 text-sm text-slate-600">{sessionWhen(next)}</p>
                {next.agenda.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Temas</p>
                    <AgendaList agenda={next.agenda} />
                  </div>
                )}
                <div className="mt-5 flex flex-wrap items-start gap-4">
                  {next.scheduledAt || next.status === "in_progress" ? (
                    <Link
                      href={`/app/llamada/${next.id}`}
                      className="inline-flex h-10 items-center rounded-full bg-blue-600 px-5 text-xs font-semibold uppercase tracking-[0.08em] text-white shadow-xs hover:bg-blue-700"
                    >
                      {isMentor ? "Abrir la sala" : "Unirme a la llamada"}
                    </Link>
                  ) : null}
                  {!isMentor && next.scheduledAt && next.status === "pending" && (
                    <ConfirmAttendanceButton projectId={o.projectId} sessionId={next.id} confirmed={next.attendance.includes(o.viewerId)} />
                  )}
                  {isMentor && next.status === "pending" && (
                    <ScheduleSessionForm
                      projectId={o.projectId}
                      kind={next.kind === "kickoff" ? "kickoff" : "follow_up"}
                      sessionId={next.kind === "kickoff" ? undefined : next.id}
                      scheduledAt={next.scheduledAt}
                      label={next.scheduledAt ? "Cambiar fecha" : "Agendar"}
                    />
                  )}
                </div>
                {isMentor && next.scheduledAt && (
                  <p className="mt-3 text-xs text-slate-500">
                    {next.attendance.length
                      ? `Confirmaron asistencia: ${next.attendance.map((id) => o.clients.find((c) => c.id === id)?.name ?? "cliente").join(", ")}.`
                      : "Nadie confirmó asistencia todavía."}
                  </p>
                )}
              </>
            )}
            {isMentor && !next && o.stage !== "closed" && (
              <div className="mt-4">
                <ScheduleSessionForm projectId={o.projectId} kind={o.stage === "intake" ? "kickoff" : "follow_up"} label="Agendar sesión" />
              </div>
            )}
            <p className="mt-4">
              <Link href={`${base}/sesiones`} className={link}>
                Ver todas las sesiones →
              </Link>
            </p>
          </section>

          {o.latestSynthesis && (
            <Card className="p-6">
              <p className="eyebrow text-slate-500">
                Resumen de la última sesión{o.latestSynthesis.number ? ` · Sesión ${o.latestSynthesis.number}` : ""}
              </p>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{o.latestSynthesis.summary}</p>
              {o.latestSynthesis.nextSteps && (
                <p className="mt-3 text-sm text-slate-700">
                  <span className="font-semibold">Próximos pasos: </span>
                  {o.latestSynthesis.nextSteps}
                </p>
              )}
            </Card>
          )}

          <Card className="p-6">
            <p className="eyebrow text-slate-500">{isMentor ? "Compromisos abiertos de tus clientes" : "Tus compromisos"}</p>
            {o.commitments.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                {isMentor ? "No hay compromisos abiertos." : "Todavía no tienes compromisos: salen de las sesiones con tu mentor."}
              </p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {o.commitments.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className={t.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}>{t.title}</span>
                    <span className="text-[0.6875rem] text-slate-500">
                      {TASK_STATUS_LABEL[t.status]}
                      {t.dueDate ? ` · vence ${formatDate(t.dueDate)}` : ""}
                      {isMentor && o.mode === "group" ? ` · ${t.assigneeName}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-6">
            <p className="eyebrow text-slate-500">Entrevista</p>
            {isMentor ? (
              <>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {o.intake.length === 0 && <li className="text-slate-500">Todavía no hay personas cliente.</li>}
                  {o.intake.map((i) => (
                    <li key={i.clientId} className="flex items-center justify-between gap-2">
                      <span className="truncate text-slate-800">{i.name}</span>
                      <Tag color={INTAKE_STATUS_COLOR[i.status]}>{INTAKE_STATUS_LABEL[i.status]}</Tag>
                    </li>
                  ))}
                </ul>
                <Link href={`${base}/brief`} className={`${link} mt-3 inline-block`}>
                  Abrir el brief →
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-slate-700">
                  {myIntake?.status === "submitted" || myIntake?.status === "reviewed"
                    ? "Enviaste tu entrevista. Tu mentor la usa para preparar la Sesión 1."
                    : myIntake?.status === "in_progress"
                      ? "Empezaste la entrevista. Termínala cuando puedas."
                      : "Una entrevista corta para que tu mentor llegue preparado a la Sesión 1."}
                </p>
                {myIntake?.status !== "submitted" && myIntake?.status !== "reviewed" && (
                  <Link href={`${base}/intake`} className={`${link} mt-3 inline-block`}>
                    {myIntake?.status === "in_progress" ? "Seguir la entrevista →" : "Responder la entrevista →"}
                  </Link>
                )}
              </>
            )}
          </Card>

          <Card className="p-6">
            <p className="eyebrow text-slate-500">Acuerdo</p>
            {!o.agreement ? (
              <p className="mt-2 text-sm text-slate-500">
                {isMentor ? "Se arma en la Sesión 1, desde la sala." : "Lo acuerdan tú y tu mentor en la Sesión 1."}
              </p>
            ) : (
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                <p>
                  <Tag color={o.agreement.status === "active" ? "#059669" : "#d97706"}>{AGREEMENT_STATUS_LABEL[o.agreement.status]}</Tag>
                </p>
                <p>
                  {AGREEMENT_FREQUENCY_LABEL[o.agreement.frequency]} · {o.agreement.sessionDurationMinutes} min · {o.agreement.expectedDurationWeeks} semanas
                </p>
                {o.agreement.scope && <p className="line-clamp-3">{o.agreement.scope}</p>}
              </div>
            )}
            {o.goals.length > 0 && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Objetivos</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-slate-700">
                  {o.goals.slice(0, 5).map((g) => (
                    <li key={g.id}>{g.title}</li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
