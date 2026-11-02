import { NEXT_STEP } from "@/features/projects/next-step";
import { turnOf, type Turn } from "@/features/projects/stages";
import type { Workspace } from "@/lib/services/projects";

/**
 * Lo que sigue para quien mira el proyecto. Si la pelota la tiene otra persona,
 * el texto dice a quién se espera y qué se puede hacer mientras.
 */
export function nextAction(w: Workspace): { text: string; tab: string; turn: Turn } {
  const viewer = w.isMentorView ? "mentor" : "entrepreneur";
  const openReview = (k: string) => w.sessions.some((s) => s.kind === k && s.status !== "completed");
  const turn = turnOf({
    phase: w.phase,
    hasMentor: w.mentors.length > 0,
    firstReviewRequested: openReview("first_review"),
    secondReviewRequested: openReview("second_review"),
    hypothesesAwaitingApproval: w.hypotheses.filter((h) => h.status === "pending_approval").length,
  });
  const next = NEXT_STEP[w.phase][viewer];
  if (viewer === "entrepreneur" && turn === "admin") {
    return { turn, tab: "diagnostico", text: "Tu proyecto espera que la administración te asigne mentor. Mientras tanto, podés cerrar preguntas abiertas en el diagnóstico." };
  }
  if (viewer === "entrepreneur" && turn === "mentor") {
    const mentor = w.mentors.map((m) => w.people[m]?.name).find(Boolean) ?? "Tu mentor";
    return { turn, tab: next.tab, text: `${mentor} tiene tu pedido. Mientras tanto, podés seguir sumando información o evidencia.` };
  }
  // Con la decisión tomada, al ciclo le falta su cierre: lo hace el mentor en «Cierre del ciclo».
  if (w.phase === "decided" && w.mentors.length > 0 && w.cycleEvaluations.length === 0) {
    return viewer === "mentor"
      ? { turn: "mentor", tab: "evaluacion", text: "Decisión registrada. Cerrá el ciclo: compará los objetivos con su línea base y decidí si se renueva." }
      : { turn: "mentor", tab: "evaluacion", text: "Tu mentor ya decidió. Falta el cierre del ciclo: ahí evalúan los objetivos y si se renueva el acompañamiento." };
  }
  return { turn, ...next };
}
