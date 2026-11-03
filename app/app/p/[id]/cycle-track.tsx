import Link from "next/link";
import { PHASE_ORDER } from "@/features/labels";
import { formatDate } from "@/shared/ui/primitives";
import type { Workspace } from "@/lib/services/projects";

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
