import type { Hypothesis, MentorSession } from "@/types/domain";

export type InboxKind = "first_review" | "hypothesis" | "second_review";

export interface InboxItem {
  kind: InboxKind;
  projectId: string;
  projectName: string;
  /** Página del proyecto donde se responde. */
  tab: "orientar" | "validacion" | "decidir";
  detail: string;
  since: string;
}

/**
 * Lo que espera una respuesta del mentor en sus proyectos, más viejo primero.
 * Solo usa datos que el mentor ya puede leer: sesiones pedidas e hipótesis enviadas a aprobación.
 */
export function mentorInbox(
  mentorId: string,
  projects: Array<{ id: string; name: string; sessions: MentorSession[]; hypotheses: Hypothesis[] }>,
): InboxItem[] {
  const items: InboxItem[] = [];
  for (const p of projects) {
    for (const s of p.sessions) {
      if (s.status === "completed" || s.mentorId !== mentorId) continue;
      items.push(
        s.kind === "first_review"
          ? { kind: "first_review", projectId: p.id, projectName: p.name, tab: "orientar", detail: "Pidió la primera revisión. El resumen preparado está listo.", since: s.createdAt }
          : { kind: "second_review", projectId: p.id, projectName: p.name, tab: "decidir", detail: "Registró resultados y pidió la segunda revisión.", since: s.createdAt },
      );
    }
    for (const h of p.hypotheses) {
      if (h.status !== "pending_approval") continue;
      items.push({ kind: "hypothesis", projectId: p.id, projectName: p.name, tab: "validacion", detail: `«${h.statement.slice(0, 110)}${h.statement.length > 110 ? "…" : ""}»`, since: h.updatedAt });
    }
  }
  return items.sort((a, b) => a.since.localeCompare(b.since));
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length > 3);

/**
 * Mentor sugerido para un proyecto: alguien con cupo, primero quien comparte rubro con el emprendedor
 * y después quien tiene más cupo libre. Es una sugerencia: la asignación la decide una persona.
 */
export function suggestMentor(
  founderSector: string | undefined,
  mentors: Array<{ id: string; sectors: string; active: number; max: number | null }>,
): string | undefined {
  const target = new Set(words(founderSector ?? ""));
  const free = (m: { active: number; max: number | null }) => (m.max == null ? 0 : m.max - m.active);
  const score = (m: { sectors: string }) => words(m.sectors).filter((w) => target.has(w)).length;
  return mentors
    .filter((m) => m.max == null || m.active < m.max)
    .sort((a, b) => score(b) - score(a) || free(b) - free(a))[0]?.id;
}
