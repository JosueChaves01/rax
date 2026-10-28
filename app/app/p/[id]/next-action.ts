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
  return { turn, ...next };
}
