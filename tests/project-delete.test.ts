import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject, deleteProject, getWorkspace, listMyProjects } from "@/lib/services/projects";
import { adminOverview, assignMentor } from "@/lib/services/admin";
import { getMentorPortfolio } from "@/lib/services/portfolio";
import { initiateMentorshipRelation } from "@/lib/services/mentorship-relation";
import { executeWorkflowTool } from "@/lib/ai/workflow-tools";
import { applyAgentProposal } from "@/lib/services/agent-actions";

afterAll(closeWorlds);

describe("borrar un proyecto creado por error", () => {
  it("la dueña lo borra escribiendo el nombre y desaparece para ella, el mentor y la administración", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const men = w.as("men1");
    const keep = await createProject(ent, { name: "Viandas saludables", description: "", nature: "exploring_idea" });
    const oops = await createProject(ent, { name: "Proyecto  de prueba", description: "", nature: "exploring_idea" });
    for (const p of [keep, oops]) {
      await assignMentor(w.as("adm"), p.id, w.id("men1"));
      await initiateMentorshipRelation(ent, p.id, w.id("ent1"), w.id("men1"));
    }
    expect((await listMyProjects(men)).map((p) => p.id)).toContain(oops.id);

    await expect(deleteProject(ent, oops.id, { confirmName: "otro nombre" })).rejects.toThrow(/nombre exacto/);
    await deleteProject(ent, oops.id, { confirmName: " proyecto de PRUEBA " });

    expect((await listMyProjects(ent)).map((p) => p.id)).toEqual([keep.id]);
    expect((await listMyProjects(men)).map((p) => p.id)).toEqual([keep.id]);
    expect((await getMentorPortfolio(men)).projects.map((p) => p.projectId)).toEqual([keep.id]);
    expect((await adminOverview(w.as("adm"))).projects.map((p) => p.id)).toEqual([keep.id]);
    await expect(getWorkspace(men, oops.id)).rejects.toThrow();
    await expect(getWorkspace(ent, oops.id)).rejects.toThrow();
    // Los datos siguen en la base (borrado lógico), solo que ocultos.
    expect(await w.repo.projects.get(oops.id)).toBeUndefined();
  });

  it("solo la dueña puede borrarlo: ni el mentor ni otra persona", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const p = await createProject(ent, { name: "Huerta urbana", description: "", nature: "exploring_idea" });
    await assignMentor(w.as("adm"), p.id, w.id("men1"));
    await expect(deleteProject(w.as("men1"), p.id, { confirmName: "Huerta urbana" })).rejects.toThrow();
    await expect(deleteProject(w.as("ent2"), p.id, { confirmName: "Huerta urbana" })).rejects.toThrow();
    expect((await listMyProjects(ent)).map((x) => x.id)).toEqual([p.id]);
  });

  it("el agente lo propone como tarjeta y se borra solo al aplicarla; al mentor no se lo propone", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const p = await createProject(ent, { name: "Ropa reciclada", description: "", nature: "exploring_idea" });
    await assignMentor(w.as("adm"), p.id, w.id("men1"));

    const forMentor = await executeWorkflowTool(w.as("men1"), p.id, "propose_step_action", { action: "delete_project", text: "error" });
    expect(forMentor.ok).toBe(false);

    const res = await executeWorkflowTool(ent, p.id, "propose_step_action", { action: "delete_project", text: "Lo creé por error" });
    expect(res.ok).toBe(true);
    expect((await listMyProjects(ent)).map((x) => x.id)).toEqual([p.id]);
    const applied = await applyAgentProposal(ent, p.id, res.proposals[0]);
    expect(applied.notice).toMatch(/borrado/);
    expect(await listMyProjects(ent)).toEqual([]);
  });
});
