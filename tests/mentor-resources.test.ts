import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import { initiateMentorshipRelation, createMentorshipGoal } from "@/lib/services/mentorship-relation";
import { setTaskBlocked } from "@/lib/services/roadmap";
import { createTask } from "@/lib/services/validation";
import {
  listResources,
  getResource,
  createResource,
  suggestContextualResources,
} from "@/lib/services/resources";

afterAll(closeWorlds);

describe("Fase 5: Biblioteca de Recursos y Recomendación Contextual", () => {
  it("Escenario G1 — Lista recursos precargados y permite filtrar por categoría y término", async () => {
    const { as } = await world();
    const mentor = as("men1");

    const all = await listResources(mentor);
    expect(all.length).toBeGreaterThanOrEqual(6);

    // Filtrar por categoría 'framework'
    const frameworks = await listResources(mentor, { category: "framework" });
    expect(frameworks.every((r) => r.category === "framework")).toBe(true);
    expect(frameworks.some((r) => r.id === "res-canvas-lean-01")).toBe(true);

    // Filtrar por búsqueda 'ice'
    const ice = await listResources(mentor, { query: "ICE" });
    expect(ice).toHaveLength(1);
    expect(ice[0].title).toContain("Matriz ICE");
  });

  it("Escenario G2 — Mentor puede crear un recurso propio y consultar su detalle", async () => {
    const { as, id, repo } = await world();
    const mentor = as("men1");
    const entrepreneur = as("ent1");

    const created = await createResource(mentor, {
      title: "Playbook de Negociación B2B",
      category: "guide",
      description: "Tácticas para cerrar acuerdos piloto corporativos",
      content: "Paso 1: Identificar al tomador de decisiones económico...",
      tags: ["b2b", "ventas", "negociacion"],
      isPublic: true,
    });

    expect(created.id).toBeDefined();
    expect(created.authorMentorId).toBe(id("men1"));

    // Emprendedor puede consultarlo porque es público
    const fetched = await getResource(entrepreneur, created.id);
    expect(fetched.title).toBe("Playbook de Negociación B2B");

    // Verificar auditoría
    const audits = await repo.auditEvents.list({ targetId: created.id, action: "resource.created" });
    expect(audits).toHaveLength(1);
  });

  it("Escenario G3 — Sugerencia contextual recomienda recursos pedagógicos según bloqueos u objetivos", async () => {
    const { as, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    const p = await createProject(ent, {
      name: "SaaS de Facturación",
      description: "Facturación electrónica simplificada",
      nature: "designing_solution",
    });
    await assignMentor(adm, p.id, id("men1"));
    const rel = await initiateMentorshipRelation(ent, p.id, id("ent1"), id("men1"));

    // 1. Caso con objetivo financiero
    await createMentorshipGoal(mentor, rel.id, {
      title: "Optimizar costo de adquisición de clientes y margen unitario",
      description: "Bajar CAC a menos de $15",
      whyItMatters: "Sustentabilidad del modelo",
      kind: "metric",
      baseline: "CAC actual $45",
      targetResult: "CAC $15",
      priority: "high",
    });

    // 2. Tarea con bloqueo operativo
    const task = await createTask(ent, p.id, {
      title: "Integrar pasarela de cobro",
      actionType: "operational_task",
    });
    await setTaskBlocked(ent, task.id, "Claves de API demoradas");

    // Solicitar recomendaciones contextuales
    const suggestions = await suggestContextualResources(mentor, p.id);

    expect(suggestions.length).toBeGreaterThanOrEqual(1);

    // Debe sugerir el protocolo de retrasos por el bloqueo
    const delaySug = suggestions.find((s) => s.resource.id === "res-diagnostico-retraso-05");
    expect(delaySug).toBeDefined();
    expect(delaySug!.whyItHelpsNow).toContain("tarea(s) bloqueada(s)");

    // Debe sugerir la plantilla de costos por el objetivo de costos y márgenes
    const costSug = suggestions.find((s) => s.resource.id === "res-costos-unitarios-04");
    expect(costSug).toBeDefined();
    expect(costSug!.whyItHelpsNow).toContain("rentabilidad o estructura de costos");
  });
});
