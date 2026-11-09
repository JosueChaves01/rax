import Link from "next/link";
import { PHASE_ORDER } from "@/features/labels";
import { cx, formatDate } from "@/shared/ui/primitives";
import type { Workspace } from "@/lib/services/projects";
import type { CycleOverview } from "@/lib/services/cycle";
import { B2B_STAGES, b2bStageState } from "@/features/projects/stages";

/* ───────────── Flujo B2B: Entrevista → Sesión 1 → Ciclo → Cierre ───────────── */

/** Detalle de cada etapa B2B con lo que realmente pasó (entrevistas, Sesión 1, sesiones del ciclo). */
export function b2bTrackDetails(o: CycleOverview): Record<(typeof B2B_STAGES)[number]["id"], string> {
  const sent = o.intake.filter((i) => i.status === "submitted" || i.status === "reviewed").length;
  const kickoff = o.sessions.find((s) => s.kind === "kickoff");
  const followUps = o.sessions.filter((s) => s.kind === "follow_up");
  const done = followUps.filter((s) => s.status === "completed").length;
  return {
    intake: o.intake.length === 0 ? "Esperando a la persona cliente" : o.intake.length === 1 ? (sent ? "Entrevista enviada" : "Entrevista pendiente") : `${sent} de ${o.intake.length} entrevistas`,
    kickoff: !kickoff
      ? "Por agendar"
      : kickoff.status === "completed"
        ? "Hecha"
        : kickoff.status === "in_progress"
          ? "En curso"
          : kickoff.scheduledAt
            ? formatDate(kickoff.scheduledAt)
            : "Por agendar",
    cycle: followUps.length ? `${done} sesión${done === 1 ? "" : "es"} hecha${done === 1 ? "" : "s"}` : "Después de la Sesión 1",
    closed: o.stage === "closed" ? "Ciclo cerrado" : "Al final",
  };
}

/** Línea del ciclo B2B para el inicio del proyecto (la cabecera muestra solo la barra). */
export function B2BCycleTrack({ overview }: { overview: CycleOverview }) {
  const details = b2bTrackDetails(overview);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Avance del ciclo">
      {B2B_STAGES.map((s) => {
        const state = b2bStageState(s, overview.stage);
        return (
          <li
            key={s.id}
            aria-current={state === "current" ? "step" : undefined}
            className={cx("min-w-0 rounded-xl border px-3 py-2.5 shadow-2xs", state === "current" ? "border-blue-600 bg-blue-50/60" : "border-slate-200/80 bg-white")}
          >
            <p className="font-mono text-[0.625rem] text-slate-400">
              {s.n} · {state === "done" ? "hecha" : state === "current" ? "en curso" : "por venir"}
            </p>
            <p className={cx("mt-0.5 truncate text-base font-bold", state === "current" ? "text-slate-900" : "text-slate-500")}>{s.label}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{details[s.id]}</p>
          </li>
        );
      })}
    </ol>
  );
}

export type StepState = "done" | "current" | "upcoming";

export type CycleStepId = "orientar" | "validacion" | "decidir" | "evaluacion";

/** Estado de cada paso del ciclo de mentoría: primera revisión → probar → segunda revisión → cierre. */
export function cycleSteps(w: Workspace) {
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

  return { steps, cycleNumber, followUps: followUps.length };
}

export type CycleStep = ReturnType<typeof cycleSteps>["steps"][number];

/**
 * En las páginas que se abren desde el hilo del ciclo (acuerdo, cierre del ciclo): de dónde se vino y
 * en qué ciclo se está, en una línea.
 */
export function BackToCycle({ w, to }: { w: Workspace; to: "orientar" | "decidir" }) {
  const { cycleNumber } = cycleSteps(w);
  return (
    <Link
      href={`/app/p/${w.project.id}/${to}`}
      className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
    >
      ← Volver al ciclo de mentoría #{cycleNumber}
    </Link>
  );
}
