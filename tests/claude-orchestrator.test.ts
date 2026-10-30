import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildSystemPrompt, executeClaudeAgentTurn } from "@/lib/ai/claude-orchestrator";
import type { Project, ProjectKnowledgeDocument } from "@/types/domain";

describe("Claude Orchestrator y Prompt Caching", () => {
  const dummyProject: Project = {
    id: "prj-test-1",
    name: "Startup Alpha",
    ownerId: "user-1",
    description: "Startup Alpha",
    nature: "exploring_idea",
    status: "active",
    customInstructions: "Enfócate en validación B2B y modelos SaaS.",
    shareConversationWithMentor: true,
    createdAt: "2026-10-30T00:00:00.000Z",
    updatedAt: "2026-10-30T00:00:00.000Z",
  };

  const sampleDoc: ProjectKnowledgeDocument = {
    id: "doc-1",
    projectId: "prj-test-1",
    title: "Entrevistas de Descubrimiento",
    filename: "entrevistas.txt",
    content: "Resumen de 12 entrevistas: 8 usuarios demandan integración automática.",
    fileType: "text",
    tokenCount: 25,
    source: "upload",
    createdBy: "user-1",
    createdAt: "2026-10-30T00:00:00.000Z",
    updatedAt: "2026-10-30T00:00:00.000Z",
  };

  it("construye un system prompt determinista y estable para el prefijo de caché", () => {
    const prompt1 = buildSystemPrompt(dummyProject, {
      mode: "in_context",
      totalTokens: 25,
      inContextDocs: [sampleDoc],
      citations: [],
    });

    const prompt2 = buildSystemPrompt(dummyProject, {
      mode: "in_context",
      totalTokens: 25,
      inContextDocs: [sampleDoc],
      citations: [],
    });

    // La estabilidad byte a byte es obligatoria para garantizar cache hit
    expect(prompt1).toBe(prompt2);
    expect(prompt1).toContain("<project_knowledge mode=\"in_context\" count=\"1\">");
    expect(prompt1).toContain("Enfócate en validación B2B");
    expect(prompt1).toContain("Resumen de 12 entrevistas");
  });

  describe("executeClaudeAgentTurn", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      vi.unstubAllGlobals();
    });

    it("ejecuta en modo simulado cuando no hay OPENROUTER_API_KEY", async () => {
      delete process.env.OPENROUTER_API_KEY;

      const result = await executeClaudeAgentTurn({
        project: dummyProject,
        userMessage: "¿Cuáles son las tareas recomendadas?",
        history: [],
        knowledge: {
          mode: "in_context",
          totalTokens: 25,
          inContextDocs: [sampleDoc],
          citations: [],
        },
        role: "entrepreneur",
      });

      expect(result.mode).toBe("in_context");
      expect(result.cacheStatus).toBe("simulated");
      expect(result.cachedPromptUsed).toBe(false);
      expect(result.cachedTokens).toBe(0);
      expect(result.proposals.length).toBeGreaterThan(0);
    });

    it("construye el payload con cache_control en bloques de texto y procesa Cache Hit exitoso", async () => {
      process.env.OPENROUTER_API_KEY = "test-openrouter-key";
      process.env.CLAUDE_PROJECTS_MODEL = "anthropic/claude-sonnet-4.5";

      let capturedBody: Record<string, unknown> | null = null;

      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url, options?: RequestInit) => {
          capturedBody = JSON.parse(options?.body as string);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: "He revisado el contexto del proyecto y propongo validar las entrevistas.",
                  },
                },
              ],
              usage: {
                prompt_tokens: 1500,
                completion_tokens: 45,
                total_tokens: 1545,
                prompt_tokens_details: {
                  cached_tokens: 1420,
                  cache_write_tokens: 0,
                },
              },
            }),
          };
        }),
      );

      const result = await executeClaudeAgentTurn({
        project: dummyProject,
        userMessage: "Resumen de lo que tenemos validado",
        history: [],
        knowledge: {
          mode: "in_context",
          totalTokens: 25,
          inContextDocs: [sampleDoc],
          citations: [],
        },
        role: "entrepreneur",
      });

      // Validar estructura de cache_control en el payload
      expect(capturedBody).toBeDefined();
      expect(capturedBody).not.toBeNull();
      const body = capturedBody as unknown as {
        model: string;
        cache_control: { type: string };
        messages: Array<{ content: Array<{ cache_control?: { type: string } }> }>;
      };
      expect(body.model).toBe("anthropic/claude-sonnet-4.5");
      expect(body.cache_control).toEqual({ type: "ephemeral" });
      expect(Array.isArray(body.messages[0].content)).toBe(true);
      expect(body.messages[0].content[0].cache_control).toEqual({ type: "ephemeral" });

      // Validar métricas de Cache Hit
      expect(result.cachedPromptUsed).toBe(true);
      expect(result.cacheStatus).toBe("hit");
      expect(result.cachedTokens).toBe(1420);
      expect(result.reply).toContain("He revisado el contexto");
    });

    it("identifica Cache Write cuando se inicializa una nueva caché en el proveedor", async () => {
      process.env.OPENROUTER_API_KEY = "test-openrouter-key";

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: "Primera respuesta con caché recién escrita." } }],
            usage: {
              prompt_tokens: 1500,
              completion_tokens: 30,
              total_tokens: 1530,
              prompt_tokens_details: {
                cached_tokens: 0,
                cache_write_tokens: 1500,
              },
            },
          }),
        })),
      );

      const result = await executeClaudeAgentTurn({
        project: dummyProject,
        userMessage: "Hola agente",
        history: [],
        knowledge: {
          mode: "in_context",
          totalTokens: 25,
          inContextDocs: [sampleDoc],
          citations: [],
        },
        role: "entrepreneur",
      });

      expect(result.cachedPromptUsed).toBe(false);
      expect(result.cacheStatus).toBe("write");
      expect(result.cachedTokens).toBe(0);
    });

    it("cae a simulación si OpenRouter responde con error HTTP (ej. 429 cuota o 404 modelo)", async () => {
      process.env.OPENROUTER_API_KEY = "test-openrouter-key";

      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 429,
          text: async () => "Rate limit exceeded",
        })),
      );

      const result = await executeClaudeAgentTurn({
        project: dummyProject,
        userMessage: "Hola agente",
        history: [],
        knowledge: {
          mode: "in_context",
          totalTokens: 25,
          inContextDocs: [sampleDoc],
          citations: [],
        },
        role: "entrepreneur",
      });

      expect(result.cacheStatus).toBe("simulated");
      expect(result.cachedPromptUsed).toBe(false);
      expect(result.reply).toBeDefined();
    });
  });
});
