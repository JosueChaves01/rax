import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import {
  appendAgentAssistantMessage,
  appendAgentUserMessage,
  createAgentThread,
  listAgentMessages,
  listProjectThreads,
  renameAgentThread,
} from "@/lib/services/agent-chat";
import { addProjectDocument, promoteDecisionToKnowledge, updateProjectInstructions } from "@/lib/services/project-knowledge";
import { getProjectKnowledgeContext } from "@/lib/ai/knowledge-retrieval";
import { buildSystemPrompt } from "@/lib/ai/claude-orchestrator";

afterAll(closeWorlds);

describe("arquitectura Claude Projects: múltiples hilos, aislamiento y contexto compartido", () => {
  it("permite múltiples hilos independientes dentro del mismo proyecto y aísla sus historiales", async () => {
    const { as } = await world();
    const entrepreneur = as("ent1");
    const project = await createProject(entrepreneur, {
      name: "SaaS Salud",
      description: "Plataforma de telemedicina",
      nature: "designing_solution",
    });

    // 1. Crear Hilo 1: Sobre Pricing
    const thread1 = await createAgentThread(entrepreneur, project.id, "Estrategia de Pricing");
    expect(thread1.title).toBe("Estrategia de Pricing");

    await appendAgentUserMessage(entrepreneur, thread1.id, "¿Deberíamos cobrar $49 o $99?");
    await appendAgentAssistantMessage(entrepreneur, thread1.id, {
      content: "Recomiendo $99 para validar disposición a pagar en B2B.",
    });

    const thread1Messages = await listAgentMessages(entrepreneur, thread1.id);
    expect(thread1Messages).toHaveLength(2);

    // 2. Crear Hilo 2: Sobre Canales de Adquisición
    const thread2 = await createAgentThread(entrepreneur, project.id, "Canales de Adquisición");
    expect(thread2.title).toBe("Canales de Adquisición");

    await appendAgentUserMessage(entrepreneur, thread2.id, "¿Cuáles son los mejores canales B2B?");
    await appendAgentAssistantMessage(entrepreneur, thread2.id, {
      content: "Cold outreach en LinkedIn y referencias directas.",
    });

    const thread2Messages = await listAgentMessages(entrepreneur, thread2.id);
    expect(thread2Messages).toHaveLength(2);

    // 3. AISLAMIENTO ESTRICTO: Thread 2 no contiene ningún mensaje de Thread 1
    const t2Contents = thread2Messages.map((m) => m.content);
    expect(t2Contents).not.toContain("¿Deberíamos cobrar $49 o $99?");
    expect(t2Contents).not.toContain("Recomiendo $99 para validar disposición a pagar en B2B.");

    // 4. Listar hilos del proyecto
    const allThreads = await listProjectThreads(entrepreneur, project.id);
    expect(allThreads.length).toBeGreaterThanOrEqual(2);
    expect(allThreads.map((t) => t.id)).toContain(thread1.id);
    expect(allThreads.map((t) => t.id)).toContain(thread2.id);

    // 5. Renombrar hilo
    const renamed = await renameAgentThread(entrepreneur, thread1.id, "Pricing Validado B2B");
    expect(renamed.title).toBe("Pricing Validado B2B");
  });

  it("comparte el contexto de Project Knowledge entre hilos aislados cuando se promueve una decisión", async () => {
    const { as, repo } = await world();
    const entrepreneur = as("ent1");
    const project = await createProject(entrepreneur, {
      name: "Marketplace Agrícola",
      description: "Conexión de productores y distribuidores",
      nature: "exploring_idea",
    });

    // En Hilo 1 se toma una decisión clave
    const thread1 = await createAgentThread(entrepreneur, project.id, "Chat 1: Definición de Comisión");
    const decisionMessage = await appendAgentAssistantMessage(entrepreneur, thread1.id, {
      content: "Decisión acordada: la comisión será del 4.5% por transacción completada.",
    });

    // Promover la decisión a Project Knowledge
    await promoteDecisionToKnowledge(entrepreneur, project.id, {
      messageId: decisionMessage.id,
      title: "Comisión Marketplace Acordada",
      content: decisionMessage.content,
    });

    // En Hilo 2 (completamente nuevo y aislado), se consulta el conocimiento del proyecto
    const knowledgeContext = await getProjectKnowledgeContext(repo, project.id, "¿Cuál es la comisión acordada?");
    expect(knowledgeContext.mode).toBe("in_context");
    expect(knowledgeContext.inContextDocs).toHaveLength(1);
    expect(knowledgeContext.inContextDocs?.[0].content).toContain("4.5% por transacción");

    // Construcción del System Prompt con instrucciones dedicadas y conocimiento compartido
    await updateProjectInstructions(entrepreneur, project.id, "Sé directo y riguroso con números.");
    const updatedProject = (await repo.projects.get(project.id))!;
    const systemPrompt = buildSystemPrompt(updatedProject, knowledgeContext);

    expect(systemPrompt).toContain("<project_instructions>");
    expect(systemPrompt).toContain("Sé directo y riguroso con números.");
    expect(systemPrompt).toContain("<project_knowledge mode=\"in_context\"");
    expect(systemPrompt).toContain("4.5% por transacción completada");
    expect(systemPrompt).toContain("<artifact_instructions>");
  });

  it("conmuta a pasajes RAG delimitados en el System Prompt cuando los documentos exceden el umbral", async () => {
    const { as, repo } = await world();
    const entrepreneur = as("ent1");
    const project = await createProject(entrepreneur, {
      name: "Proyecto RAG",
      description: "Pruebas de RAG",
      nature: "operating_business",
    });

    // Agregar documento
    await addProjectDocument(entrepreneur, project.id, {
      title: "Plan de Expansión",
      filename: "expansion.md",
      content: "Nuestro plan de expansión en Monterrey iniciará en mayo de 2027.",
    });

    // Forzar umbral bajo para probar conmutación a modo RAG
    const ragContext = await getProjectKnowledgeContext(repo, project.id, "¿Cuándo inicia la expansión en Monterrey?", {
      threshold: 5, // Umbral artificialmente bajo para disparar modo RAG
    });

    expect(ragContext.mode).toBe("rag");
    expect(ragContext.retrievedChunks).toBeDefined();
    expect(ragContext.retrievedChunks?.length).toBeGreaterThan(0);
    expect(ragContext.citations.some((c) => c.filename === "expansion.md")).toBe(true);

    const systemPrompt = buildSystemPrompt(project, ragContext);
    expect(systemPrompt).toContain("<project_knowledge mode=\"rag\"");
    expect(systemPrompt).toContain("Monterrey");
  });
});

