import Link from "next/link";
import { PHASE_ORDER } from "@/features/labels";
import { cx, formatDate } from "@/shared/ui/primitives";
import type { Workspace } from "@/lib/services/projects";

type StepState = "done" | "current" | "upcoming";

export type CycleStepId = "orientar" | "validacion" | "decidir" | "evaluacion";

/**
 * El ciclo de mentoría en una sola línea: primera revisión → probar → segunda revisión → cierre del ciclo.
 * Se ve arriba de cada pantalla del ciclo para que quede claro dónde está el proyecto y qué viene,
 * y cuántas sesiones de seguimiento hubo en el camino.
 */
export function CycleTrack({ w, active }: { w: Workspace; active: CycleStepId }) {
  const at = PHASE_ORDER.indexOf(w.phase);
  const reached = (p: (typeof PHASE_ORDER)[number]) => at >= PHASE_ORDER.indexOf(p);
  const done = (k: string) => w.sessions.some((s) => s.kind === k && s.status === "completed");
  const open = (k: string) => w.sessions.find((s) => s.kind === k && s.status !== "completed");
  const evaluated = w.cycleEvaluations.length;
  const cycleNumber = w.mentorshipRelation?.stage === "closed" ? Math.max(evaluated, 1) : evaluated + 1;
  const followUps = w.sessions.filter((s) => s.kind === "follow_up");

  const firstOpen = open("first_review");
  const secondOpen = open("second_review");
  const firstDone = done("first_review");
  const secondDone = done("second_review");
  const closed = evaluated > 0 && w.phase === "decided";

  const steps: Array<{ id: CycleStepId; label: string; state: StepState; detail: string }> = [
    {
      id: "orientar",
      label: "Primera revisión",
      state: firstDone && reached("hypotheses") ? "done" : reached("mentor_review_1") || firstOpen ? "current" : "upcoming",
      detail: firstDone
        ? reached("hypotheses")
          ? "Hecha"
          : "Hecha · falta priorizar"
        : firstOpen
          ? firstOpen.scheduledAt
            ? `${firstOpen.confirmedAt ? "Confirmada" : "Pedida"} · ${formatDate(firstOpen.scheduledAt)}`
            : "Pedida · sin fecha"
          : reached("mentor_review_1")
            ? "Por pedir"
            : "Al confirmar el resumen",
    },
    {
      id: "validacion",
      label: "Probar",
      state: reached("results_review") ? "done" : reached("hypotheses") ? "current" : "upcoming",
      detail: reached("results_review")
        ? `${w.results.length} resultado${w.results.length === 1 ? "" : "s"}`
        : reached("hypotheses")
          ? `${w.experiments.length} experimento${w.experiments.length === 1 ? "" : "s"}`
          : "Hipótesis y experimentos",
    },
    {
      id: "decidir",
      label: "Segunda revisión",
      state: secondDone && w.phase === "decided" ? "done" : reached("results_review") || secondOpen ? "current" : "upcoming",
      detail: secondDone
        ? "Decisión tomada"
        : secondOpen
          ? secondOpen.scheduledAt
            ? `${secondOpen.confirmedAt ? "Confirmada" : "Pedida"} · ${formatDate(secondOpen.scheduledAt)}`
            : "Pedida · sin fecha"
          : reached("results_review")
            ? "Por pedir"
            : "Con un resultado registrado",
    },
    {
      id: "evaluacion",
      label: "Cierre del ciclo",
      state: closed ? "done" : w.phase === "decided" ? "current" : "upcoming",
      detail: closed ? (w.cycleEvaluations.at(-1)?.decision === "renew" ? "Renovado" : "Evaluado") : w.phase === "decided" ? "Evaluar con el mentor" : "Al final",
    },
  ];

  return (
    <nav aria-label="Ciclo de mentoría" className="@container rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow text-slate-500">Ciclo de mentoría · #{cycleNumber}</p>
        {followUps.length > 0 && (
          <p className="text-xs text-slate-500">
            {followUps.length} seguimiento{followUps.length === 1 ? "" : "s"} en el camino
          </p>
        )}
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-2 @2xl:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.id} className="min-w-0">
            <Link
              href={`/app/p/${w.project.id}/${s.id}`}
              aria-current={s.id === active ? "step" : undefined}
              className={cx(
                "flex h-full flex-col rounded-xl border px-3 py-2.5 transition-colors",
                s.id === active ? "border-blue-600 bg-blue-50/70" : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50",
              )}
            >
              <span className="flex items-center gap-2 text-[0.6875rem] font-semibold">
                <span
                  aria-hidden
                  className={cx(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[0.625rem]",
                    s.state === "done" ? "bg-emerald-600 text-white" : s.state === "current" ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-400",
                  )}
                >
                  {s.state === "done" ? "✓" : i + 1}
                </span>
                <span className={cx("truncate", s.state === "upcoming" ? "text-slate-400" : "text-slate-900")}>{s.label}</span>
                <span className="sr-only">({s.state === "done" ? "hecho" : s.state === "current" ? "en curso" : "por venir"})</span>
              </span>
              <span className="mt-1 truncate pl-7 text-[0.6875rem] text-slate-500">{s.detail}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
