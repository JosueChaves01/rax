import { afterAll, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";

const { getDepsMock } = vi.hoisted(() => ({ getDepsMock: vi.fn() }));
vi.mock("@/lib/runtime", () => ({ getDeps: getDepsMock, homeFor: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { executeWorkflowTool, RAX_WORKFLOW_TOOLS } from "@/lib/ai/workflow-tools";
import { applyAiProposalAction } from "@/app/actions";

afterAll(closeWorlds);

describe("despachador de herramientas y workflows de RAX (RAX-00..RAX-15)", () => {
  it("expone el catálogo completo de herramientas estructuradas para el agente", () => {
    const toolNames = RAX_WORKFLOW_TOOLS.map((t) => t.name);
    expect(toolNames).toContain("extract_diagnosis_items");
    expect(toolNames).toContain("design_experiment");
    expect(toolNames).toContain("propose_tasks");
    expect(toolNames).toContain("synthesize_session");
    expect(toolNames).toContain("generate_mentor_briefing");
    expect(toolNames).toContain("diagnose_task_delays");
    expect(toolNames).toContain("recommend_resources");
    expect(toolNames).toContain("evaluate_mentorship_cycle");
    expect(toolNames).toContain("query_project_metrics");
    expect(toolNames).toContain("setup_mentorship_project");
  });

  it("ejecuta el workflow RAX-12 (diseño de experimentos e hipótesis)", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await createProject(entrepreneur, { name: "Exp Tool", description: "Test", nature: "exploring_idea" });

    const result = await executeWorkflowTool(entrepreneur, project.id, "design_experiment", {
      hypothesisStatement: "Los restaurantes pagan por delivery agrupado",
      segment: "Restaurantes de comida rápida",
      question: "¿Aceptan pagar una comisión del 10%?",
      method: "Entrevistas en persona",
      metric: "Cartas de intención firmadas",
      successCriterion: ">= 5 de 15",
      rejectionCriterion: "< 2 de 15",
    });

    // Sin hipótesis aprobada, solo se formula la hipótesis: el experimento se diseña después de la aprobación del mentor.
    expect(result.ok).toBe(true);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].type).toBe("hypothesis");
    expect(result.proposals[0].metadata).toMatchObject({ segment: "Restaurantes de comida rápida" });

    const notApproved = await executeWorkflowTool(entrepreneur, project.id, "design_experiment", { hypothesisId: "hyp_inexistente", hypothesisStatement: "x" });
    expect(notApproved.ok).toBe(false);
  });

  it("ejecuta el workflow RAX-08 (propuesta de tareas) y RAX-04 (diagnóstico)", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await createProject(entrepreneur, { name: "Tasks Tool", description: "Test", nature: "exploring_idea" });

    // Tareas (RAX-08)
    const taskResult = await executeWorkflowTool(entrepreneur, project.id, "propose_tasks", {
      tasks: [
        { title: "Entrevistar a 5 gerentes de compras", dueDate: "2026-11-15" },
        { title: "Definir propuesta de valor en una frase" },
      ],
    });
    expect(taskResult.ok).toBe(true);
    expect(taskResult.proposals).toHaveLength(2);
    expect(taskResult.proposals[0].type).toBe("task");

    // Diagnóstico (RAX-04)
    const diagResult = await executeWorkflowTool(entrepreneur, project.id, "extract_diagnosis_items", {
      items: [
        {
          category: "financial",
          title: "Presupuesto ajustado en Q4",
          content: "Los clientes no pueden gastar en software hasta enero",
          uncertainty: "high",
        },
      ],
    });
    expect(diagResult.ok).toBe(true);
    expect(diagResult.proposals).toHaveLength(1);
    expect(diagResult.proposals[0].type).toBe("diagnosis_item");
  });

  it("ejecuta el workflow RAX-15 (métricas del proyecto)", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await createProject(entrepreneur, { name: "Metrics Tool", description: "Test", nature: "operating_business" });

    const metricsResult = await executeWorkflowTool(entrepreneur, project.id, "query_project_metrics", {});
    expect(metricsResult.ok).toBe(true);
    expect(metricsResult.summary).toContain("Workflow RAX-15");
    expect(metricsResult.data).toBeDefined();
    expect(metricsResult.data?.totalTasks).toBe(0);
  });

  it("aplica una propuesta de IA generada por el agente al proyecto mediante applyAiProposalAction", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    getDepsMock.mockResolvedValue(entrepreneur);
    const project = await createProject(entrepreneur, { name: "Proposal Apply", description: "Test", nature: "exploring_idea" });

    const diagResult = await executeWorkflowTool(entrepreneur, project.id, "extract_diagnosis_items", {
      items: [
        {
          category: "market",
          title: "Mercado saturado",
          content: "Hay más de 10 competidores directos en la región",
          uncertainty: "high",
        },
      ],
    });

    const proposal = diagResult.proposals![0];
    const applyRes = await applyAiProposalAction(project.id, proposal);
    expect(applyRes.ok).toBe(true);
    if (applyRes.ok) {
      expect(applyRes.data?.type).toBe("diagnosis_item");
      expect(applyRes.data?.title).toBe("Mercado saturado");
    }
  });
});
