import { describe, expect, it } from "vitest";
import { can, NO_RELATION } from "@/lib/authz";
import { PEOPLE } from "./helpers";
import { isUnknownSentence, readStatementSignal, splitSentences } from "@/features/conversation/interview";
import { hypothesisIssues, HYPOTHESIS_TRANSITIONS } from "@/features/hypotheses/rules";
import { applyHumanChange } from "@/features/diagnosis/rules";
import { parse, ItemChange } from "@/lib/validation/inputs";
import { PHASE_ORDER } from "@/features/labels";
import { SECTIONS, STAGES, phasesDone, sectionOfSlug, stageOf, stageState, turnOf } from "@/features/projects/stages";
import { mentorInbox, suggestMentor } from "@/features/mentoring/inbox";
import type { DiagnosisItem, Hypothesis, MentorSession } from "@/types/domain";

const [ent, , mentor, , admin] = PEOPLE;
const owner = { ...NO_RELATION, isOwner: true };
const assigned = { ...NO_RELATION, isAssignedMentor: true };

describe("matriz de permisos", () => {
  it("separa responsabilidades", () => {
    expect(can(ent, "diagnosis.confirm_summary", owner)).toBe(true);
    expect(can(ent, "hypothesis.approve", owner)).toBe(false);
    expect(can(mentor, "hypothesis.approve", assigned)).toBe(true);
    expect(can(mentor, "diagnosis.edit", assigned)).toBe(false);
    expect(can(mentor, "project.read", NO_RELATION)).toBe(false);
    expect(can(admin, "project.read", NO_RELATION)).toBe(false);
    expect(can(admin, "admin.manage")).toBe(true);
    // Un emprendedor con relación "mentor" falsificada no obtiene permisos de mentor.
    expect(can(ent, "mentor.decide", assigned)).toBe(false);
  });
});

describe("señales del lenguaje", () => {
  it("reconoce 'no sé' con acentos y supuestos", () => {
    expect(isUnknownSentence("No sé cuánto cuesta.")).toBe(true);
    expect(isUnknownSentence("No sería caro.")).toBe(false);
    expect(readStatementSignal("Supongo que pagarían").kind).toBe("assumption");
    expect(readStatementSignal("Hablé con 6 personas").kind).toBe("observation");
    expect(splitSentences("Uno. Dos? Tres!")).toEqual(["Uno.", "Dos?", "Tres!"]);
  });
});

describe("hipótesis", () => {
  it("rechaza hipótesis vagas y no permite saltar estados", () => {
    expect(hypothesisIssues({ statement: "A los clientes les gustará la aplicación", segment: "", evaluationCriterion: "" }).length).toBeGreaterThan(1);
    expect(HYPOTHESIS_TRANSITIONS.draft).not.toContain("supported");
    expect(HYPOTHESIS_TRANSITIONS.discarded).toHaveLength(0);
  });
});

describe("cambios humanos", () => {
  const item = { id: "i", projectId: "p", category: "context", title: "t", content: "c", infoType: "entrepreneur_statement", reviewStatus: "proposed", uncertainty: "medium", source: { kind: "conversation" }, authorId: "ai", relatedItemIds: [], evidenceIds: [], version: 1, createdAt: "", updatedAt: "" } as DiagnosisItem;
  it("solo los problemas se priorizan y con justificación", () => {
    expect(() => applyHumanChange(item, { kind: "prioritize", rank: 1, rationale: "x" }, "u", "now")).toThrow();
    expect(() => applyHumanChange({ ...item, category: "problem" }, { kind: "prioritize", rank: 1, rationale: " " }, "u", "now")).toThrow();
  });
  it("rechazar exige motivo", () => {
    expect(() => applyHumanChange(item, { kind: "reject", reason: "" }, "u", "now")).toThrow();
  });
});

describe("validación de entradas", () => {
  it("rechaza tipos y enums arbitrarios", () => {
    expect(() => parse(ItemChange, { kind: "delete_everything" })).toThrow();
    expect(() => parse(ItemChange, { kind: "prioritize", rank: "1; drop table", rationale: "x" })).toThrow();
    expect(parse(ItemChange, { kind: "confirm", extra: 1 })).toEqual({ kind: "confirm" });
  });
});

describe("etapas del proyecto", () => {
  it("agrupa las 10 fases en 4 etapas, sin huecos ni repetidas", () => {
    const all = STAGES.flatMap((s) => s.phases);
    expect(all).toEqual(PHASE_ORDER);
    expect(stageOf("prioritizing").id).toBe("orientar");
    expect(stageOf("experiments_running").id).toBe("probar");
  });

  it("marca etapas hechas, en curso y por venir; la decisión cierra todo", () => {
    const [entender, orientar, probar] = STAGES;
    expect(stageState(entender, "hypotheses")).toBe("done");
    expect(stageState(probar, "hypotheses")).toBe("current");
    expect(stageState(orientar, "conversation")).toBe("upcoming");
    expect(STAGES.every((s) => stageState(s, "decided") === "done")).toBe(true);
    expect(phasesDone(entender, "summary_pending")).toBe(2);
  });

  it("dice a quién le toca, incluso cuando falta mentor", () => {
    const base = { hasMentor: true, firstReviewRequested: false, secondReviewRequested: false, hypothesesAwaitingApproval: 0 };
    expect(turnOf({ ...base, phase: "conversation" })).toBe("entrepreneur");
    expect(turnOf({ ...base, phase: "mentor_review_1" })).toBe("entrepreneur");
    expect(turnOf({ ...base, phase: "mentor_review_1", firstReviewRequested: true })).toBe("mentor");
    expect(turnOf({ ...base, phase: "mentor_review_1", hasMentor: false })).toBe("admin");
    expect(turnOf({ ...base, phase: "hypotheses", hypothesesAwaitingApproval: 1 })).toBe("mentor");
    expect(turnOf({ ...base, phase: "results_review", secondReviewRequested: true })).toBe("mentor");
    expect(turnOf({ ...base, phase: "decided" })).toBe("none");
  });

  it("cada página del proyecto pertenece a una sola sección", () => {
    const slugs = SECTIONS.flatMap((s) => s.pages.map((p) => p.slug));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(sectionOfSlug("validacion").id).toBe("probar");
    expect(sectionOfSlug("tareas").id).toBe("archivo");
    expect(sectionOfSlug("").id).toBe("inicio");
  });
});

describe("bandeja del mentor y sugerencia de asignación", () => {
  const session = (over: Partial<MentorSession>): MentorSession => ({
    id: "s",
    projectId: "p",
    mentorId: "m1",
    kind: "first_review",
    status: "pending",
    createdAt: "2026-10-02T00:00:00.000Z",
    ...over,
  });

  it("junta lo que espera al mentor, más viejo primero, y deja afuera lo de otros mentores", () => {
    const items = mentorInbox("m1", [
      { id: "a", name: "A", sessions: [session({ createdAt: "2026-10-05T00:00:00.000Z" })], hypotheses: [] },
      {
        id: "b",
        name: "B",
        sessions: [session({ kind: "second_review", createdAt: "2026-10-01T00:00:00.000Z" }), session({ mentorId: "m2" }), session({ status: "completed" })],
        hypotheses: [{ status: "pending_approval", statement: "Algo", updatedAt: "2026-10-03T00:00:00.000Z" } as Hypothesis],
      },
    ]);
    expect(items.map((i) => [i.projectId, i.kind, i.tab])).toEqual([
      ["b", "second_review", "decidir"],
      ["b", "hypothesis", "validacion"],
      ["a", "first_review", "orientar"],
    ]);
  });

  it("sugiere a alguien con cupo, primero por rubro y después por cupo libre", () => {
    const mentors = [
      { id: "lleno", sectors: "Gastronomía", active: 2, max: 2 },
      { id: "rubro", sectors: "gastronomia, turismo", active: 1, max: 2 },
      { id: "libre", sectors: "tecnología", active: 0, max: 5 },
    ];
    expect(suggestMentor("Gastronomía saludable", mentors)).toBe("rubro");
    expect(suggestMentor("Educación", mentors)).toBe("libre");
    expect(suggestMentor("x", [mentors[0]])).toBeUndefined();
  });
});
