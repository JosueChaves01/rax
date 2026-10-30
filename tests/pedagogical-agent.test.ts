import { describe, expect, it } from "vitest";
import { buildSystemPrompt, executeClaudeAgentTurn } from "@/lib/ai/claude-orchestrator";
import { selectRaxCapability } from "@/lib/n8n/main-agent";
import { RAX_WORKFLOW_TOOLS } from "@/lib/ai/workflow-tools";
import { generateMentorshipExplorationData } from "@/lib/ai/exploration-ai";
import type { Project } from "@/types/domain";

describe("Agente RAX: Soporte integral para mentores, tutores y estudiantes", () => {
  const dummyProject: Project = {
    id: "prj-test-1",
    ownerId: "usr-1",
    name: "Proyecto de Aprendizaje",
    description: "Espacio formativo de estudio guiado",
    nature: "exploring_idea",
    status: "active",
    shareConversationWithMentor: false,
    createdAt: "2026-10-30T00:00:00.000Z",
    updatedAt: "2026-10-30T00:00:00.000Z",
  };

  const emptyKnowledge = {
    mode: "in_context" as const,
    citations: [],
    inContextDocs: [],
    totalTokens: 0,
  };

  it("buildSystemPrompt incluye directivas para tutores, mentores y estudiantes, y la regla de oro anti-sesgo", () => {
    const prompt = buildSystemPrompt(dummyProject, emptyKnowledge);
    
    // Verifica que se reconoce el rol dual y a tutores/estudiantes
    expect(prompt).toContain("mentores, tutores y estudiantes");
    expect(prompt).toContain("asesores y emprendedores");
    
    // Verifica la regla explícita contra mandar a validar mercado a estudiantes
    expect(prompt).toContain("Regla de oro contra el sesgo de validación comercial");
    expect(prompt).toContain("NO envíes a la persona a validar una idea en el mercado");
    expect(prompt).toContain("tutor pedagógico con IA");
  });

  it("simula respuestas pedagógicas para consultas de estudio sin forzar entrevistas de mercado B2B", async () => {
    const turnResult = await executeClaudeAgentTurn({
      project: dummyProject,
      userMessage: "Tengo dudas con un ejercicio de algoritmos que me dejó mi tutor. ¿Qué plan de estudio me recomiendas?",
      history: [],
      knowledge: emptyKnowledge,
      role: "entrepreneur", // rol de base de datos
    });

    expect(turnResult.reply).toContain("tutor");
    expect(turnResult.reply).not.toContain("clientes B2B");
    expect(turnResult.reply).not.toContain("disposición a pagar");
    
    // Verifica que las tareas sugeridas son de aprendizaje y preparación de tutoría
    const titles = turnResult.proposals.map((p) => String(p.title));
    expect(titles.some((t) => /mapa de ideas|conceptos|ejercicios|tutor/i.test(t))).toBe(true);
  });

  it("al solicitar probar o comprobar comprensión, no desvía a experimentos comerciales B2B", async () => {
    const turnResult = await executeClaudeAgentTurn({
      project: dummyProject,
      userMessage: "Quiero probar si entendí bien el concepto antes de mi clase",
      history: [],
      knowledge: emptyKnowledge,
      role: "entrepreneur",
    });

    // No debe proponer experimentos de preventa B2B
    expect(turnResult.reply).not.toContain("Preventa con 15 contactos");
    expect(turnResult.reply).toContain("autoevaluación");
    expect(turnResult.proposals.some((p) => String(p.title).includes("autoevaluación") || String(p.title).includes("tutor"))).toBe(true);
  });

  it("selectRaxCapability en stage 'learning' protege al estudiante de ser derivado a RAX-12 (experimentos)", () => {
    // Si un estudiante dice 'quiero probar el ejercicio' en stage learning, debe quedarse en RAX-02 (o chat pedagógico)
    const capability = selectRaxCapability({
      role: "entrepreneur",
      stage: "learning",
      message: "Quiero probar este ejercicio y verificar el resultado",
    });

    expect(capability.primary).toBe("RAX-02");
    expect(capability.primary).not.toBe("RAX-12");
  });

  it("RAX_WORKFLOW_TOOLS amplía propose_tasks para incluir skill_learning y research", () => {
    const proposeTasksTool = RAX_WORKFLOW_TOOLS.find((t) => t.name === "propose_tasks");
    expect(proposeTasksTool).toBeDefined();

    const taskItems = (proposeTasksTool?.parameters.properties.tasks as { items: { properties: { actionType: { enum: string[] } } } })?.items;
    const actionTypes = taskItems?.properties.actionType.enum;

    expect(actionTypes).toContain("skill_learning");
    expect(actionTypes).toContain("research");
    expect(actionTypes).toContain("operational_task");
  });

  it("generateMentorshipExplorationData genera arquetipo de aprendizaje/tutoría para prompts educativos", async () => {
    const result = await generateMentorshipExplorationData("tutoría de aprendizaje para dominar programación y algoritmos");

    expect(result.sector).toBe("Educación, Formación & Habilidades");
    expect(result.cycleGoals).toContain("Dominio conceptual");
    expect(result.mentorCommitments).toContain("retroalimentación constructiva");
    expect(result.description).not.toContain("entrevistas con clientes");
    expect(result.description).not.toContain("disposición real a pagar");
  });
});
