import { describe, expect, it } from "vitest";
import { can, NO_RELATION } from "@/lib/authz";
import { PEOPLE } from "./helpers";
import { isUnknownSentence, readStatementSignal, splitSentences } from "@/features/conversation/interview";
import { hypothesisIssues, HYPOTHESIS_TRANSITIONS } from "@/features/hypotheses/rules";
import { applyHumanChange } from "@/features/diagnosis/rules";
import { parse, ItemChange } from "@/lib/validation/inputs";
import type { DiagnosisItem } from "@/types/domain";

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
