import type { ProjectPhase } from "@/types/domain";
import { PHASE_ORDER } from "@/features/labels";
import type { CycleStage } from "@/types/b2b";

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
  /**
   * Las secciones del ciclo de mentoría (Orientar y Decidir) se ven como un solo hilo: sus páginas
   * extra (acuerdo, cierre del ciclo) se abren desde el hilo y no llevan sub-pestañas.
   */
  threaded?: boolean;
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
  {
    id: "orientar",
    label: "Orientar",
    threaded: true,
    pages: [
      { slug: "orientar", label: "Revisión con el mentor" },
      { slug: "acuerdos", label: "Acuerdo y objetivos" },
    ],
  },
  { id: "probar", label: "Probar", pages: [{ slug: "validacion", label: "Hipótesis y experimentos" }] },
  {
    id: "decidir",
    label: "Decidir",
    threaded: true,
    pages: [
      { slug: "decidir", label: "Segunda revisión" },
      { slug: "evaluacion", label: "Cierre del ciclo" },
    ],
  },
  {
    id: "archivo",
    label: "Archivo",
    pages: [
      { slug: "documentos", label: "Documentos" },
      { slug: "historial", label: "Evidencia e historial" },
      { slug: "tareas", label: "Hoja de ruta y tareas" },
    ],
  },
];

export function sectionOfSlug(slug: string): Section {
  return SECTIONS.find((s) => s.pages.some((p) => p.slug === slug)) ?? SECTIONS[0];
}

/* ───────────── Pivot B2B: ciclo explícito (projects.cycle_stage) ───────────── */

/**
 * Proyectos del flujo B2B (con mentor_id y RAX_B2B_FLOW encendida): la etapa no se deriva de las
 * 10 fases, es explícita (`projects.cycle_stage`, la escribe solo lib/services/cycle.ts) y tiene 4
 * pasos: Entrevista (intake) → Sesión 1 (kickoff) → Ciclo (sesiones 2..n) → Cierre. Los proyectos
 * viejos siguen con STAGES.
 */
export interface B2BStage {
  id: CycleStage;
  n: number;
  label: string;
  question: string;
}

export const B2B_STAGES: B2BStage[] = [
  { id: "intake", n: 1, label: "Entrevista", question: "¿Qué necesita saber el mentor antes de la primera sesión?" },
  { id: "kickoff", n: 2, label: "Sesión 1", question: "¿Qué acordamos y hacia dónde vamos?" },
  { id: "cycle", n: 3, label: "Ciclo", question: "¿Cómo avanzamos sesión a sesión?" },
  { id: "closed", n: 4, label: "Cierre", question: "¿Qué logramos y qué sigue?" },
];

/** Si un proyecto usa la línea B2B. La bandera llega del servidor (isB2BFlow()). */
export function usesB2BStages(project: { mentorId?: string | null }, b2bFlow: boolean): boolean {
  return b2bFlow && !!project.mentorId;
}

export function b2bStageOf(stage: CycleStage | undefined): B2BStage {
  return B2B_STAGES.find((s) => s.id === (stage ?? "intake")) ?? B2B_STAGES[0];
}

/** Estado de una etapa B2B respecto de la etapa actual. «closed» cierra también la última. */
export function b2bStageState(stage: B2BStage, current: CycleStage | undefined): StageState {
  const cur = b2bStageOf(current);
  if (cur.id === "closed") return "done";
  return stage.n < cur.n ? "done" : stage.n === cur.n ? "current" : "upcoming";
}

/** Pestañas de un proyecto B2B según el rol (slug vacío = inicio). */
export function b2bProjectTabs(isMentor: boolean): Array<{ slug: string; label: string }> {
  return isMentor
    ? [
        { slug: "", label: "Inicio" },
        { slug: "brief", label: "Brief" },
        { slug: "sesiones", label: "Sesiones" },
      ]
    : [
        { slug: "", label: "Inicio" },
        { slug: "intake", label: "Entrevista" },
        { slug: "sesiones", label: "Sesiones" },
      ];
}
