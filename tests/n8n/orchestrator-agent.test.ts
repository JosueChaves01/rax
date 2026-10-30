import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "../helpers";
import {
  ORCHESTRATED_WORKFLOWS,
  orchestrateWorkflowTurn,
  executeWorkflowDirect,
} from "@/lib/n8n/workflow-orchestrator";

afterAll(closeWorlds);

describe("Agente Orquestador Universal de Workflows de RAX", () => {
  afterEach(() => {
    delete process.env.RAX_N8N_MAIN_AGENT_ENABLED;
    delete process.env.N8N_WEBHOOK_BASE_URL;
    delete process.env.RAX_N8N_SHARED_SECRET;
    vi.restoreAllMocks();
  });

  it("publica el catálogo maestro completo de los 19 workflows orquestados", () => {
    expect(ORCHESTRATED_WORKFLOWS).toHaveLength(19);
    const ids = ORCHESTRATED_WORKFLOWS.map((w) => w.id);
    expect(ids).toContain("RAX-00");
    expect(ids).toContain("RAX-01");
    expect(ids).toContain("RAX-02");
    expect(ids).toContain("RAX-03");
    expect(ids).toContain("RAX-04");
    expect(ids).toContain("RAX-05");
    expect(ids).toContain("RAX-06");
    expect(ids).toContain("RAX-07");
    expect(ids).toContain("RAX-08");
    expect(ids).toContain("RAX-09");
    expect(ids).toContain("RAX-10");
    expect(ids).toContain("RAX-11");
    expect(ids).toContain("RAX-12");
    expect(ids).toContain("RAX-13");
    expect(ids).toContain("RAX-14");
    expect(ids).toContain("RAX-15");
    expect(ids).toContain("RAX-90");
    expect(ids).toContain("RAX-91");
    expect(ids).toContain("RAX-99");
  });

  it("orquesta turnos identificando el workflow correspondiente y ejecutando nativamente con resiliencia", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await entrepreneur.repo.projects.insert({
      id: "prj_orch_1",
      ownerId: "ent1",
      name: "Orchestration Project",
      description: "Test",
      nature: "exploring_idea",
      status: "active",
      shareConversationWithMentor: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    // 1. Tareas (RAX-08)
    const taskResult = await orchestrateWorkflowTurn({
      projectId: project.id,
      message: "Propón las tareas prioritarias para esta semana",
      role: "entrepreneur",
      deps: entrepreneur,
    });
    expect(taskResult.ok).toBe(true);
    expect(taskResult.flowId).toBe("RAX-08");
    expect(taskResult.transport).toBe("native");
    expect(taskResult.proposals.length).toBeGreaterThanOrEqual(1);
    expect(taskResult.proposals[0].needsHumanApproval).toBe(true);

    // 2. Hipótesis y experimentos (RAX-12)
    const expResult = await orchestrateWorkflowTurn({
      projectId: project.id,
      message: "¿Qué hipótesis y experimento podemos diseñar para validar la demanda?",
      role: "entrepreneur",
      deps: entrepreneur,
    });
    expect(expResult.ok).toBe(true);
    expect(expResult.flowId).toBe("RAX-12");
    expect(expResult.transport).toBe("native");
    expect(expResult.proposals.some((p) => p.type === "hypothesis" || p.type === "experiment")).toBe(true);
  });

  it("ejecuta herramientas directas del catálogo a través de executeWorkflowDirect", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await entrepreneur.repo.projects.insert({
      id: "prj_orch_2",
      ownerId: "ent1",
      name: "Direct Tool Project",
      description: "Test",
      nature: "operating_business",
      status: "active",
      shareConversationWithMentor: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const metricsRes = await executeWorkflowDirect(entrepreneur, project.id, "query_project_metrics", {});
    expect(metricsRes.ok).toBe(true);
    expect(metricsRes.summary).toContain("Workflow RAX-15");
  });

  it("despacha a n8n cuando el agente principal de n8n está activado", async () => {
    process.env.RAX_N8N_MAIN_AGENT_ENABLED = "true";
    process.env.N8N_WEBHOOK_BASE_URL = "https://n8n.test";
    process.env.RAX_N8N_SHARED_SECRET = "secret";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        correlationId: "corr_n8n_test",
        reply: "Respuesta orquestada desde n8n RAX-02",
        proposals: [
          {
            type: "task",
            title: "Entrevistar 5 directores de operaciones",
            needsHumanApproval: true,
          },
        ],
        uncertainties: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await entrepreneur.repo.projects.insert({
      id: "prj_orch_3",
      ownerId: "ent1",
      name: "N8N Orchestrated Project",
      description: "Test",
      nature: "exploring_idea",
      status: "active",
      shareConversationWithMentor: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await orchestrateWorkflowTurn({
      projectId: project.id,
      message: "Hola agente",
      role: "entrepreneur",
      deps: entrepreneur,
    });

    expect(result.ok).toBe(true);
    expect(result.transport).toBe("n8n");
    expect(result.reply).toBe("Respuesta orquestada desde n8n RAX-02");
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].title).toBe("Entrevistar 5 directores de operaciones");
  });
});

