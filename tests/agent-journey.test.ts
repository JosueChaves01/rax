import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { closeWorlds, world, type World } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import { executeWorkflowTool } from "@/lib/ai/workflow-tools";
import { applyAgentProposal } from "@/lib/services/agent-actions";
import { buildJourney } from "@/lib/ai/journey";
import { buildProjectState, renderProjectState } from "@/lib/ai/project-state";
import { runAgentTurn } from "@/lib/services/agent-turn";
import type { ServiceDeps } from "@/lib/services/base";
import { AiProposalItemSchema } from "@/lib/n8n/contracts";

afterAll(closeWorlds);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Lo que haría el chat: el agente usa una herramienta y la persona aplica cada tarjeta. */
async function agentDoes(d: ServiceDeps, projectId: string, tool: string, args: Record<string, unknown>) {
  const res = await executeWorkflowTool(d, projectId, tool, args);
  expect(res.ok, res.summary).toBe(true);
  expect(res.proposals.length).toBeGreaterThan(0);
  const applied = [];
  for (const p of res.proposals) applied.push(await applyAgentProposal(d, projectId, p));
  return applied;
}

const step = (d: ServiceDeps, projectId: string, args: Record<string, unknown>) => agentDoes(d, projectId, "propose_step_action", args);

async function currentStep(d: ServiceDeps, projectId: string) {
  const j = buildJourney(await getWorkspace(d, projectId));
  return j.finished ? "fin" : j.steps[j.currentIndex].id;
}

describe("recorrido completo llevado por el agente", () => {
  let w: World;

  it("emprendedor y mentor llevan el proyecto del paso cero a la conclusión solo con propuestas del chat", async () => {
    w = await world();
    const ent = w.as("ent1");
    const men = w.as("men1");
    const project = await createProject(ent, { name: "Viandas saludables", description: "Viandas para oficinas", nature: "exploring_idea" });
    const pid = project.id;

    // ── Entender ──
    expect(await currentStep(ent, pid)).toBe("describe");
    expect((await getWorkspace(ent, pid)).phase).toBe("new");
    await agentDoes(ent, pid, "extract_diagnosis_items", {
      items: [
        { category: "problem", title: "Oficinistas comen mal por falta de tiempo", content: "Lo contó la emprendedora a partir de su trabajo", uncertainty: "medium" },
        { category: "people_market", title: "Oficinas del centro", content: "Unas 40 oficinas a 2 km", uncertainty: "high" },
      ],
    });
    expect((await getWorkspace(ent, pid)).phase).toBe("conversation");
    expect(await currentStep(ent, pid)).toBe("draft_summary");

    await agentDoes(ent, pid, "update_context_memory", { summary: "Viandas saludables para oficinistas del centro que no tienen tiempo de cocinar.", stage: "entender" });
    expect(await currentStep(ent, pid)).toBe("confirm_summary");

    // El mentor no puede confirmar el resumen: el agente no se lo propone.
    await assignMentor(w.as("adm"), pid, w.id("men1"));
    const denied = await executeWorkflowTool(men, pid, "propose_step_action", { action: "confirm_summary" });
    expect(denied.ok).toBe(false);
    expect(denied.proposals).toEqual([]);

    await step(ent, pid, { action: "confirm_summary" });
    expect(await currentStep(ent, pid)).toBe("request_first_review");
    await step(ent, pid, { action: "request_review", kind: "first_review" });

    // ── Orientar ──
    expect(await currentStep(men, pid)).toBe("first_review");
    await step(men, pid, { action: "add_session_note", kind: "question", text: "¿Cuántas oficinas ya contactaste?" });
    await step(men, pid, { action: "complete_first_review", text: "Investigar primero si las oficinas pagarían una vianda diaria." });
    expect(await currentStep(men, pid)).toBe("prioritize_problem");

    const problem = (await getWorkspace(men, pid)).items.find((i) => i.category === "problem")!;
    await step(men, pid, { action: "prioritize_problem", targetId: problem.id, rank: 1, text: "Es el problema con más incertidumbre y más impacto." });
    expect((await getWorkspace(ent, pid)).phase).toBe("hypotheses");

    // Acuerdo y objetivos del ciclo (opcionales, pero el cierre los necesita).
    await step(ent, pid, { action: "save_agreement", scope: "Validar la demanda de viandas en oficinas", frequency: "weekly", sessionDurationMinutes: 45, expectedDurationWeeks: 8 });
    await step(men, pid, { action: "confirm_agreement" });
    await step(ent, pid, { action: "confirm_agreement" });
    await agentDoes(men, pid, "propose_goals", { goals: [{ title: "Conocer la demanda real", description: "Saber cuántas oficinas comprarían", priority: "high", targetResult: "10 oficinas entrevistadas" }] });
    const midWs = await getWorkspace(ent, pid);
    expect(midWs.mentorshipAgreements.at(-1)?.status).toBe("active");
    expect(midWs.mentorshipGoals).toHaveLength(1);

    // ── Probar ──
    expect(await currentStep(ent, pid)).toBe("propose_hypothesis");
    await agentDoes(ent, pid, "design_experiment", {
      hypothesisStatement: "Al menos 3 de 10 oficinas del centro encargan una vianda de prueba en la primera semana",
      segment: "Oficinas del centro con más de 10 personas",
      evaluationCriterion: "Encargos pagados en la primera semana",
      relatedItemId: problem.id,
    });
    await step(ent, pid, { action: "submit_hypothesis" });
    expect(await currentStep(ent, pid)).toBe("approve_hypothesis");

    // El emprendedor no puede aprobar su propia hipótesis.
    expect((await executeWorkflowTool(ent, pid, "propose_step_action", { action: "decide_hypothesis", decision: "approve" })).ok).toBe(false);
    await step(men, pid, { action: "decide_hypothesis", decision: "approve" });
    expect(await currentStep(ent, pid)).toBe("design_experiment");

    const hyp = (await getWorkspace(ent, pid)).hypotheses.find((h) => h.status === "approved")!;
    await agentDoes(ent, pid, "design_experiment", {
      hypothesisId: hyp.id,
      hypothesisStatement: hyp.statement,
      question: "¿Las oficinas encargan y pagan una vianda de prueba?",
      method: "Oferta directa de una semana de prueba",
      participants: "10 oficinas del centro",
      metric: "Oficinas que pagan el encargo",
      successCriterion: "3 o más oficinas pagan",
      rejectionCriterion: "Menos de 1 oficina paga",
      evidencePlan: "Comprobantes de pago y mensajes",
    });
    expect((await getWorkspace(ent, pid)).phase).toBe("experiments_preparing");
    await step(ent, pid, { action: "start_experiment" });
    expect((await getWorkspace(ent, pid)).phase).toBe("experiments_running");

    await agentDoes(ent, pid, "propose_tasks", { tasks: [{ title: "Visitar 10 oficinas", actionType: "experiment" }] });
    const task = (await getWorkspace(ent, pid)).tasks[0];
    await step(ent, pid, { action: "set_task_status", targetId: task.id, status: "done" });
    await step(ent, pid, { action: "add_evidence", title: "Comprobantes de pago", text: "4 oficinas pagaron la semana de prueba" });
    await step(ent, pid, { action: "record_result", outcome: "positive", text: "4 de 10 oficinas pagaron", metricValue: "4", learnings: "Prefieren pagar por semana", limitations: "Solo una semana" });

    // ── Decidir ──
    expect(await currentStep(ent, pid)).toBe("request_second_review");
    await step(ent, pid, { action: "request_review", kind: "second_review" });
    expect(await currentStep(men, pid)).toBe("mentor_decision");
    await step(men, pid, { action: "mentor_decision", decision: "continue", text: "El resultado supera el criterio de éxito fijado antes de empezar." });

    const end = await getWorkspace(ent, pid);
    expect(end.phase).toBe("decided");
    expect(buildJourney(end).finished).toBe(true);
    expect(end.results[0].evidenceIds).toHaveLength(1);

    await agentDoes(men, pid, "evaluate_mentorship_cycle", { goalsAchieved: 1, goalsTotal: 1, summary: "Ciclo cumplido: la demanda quedó validada en pequeño.", decision: "renew", autonomy: "developing" });
    const closed = await getWorkspace(ent, pid);
    expect(closed.cycleEvaluations).toHaveLength(1);
    expect(buildJourney(closed).steps.every((s) => s.done)).toBe(true);
  });
});

describe("el agente sabe en qué paso está", () => {
  it("el estado del proyecto muestra el recorrido, el paso actual y a quién le toca, con ids", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Clases de guitarra", description: "Clases online", nature: "exploring_idea" });
    await agentDoes(ent, project.id, "extract_diagnosis_items", { items: [{ category: "problem", title: "Pocos alumnos", content: "x", uncertainty: "high" }] });
    await agentDoes(ent, project.id, "update_context_memory", { summary: "Clases de guitarra online para adultos que empiezan." });

    const text = renderProjectState(buildProjectState(await getWorkspace(ent, project.id), "entrepreneur", "2026-10-31T00:00:00.000Z"));
    expect(text).toContain("Recorrido: paso 3 de 17");
    expect(text).toContain("Paso actual: «Confirmar el resumen (solo la persona dueña)», le toca a emprendedor/a (a quien conversa)");
    expect(text).toMatch(/✓ 1\. Contar la idea/);
    expect(text).toMatch(/\[[\w-]+\] Pocos alumnos/);

    expect(text).toContain("propose_step_action confirm_summary");

    await assignMentor(w.as("adm"), project.id, w.id("men1"));
    const mentorView = renderProjectState(buildProjectState(await getWorkspace(w.as("men1"), project.id), "mentor", "2026-10-31T00:00:00.000Z"));
    expect(mentorView).toContain("le toca a emprendedor/a.");
    expect(mentorView).toMatch(/→ 3\. Confirmar el resumen .* — le corresponde a otra persona/);
  });

  it("con el modelo, el agente recibe el recorrido y propone el paso como tarjeta aplicable", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Huerta", description: "Kits", nature: "exploring_idea" });
    await agentDoes(ent, project.id, "update_context_memory", { summary: "Kits de huerta para balcones de departamentos." });

    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    const bodies: Array<{ messages: Array<{ role: string; content: unknown }> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        bodies.push(JSON.parse(options?.body as string));
        const message = bodies.length === 1
          ? { content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "propose_step_action", arguments: JSON.stringify({ action: "confirm_summary" }) } }] }
          : { content: "Estás en el paso 3 de 17: confirmá el resumen con la tarjeta." };
        return new Response(JSON.stringify({ model: "m", choices: [{ message }] }), { status: 200 });
      }),
    );
    const turn = await runAgentTurn(ent, { projectId: project.id, message: "¿Qué sigue?" });
    expect(JSON.stringify(bodies[0].messages[0].content)).toContain("Recorrido: paso 3 de 17");
    expect(turn.result.proposals).toHaveLength(1);
    expect(turn.result.proposals[0]).toMatchObject({ type: "flow_action", title: "Confirmar el resumen del diagnóstico" });

    await applyAgentProposal(ent, project.id, AiProposalItemSchema.parse(turn.result.proposals[0]));
    expect((await getWorkspace(ent, project.id)).diagnosis.summaryConfirmedAt).toBeTruthy();
  });

  it("sin modelo, la simulación también ofrece el paso actual cuando no requiere redacción", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Taller", description: "Bicis", nature: "exploring_idea" });
    await agentDoes(ent, project.id, "update_context_memory", { summary: "Taller de bicicletas a domicilio en el barrio." });
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const turn = await runAgentTurn(ent, { projectId: project.id, message: "¿Qué sigue?" });
    expect(turn.result.reply).toContain("paso 3 de 17");
    expect(turn.result.proposals.map((p) => p.type)).toEqual(["flow_action"]);
  });

  it("aplicar un paso fuera de orden devuelve el motivo en vez de romper el proyecto", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Sin mentor", description: "x", nature: "unknown" });
    await expect(step(ent, project.id, { action: "request_review", kind: "first_review" })).rejects.toThrow(/resumen/);
    await expect(step(ent, project.id, { action: "start_experiment" })).rejects.toThrow(/experimento/);
  });
});
