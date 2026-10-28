import type { ProjectPhase } from "@/types/domain";
import { PHASE_ORDER } from "@/features/labels";

/**
 * Las 10 fases derivadas se agrupan en 4 etapas, que son las que ve la persona en la navegación
 * y coinciden con el recorrido de la landing. La fase sigue siendo la fuente de verdad.
 */
export type StageId = "entender" | "orientar" | "probar" | "decidir";

export interface Stage {
  id: StageId;
  n: number;
  label: string;
  question: string;
  phases: ProjectPhase[];
}

export const STAGES: Stage[] = [
  { id: "entender", n: 1, label: "Entender", question: "¿Qué sé, qué supongo y qué me falta?", phases: ["new", "conversation", "summary_pending"] },
  { id: "orientar", n: 2, label: "Orientar", question: "¿Qué investigamos primero?", phases: ["mentor_review_1", "prioritizing"] },
  { id: "probar", n: 3, label: "Probar", question: "¿Cómo lo comprobamos en pequeño?", phases: ["hypotheses", "experiments_preparing", "experiments_running"] },
  { id: "decidir", n: 4, label: "Decidir", question: "¿Qué hacemos con lo que pasó?", phases: ["results_review", "decided"] },
];

export function stageOf(phase: ProjectPhase): Stage {
  return STAGES.find((s) => s.phases.includes(phase))!;
}

export type StageState = "done" | "current" | "upcoming";

/** Estado de una etapa respecto de la fase actual. "decided" cierra también la última etapa. */
export function stageState(stage: Stage, phase: ProjectPhase): StageState {
  if (phase === "decided") return "done";
  const cur = stageOf(phase);
  return stage.n < cur.n ? "done" : stage.n === cur.n ? "current" : "upcoming";
}

/** Cuántas fases de la etapa ya se cumplieron (para los indicadores de avance). */
export function phasesDone(stage: Stage, phase: ProjectPhase): number {
  const idx = PHASE_ORDER.indexOf(phase);
  return stage.phases.filter((p) => PHASE_ORDER.indexOf(p) < idx || phase === "decided").length;
}

export type Turn = "entrepreneur" | "mentor" | "admin" | "none";

export interface TurnInput {
  phase: ProjectPhase;
  hasMentor: boolean;
  firstReviewRequested: boolean;
  secondReviewRequested: boolean;
  hypothesesAwaitingApproval: number;
}

/**
 * A quién le toca mover el proyecto ahora. Sirve para que nadie quede esperando sin saberlo,
 * por ejemplo un proyecto frenado porque todavía no tiene mentor.
 */
export function turnOf(x: TurnInput): Turn {
  switch (x.phase) {
    case "mentor_review_1":
      if (!x.hasMentor) return "admin";
      return x.firstReviewRequested ? "mentor" : "entrepreneur";
    case "hypotheses":
      if (x.hypothesesAwaitingApproval > 0) return x.hasMentor ? "mentor" : "admin";
      return "entrepreneur";
    case "results_review":
      if (!x.secondReviewRequested) return "entrepreneur";
      return x.hasMentor ? "mentor" : "admin";
    case "decided":
      return "none";
    default:
      return "entrepreneur";
  }
}

/** Secciones del proyecto: Inicio, las 4 etapas y Archivo. Cada una agrupa una o más páginas. */
export interface Section {
  id: "inicio" | StageId | "archivo";
  label: string;
  pages: Array<{ slug: string; label: string }>;
}

export const SECTIONS: Section[] = [
  { id: "inicio", label: "Inicio", pages: [{ slug: "", label: "Inicio" }] },
  {
    id: "entender",
    label: "Entender",
    pages: [
      { slug: "conversacion", label: "Conversación" },
      { slug: "diagnostico", label: "Diagnóstico" },
    ],
  },
  { id: "orientar", label: "Orientar", pages: [{ slug: "orientar", label: "Revisión y prioridad" }] },
  { id: "probar", label: "Probar", pages: [{ slug: "validacion", label: "Hipótesis y experimentos" }] },
  { id: "decidir", label: "Decidir", pages: [{ slug: "decidir", label: "Segunda revisión" }] },
  {
    id: "archivo",
    label: "Archivo",
    pages: [
      { slug: "historial", label: "Evidencia e historial" },
      { slug: "tareas", label: "Todas las tareas" },
    ],
  },
];

export function sectionOfSlug(slug: string): Section {
  return SECTIONS.find((s) => s.pages.some((p) => p.slug === slug)) ?? SECTIONS[0];
}
