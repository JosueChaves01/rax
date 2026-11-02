import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import { scheduleSession } from "@/lib/services/mentoring";
import { createAgentThread } from "@/lib/services/agent-chat";
import { runAgentTurn } from "@/lib/services/agent-turn";
import { endCall, startCall, synthesizeEndedCall, transcribeCallAudio } from "@/lib/services/session-calls";
import { addProjectDocument } from "@/lib/services/project-knowledge";
import { getProjectKnowledgeContext } from "@/lib/ai/knowledge-retrieval";
import { chatWithFallback, orderByHealth, resetModelHealth } from "@/lib/ai/openrouter-chat";
import { visibleStreamText } from "@/lib/ai/stream-text";
import { EMPTY_MEMORY, recentHistory } from "@/lib/ai/thread-memory";
import type { AgentTurnEvent } from "@/lib/ai/claude-orchestrator";
import type { Transcriber } from "@/lib/ai/transcription";
import type { AgentMessage } from "@/types/domain";

afterAll(closeWorlds);
beforeEach(() => resetModelHealth());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const msg = (i: number, author: "user" | "assistant", extra: Partial<AgentMessage> = {}): AgentMessage => ({
  id: `m${i}`,
  threadId: "t",
  projectId: "p",
  author,
  authorId: "u",
  content: `${author === "user" ? "Pregunta" : "Respuesta"} ${i}`,
  proposals: [],
  status: "complete",
  createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(),
  ...extra,
});

/** Respuesta SSE como la de OpenRouter con `stream: true`. */
function sseResponse(events: unknown[]): Response {
  const body = events.map((e) => `data: ${typeof e === "string" ? e : JSON.stringify(e)}\n\n`).join("") + ": OPENROUTER PROCESSING\n\ndata: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("ventana reciente sin leer el hilo entero", () => {
  it("con el total de mensajes, la cola del hilo da el mismo historial que el hilo completo", () => {
    const all = Array.from({ length: 30 }, (_, i) => msg(i, i % 2 === 0 ? "user" : "assistant"));
    const memory = { ...EMPTY_MEMORY, coveredMessageCount: 16 };
    const full = recentHistory(all, memory);
    expect(recentHistory(all.slice(-20), memory, all.length)).toEqual(full);
    // Pocos pendientes: no se cuelan mensajes ya resumidos aunque estén en la cola leída.
    const mostlyCovered = { ...EMPTY_MEMORY, coveredMessageCount: 26 };
    expect(recentHistory(all.slice(-20), mostlyCovered, all.length).map((m) => m.content)).toEqual(["Pregunta 26", "Respuesta 27", "Pregunta 28", "Respuesta 29"]);
  });
});

describe("modelos: plazo, enfriamiento y streaming", () => {
  it("un modelo que dio 429 se prueba al final en los turnos siguientes", async () => {
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    const tried: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        const { model } = JSON.parse(options?.body as string) as { model: string };
        tried.push(model);
        if (model === "a") return new Response(JSON.stringify({ error: { code: 429, message: "rate limited upstream" } }), { status: 429 });
        return new Response(JSON.stringify({ model, choices: [{ message: { content: "hola" } }] }), { status: 200 });
      }),
    );
    const first = await chatWithFallback({ apiKey: "k", messages: [{ role: "user", content: "x" }], models: ["a", "b"] });
    expect(first.ok).toBe(true);
    expect(first.trace.failedModels).toEqual(["a"]);
    expect(orderByHealth(["a", "b"])).toEqual(["b", "a"]);
    tried.length = 0;
    await chatWithFallback({ apiKey: "k", messages: [{ role: "user", content: "x" }], models: ["a", "b"] });
    expect(tried).toEqual(["b"]);
  });

  it("sin tiempo para otro intento se rinde con un aviso claro en vez de esperar", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await chatWithFallback({ apiKey: "k", messages: [{ role: "user", content: "x" }], models: ["a"], deadline: Date.now() + 1000 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe("timeout");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("un modelo que no responde a tiempo se corta y pasa al siguiente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        const { model } = JSON.parse(options?.body as string) as { model: string };
        if (model === "lento") {
          return new Promise<Response>((_, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
        }
        return new Response(JSON.stringify({ model, choices: [{ message: { content: "rápido" } }] }), { status: 200 });
      }),
    );
    const res = await chatWithFallback({ apiKey: "k", messages: [{ role: "user", content: "x" }], models: ["lento", "rapido"], timeoutMs: 50 });
    expect(res.ok && res.completion.content).toBe("rápido");
    expect(res.trace.failedModels).toEqual(["lento"]);
  });

  it("lee el streaming: entrega el texto por partes y junta las llamadas a herramientas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          { model: "m", choices: [{ delta: { content: "Ho" } }] },
          { model: "m", choices: [{ delta: { content: "la" } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "propose_tasks", arguments: '{"tasks":' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "[]}" } }] } }] },
          { choices: [], usage: { prompt_tokens: 10, completion_tokens: 3 } },
        ]),
      ),
    );
    const parts: string[] = [];
    const res = await chatWithFallback({ apiKey: "k", messages: [{ role: "user", content: "x" }], models: ["m"], onDelta: (t) => parts.push(t) });
    expect(parts).toEqual(["Ho", "la"]);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.completion.content).toBe("Hola");
      expect(res.completion.toolCalls).toEqual([{ id: "c1", type: "function", function: { name: "propose_tasks", arguments: '{"tasks":[]}' } }]);
      expect(res.completion.usage?.completion_tokens).toBe(3);
    }
  });

  it("si el modelo falla a mitad del streaming, descarta lo mostrado y prueba el siguiente", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        const { model } = JSON.parse(options?.body as string) as { model: string };
        if (model === "a") return sseResponse([{ choices: [{ delta: { content: "Empie" } }] }, { error: { code: 502, message: "upstream" } }]);
        return sseResponse([{ model: "b", choices: [{ delta: { content: "Completo" } }] }]);
      }),
    );
    let shown = "";
    const res = await chatWithFallback({
      apiKey: "k",
      messages: [{ role: "user", content: "x" }],
      models: ["a", "b"],
      onDelta: (t) => (shown += t),
      onReset: () => (shown = ""),
    });
    expect(res.ok && res.completion.content).toBe("Completo");
    expect(shown).toBe("Completo");
  });

  it("no muestra a medias los bloques de sugerencias ni de artefactos", () => {
    expect(visibleStreamText("Hola, esto es todo.\n\n<sugerencias>\n- Otra")).toBe("Hola, esto es todo.");
    expect(visibleStreamText("Texto <sug")).toBe("Texto");
    expect(visibleStreamText("Mira <antArtifact identifier=")).toBe("Mira");
    expect(visibleStreamText("Si a < b entonces")).toBe("Si a < b entonces");
  });
});

describe("turno del agente en vivo", () => {
  it("avisa el mensaje guardado, el estado y el texto parcial, y guarda métricas", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Taller de bicis", description: "Reparación a domicilio", nature: "designing_solution" });
    const thread = await createAgentThread(ent, project.id, "Plan");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          { model: "m", choices: [{ delta: { content: "Empecemos por " } }] },
          { model: "m", choices: [{ delta: { content: "tus clientes.\n<sugerencias>\n- ¿Cómo los encuentro?\n</sugerencias>" } }] },
          { choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } },
        ]),
      ),
    );
    const events: AgentTurnEvent[] = [];
    const turn = await runAgentTurn(ent, { projectId: project.id, threadId: thread.id, message: "¿Por dónde empiezo?", onEvent: (e) => events.push(e) });
    expect(events[0]).toMatchObject({ type: "user_message", message: { content: "¿Por dónde empiezo?" } });
    expect(events.some((e) => e.type === "status")).toBe(true);
    expect(events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("")).toContain("Empecemos por tus clientes.");
    expect(turn.assistantMessage?.content).toBe("Empecemos por tus clientes.");
    expect(turn.result.followUps).toEqual(["¿Cómo los encuentro?"]);
    expect(turn.assistantMessage?.metrics).toMatchObject({ model: "m", modelCalls: 1, promptTokens: 100, completionTokens: 20, streamed: true, tools: [] });
    expect(turn.assistantMessage?.metrics?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("corta con un aviso cuando la persona pasa el límite diario de mensajes", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Taller de bicis", description: "Reparación a domicilio", nature: "designing_solution" });
    const thread = await createAgentThread(ent, project.id, "Plan");
    vi.stubEnv("RAX_AI_DAILY_MESSAGES", "2");
    await runAgentTurn(ent, { projectId: project.id, threadId: thread.id, message: "uno" });
    await runAgentTurn(ent, { projectId: project.id, threadId: thread.id, message: "dos" });
    await expect(runAgentTurn(ent, { projectId: project.id, threadId: thread.id, message: "tres" })).rejects.toMatchObject({ code: "rate_limited" });
    // Otra persona no comparte el límite.
    const other = w.as("ent2");
    const p2 = await createProject(other, { name: "Otra idea", description: "Algo distinto", nature: "designing_solution" });
    await expect(runAgentTurn(other, { projectId: p2.id, message: "hola" })).resolves.toBeDefined();
  });
});

describe("conocimiento con búsqueda en la base", () => {
  it("usa la búsqueda de la base cuando existe y cae a los fragmentos recientes si no encuentra nada", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Huerta", description: "Huerta urbana", nature: "designing_solution" });
    const doc = await addProjectDocument(ent, project.id, { title: "Clientes", filename: "clientes.md", content: "Los clientes pagan por suscripción. ".repeat(40), fileType: "markdown" });
    const [chunk] = await w.repo.projectDocumentChunks.list({ documentId: doc.id });
    const search = vi.fn(async () => [{ chunk, score: 0.9 }]);
    w.repo.fn.searchChunks = search;
    const found = await getProjectKnowledgeContext(w.repo, project.id, "¿Cuánto pagan los clientes?", { threshold: 5 });
    expect(search).toHaveBeenCalledWith(project.id, "¿Cuánto pagan los clientes?", 8);
    expect(found.mode).toBe("rag");
    expect(found.retrievedChunks?.[0].score).toBe(0.9);

    w.repo.fn.searchChunks = async () => [];
    const recent = await getProjectKnowledgeContext(w.repo, project.id, "¿qué sigue?", { threshold: 5 });
    expect(recent.retrievedChunks?.length).toBeGreaterThan(0);

    // Si la función no existe en la base (migración sin aplicar), se usa el ranking en memoria.
    w.repo.fn.searchChunks = async () => {
      throw new Error("function search_project_chunks does not exist");
    };
    const fallback = await getProjectKnowledgeContext(w.repo, project.id, "clientes suscripción", { threshold: 5 });
    expect(fallback.retrievedChunks?.[0].score).toBeGreaterThan(0);
  });
});

describe("colgar sin esperar la síntesis", () => {
  it("cuelga al instante y la síntesis se genera en un pedido aparte", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const mentor = w.as("men1");
    const p = await createProject(ent, { name: "CaféRuta", description: "Café de especialidad en ruta", nature: "operating_business" });
    await assignMentor(w.as("adm"), p.id, w.id("men1"));
    const session = await scheduleSession(ent, p.id, { kind: "follow_up", scheduledAt: "2026-11-05T15:00:00.000Z" });
    const call = await startCall(mentor, session.id);
    const t: Transcriber = { available: true, transcribe: async () => "Voy a entrevistar a diez oficinas antes del viernes." };
    await transcribeCallAudio(ent, call.id, { data: new Blob([new Uint8Array([1])], { type: "audio/webm" }), filename: "f.webm" }, 0, t);

    await expect(synthesizeEndedCall(ent, call.id)).rejects.toMatchObject({ code: "validation" });
    const res = await endCall(ent, call.id, { synthesize: false });
    expect(res.synthesisPending).toBe(true);
    expect(res.synthesis).toBeUndefined();
    const synthesis = await synthesizeEndedCall(ent, call.id);
    expect(synthesis.basedOn).toBe("transcript");
    expect(synthesis.entrepreneurCommitments.map((c) => c.title).join(" ")).toContain("entrevistar a diez oficinas");
  });
});
