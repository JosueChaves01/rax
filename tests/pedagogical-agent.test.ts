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

  it("entiende la sesión actual en 'Aprender React' y atiende la petición de resumen de conversación para la etapa entender (RAX-03)", async () => {
    const reactProject: Project = {
      id: "prj-react-1",
      ownerId: "usr-student-1",
      name: "Aprender React",
      description: "Explorando una idea de estudio",
      nature: "exploring_idea",
      status: "active",
      shareConversationWithMentor: true,
      createdAt: "2026-10-30T00:00:00.000Z",
      updatedAt: "2026-10-30T00:00:00.000Z",
    };

    // Caso exacto del usuario: la palabra "todo" ("resumen de todo lo que sabemos")
    // no debe confundir al agente con una lista de tareas (to-do) comerciales ni clientes potenciales.
    const turnResult = await executeClaudeAgentTurn({
      project: reactProject,
      userMessage: "quiero que haga un resumen de todo lo que sabemos en esta conversacion para agregarlo como contexto de la etapa entender",
      history: [
        { author: "user", content: "Hola, quiero aprender React desde cero y comprender componentes y hooks." },
        { author: "assistant", content: "¡Excelente! Vamos a estructurar tu aprendizaje paso a paso." },
      ],
      knowledge: emptyKnowledge,
      role: "entrepreneur",
      sessionContext: {
        location: "project_conversation",
        pageTitle: "Conversación del Proyecto",
        stage: "entender",
      },
    });

    // 1. Debe invocar el contexto de RAX-03 y resumir la conversación para la etapa Entender
    expect(turnResult.reply).toContain("RAX-03");
    expect(turnResult.reply).toContain("Entender");

    // 2. NO debe desviar a tareas de entrevistas a clientes ni disposición a pagar
    expect(turnResult.reply).not.toContain("entrevistas con clientes");
    expect(turnResult.reply).not.toContain("disposición a pagar");
    expect(turnResult.reply).not.toContain("RAX-08");

    // 3. Debe proponer un elemento de contexto para el diagnóstico de la etapa
    expect(turnResult.proposals).toHaveLength(1);
    expect(turnResult.proposals[0].type).toBe("diagnosis_item");
    expect(turnResult.proposals[0].category).toBe("context");
    expect(String(turnResult.proposals[0].title)).toContain("Entender");
    expect(String(turnResult.proposals[0].description)).not.toContain("clientes potenciales");
  });

  it("reconoce la etapa Entender y plantea preguntas activas para convertir respuestas en contexto de Orientar", async () => {
    const reactProject: Project = {
      id: "prj-react-2",
      name: "Aprender React",
      ownerId: "user-react",
      description: "Aprender React desde cero con mentoría",
      nature: "exploring_idea",
      status: "active",
      shareConversationWithMentor: true,
      createdAt: "2026-10-30T00:00:00.000Z",
      updatedAt: "2026-10-30T00:00:00.000Z",
    };

    // Caso: usuario pregunta qué preguntas se le harán para iniciar el diagnóstico
    const turnResult = await executeClaudeAgentTurn({
      project: reactProject,
      userMessage: "¿Qué preguntas me vas a hacer para diagnosticar mi punto de partida?",
      history: [],
      knowledge: emptyKnowledge,
      role: "entrepreneur",
      sessionContext: {
        location: "project_conversation",
        pageTitle: "Conversación del Proyecto",
        stage: "entender",
        phase: "conversation",
      },
    });

    expect(turnResult.reply).toContain("Etapa 1 · Entender");
    expect(turnResult.reply).toContain("Orientar");
    expect(turnResult.reply).toMatch(/experiencia|nivel|conocimientos/i);
    expect(turnResult.proposals.length).toBeGreaterThan(0);
    expect(turnResult.proposals[0].type).toBe("diagnosis_item");
  });

  it("convierte la información sobre bloqueos en contexto de diagnóstico para el mentor en Orientar", async () => {
    const reactProject: Project = {
      id: "prj-react-3",
      name: "Aprender React",
      ownerId: "user-react",
      description: "Aprender React desde cero con mentoría",
      nature: "exploring_idea",
      status: "active",
      shareConversationWithMentor: true,
      createdAt: "2026-10-30T00:00:00.000Z",
      updatedAt: "2026-10-30T00:00:00.000Z",
    };

    const turnResult = await executeClaudeAgentTurn({
      project: reactProject,
      userMessage: "Mi nivel es básico en javascript y tengo un bloqueo entendiendo componentes y el hook useEffect",
      history: [],
      knowledge: emptyKnowledge,
      role: "entrepreneur",
      sessionContext: {
        location: "project_conversation",
        pageTitle: "Conversación del Proyecto",
        stage: "entender",
        phase: "conversation",
      },
    });

    expect(turnResult.reply).toContain("Diagnóstico");
    expect(turnResult.reply).toContain("Etapa 2 · Orientar");
    expect(turnResult.proposals.length).toBeGreaterThan(0);
    expect(turnResult.proposals[0].type).toBe("diagnosis_item");
    expect(turnResult.proposals[0].category).toBe("problem");
  });

  it("RAX_WORKFLOW_TOOLS expone update_context_memory (RAX-03) y propose_goals (RAX-07)", () => {
    const toolNames = RAX_WORKFLOW_TOOLS.map((t) => t.name);
    expect(toolNames).toContain("update_context_memory");
    expect(toolNames).toContain("propose_goals");
  });
});
