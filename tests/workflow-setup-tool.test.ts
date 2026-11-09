import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import { executeWorkflowTool } from "@/lib/ai/workflow-tools";

afterAll(closeWorlds);

describe("herramienta setup_mentorship_project del agente", () => {
  it("ejecuta la herramienta setup_mentorship_project del agente de IA", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await entrepreneur.repo.projects.insert({
      id: "prj_existing",
      ownerId: "ent1",
      name: "Existing Base",
      description: "Base",
      nature: "exploring_idea",
      status: "active",
      shareConversationWithMentor: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await executeWorkflowTool(entrepreneur, project.id, "setup_mentorship_project", {
      initiativeName: "BioPack",
      sector: "Sostenibilidad",
      nature: "designing_solution",
      motivation: "validate",
      description: "Empaques biodegradables hechos a partir de bagazo de caña.",
      cycleGoals: "Validar costo unitario y cerrar 2 cartas de intención con restaurantes.",
      frequency: "biweekly",
      scope: "Validación de precio de venta por millar y capacidad de suministro.",
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("BioPack");
    expect(result.proposals).toHaveLength(2);
    expect(result.proposals[0].type).toBe("goal");
    expect(result.proposals[1].type).toBe("task");
  });
});

