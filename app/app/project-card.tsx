import Link from "next/link";
import { NATURE_LABEL, PHASE_LABEL } from "@/features/labels";
import { pendingReview } from "@/features/diagnosis/rules";
import { STAGES, stageState } from "@/features/projects/stages";
import type { Workspace } from "@/lib/services/projects";
import { nextAction } from "@/lib/services/next-action";
import { cx } from "@/shared/ui/primitives";

const TURN_LABEL = {
  entrepreneur: { mine: "Te toca", other: "Le toca al emprendedor" },
  mentor: { mine: "Te toca", other: "Le toca al mentor" },
  admin: { mine: "Esperando administración", other: "Esperando administración" },
  none: { mine: "Ciclo cerrado", other: "Ciclo cerrado" },
} as const;

/**
 * Tarjeta de un proyecto en el inicio: las 4 etapas reales (derivadas de la fase), a quién le toca
 * y el siguiente paso con su enlace. Es la misma lectura que el inicio del proyecto y el agente.
 */
export function ProjectCard({ w }: { w: Workspace }) {
  const next = nextAction(w);
  const viewer = w.isMentorView ? "mentor" : "entrepreneur";
  const mine = next.turn === viewer;
  const turnText = TURN_LABEL[next.turn][mine ? "mine" : "other"];
  const mentorName = w.mentors.map((m) => w.people[m]?.name).find(Boolean);
  const ownerName = w.people[w.project.ownerId]?.name;
  const pending = pendingReview(w.items).length;
  const tasksOpen = w.tasks.filter((t) => t.status !== "done").length;
  const hypotheses = w.hypotheses.filter((h) => h.status !== "discarded" && h.status !== "reformulated").length;

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/app/p/${w.project.id}`} className="text-lg font-bold text-slate-900 hover:text-blue-600">
            {w.project.name}
          </Link>
          <p className="mt-0.5 text-xs text-slate-500">
            {NATURE_LABEL[w.project.nature]}
            {" · "}
            {w.isMentorView ? (ownerName ? `De ${ownerName}` : "Proyecto asignado") : mentorName ? `Mentor: ${mentorName}` : "Sin mentor asignado todavía"}
          </p>
        </div>
        <span
          className={cx(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
            mine ? "bg-blue-600 text-white" : next.turn === "none" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600",
          )}
        >
          {turnText}
        </span>
      </div>

      <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Etapas del proyecto">
        {STAGES.map((s) => {
          const state = stageState(s, w.phase);
          return (
            <li key={s.id} aria-current={state === "current" ? "step" : undefined}>
              <span
                aria-hidden
                className={cx("block h-1.5 rounded-full", state === "done" ? "bg-emerald-500" : state === "current" ? "bg-blue-600" : "bg-slate-200")}
              />
              <span className={cx("mt-1.5 block truncate text-[11px] font-semibold", state === "upcoming" ? "text-slate-400" : "text-slate-700")}>
                {s.n} · {s.label}
              </span>
              <span className="sr-only">{state === "done" ? "(hecha)" : state === "current" ? "(actual)" : "(próxima)"}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-slate-500">Fase: {PHASE_LABEL[w.phase]}</p>

      <div className={cx("mt-4 rounded-xl border p-4", mine ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-slate-50/60")}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">Siguiente paso</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-800">{next.text}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/app/p/${w.project.id}/${next.tab}`}
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            {mine ? "Hacerlo ahora →" : "Ver el proyecto →"}
          </Link>
          <Link
            href={`/app/chat?project=${w.project.id}`}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-300"
          >
            Hacerlo con el asistente
          </Link>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-slate-500">Por confirmar</dt>
          <dd className="font-mono font-semibold text-slate-900">{pending}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Hipótesis</dt>
          <dd className="font-mono font-semibold text-slate-900">{hypotheses}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Tareas abiertas</dt>
          <dd className="font-mono font-semibold text-slate-900">{tasksOpen}</dd>
        </div>
      </dl>
    </article>
  );
}
