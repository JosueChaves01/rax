import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { BACKEND, closeWorlds, world } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import { createAgentThread } from "@/lib/services/agent-chat";
import { runAgentTurn } from "@/lib/services/agent-turn";
import { buildProjectState } from "@/lib/ai/project-state";
import { buildSystemPrompt } from "@/lib/ai/claude-orchestrator";
import { renderPlatformGuide } from "@/lib/ai/platform-guide";
import { EMPTY_MEMORY, foldDeterministic, messagesToFold, recentHistory, THREAD_WINDOW } from "@/lib/ai/thread-memory";
import type { AgentMessage } from "@/types/domain";

afterAll(closeWorlds);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const emptyKnowledge = { mode: "in_context" as const, totalTokens: 0, inContextDocs: [], citations: [] };

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

describe("el agente conoce la plataforma", () => {
  it("la guía cambia según el rol y nombra las pantallas reales", () => {
    const ent = renderPlatformGuide("entrepreneur");
    const men = renderPlatformGuide("mentor");
    const adm = renderPlatformGuide("admin");
    for (const g of [ent, men]) {
      expect(g).toContain("«Entender»");
      expect(g).toContain("«Decidir»");
      expect(g).toContain("/validacion");
    }
    expect(ent).toContain("/app/chat");
    expect(ent).not.toContain("/app/exploracion");
    expect(ent).not.toContain("/app/admin");
    expect(men).toContain("/app/mentor");
    expect(men).toContain("Aprobar, devolver o descartar hipótesis");
    expect(adm).toContain("/app/admin");
    expect(adm).not.toContain("/conversacion");
  });
});

describe("estado del proyecto armado en el servidor", () => {
  it("resume etapa, siguiente paso, mentor y permisos de quien conversa", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Café de barrio", description: "Cafetería con tostado propio", nature: "exploring_idea" });
    await assignMentor(w.as("adm"), project.id, w.id("men1"));

    const ownerView = buildProjectState(await getWorkspace(ent, project.id), "entrepreneur", "2026-10-31T00:00:00.000Z");
    expect(ownerView.stage.label).toBe("Entender");
    expect(ownerView.next.text.length).toBeGreaterThan(10);
    expect(ownerView.mentors).toEqual(["Mentora Asignada"]);
    expect(ownerView.permissions).toContain("diagnosis.confirm_summary");

    const mentorView = buildProjectState(await getWorkspace(w.as("men1"), project.id), "mentor", "2026-10-31T00:00:00.000Z");
    expect(mentorView.viewerIsMentor).toBe(true);
    expect(mentorView.permissions).toContain("hypothesis.approve");
    expect(mentorView.permissions).not.toContain("diagnosis.confirm_summary");

    const prompt = buildSystemPrompt(project, emptyKnowledge, "mentor", undefined, { projectState: mentorView });
    expect(prompt).toContain("<platform_guide>");
    expect(prompt).toContain("Etapa actual: Entender");
    expect(prompt).toContain("Mentor/es: Mentora Asignada");
    expect(prompt).toContain("hypothesis.approve");
  });
});

describe("memoria del hilo", () => {
  it("manda completos los mensajes recientes, sin fallos y sin lo ya resumido", () => {
    const messages = [msg(1, "user"), msg(2, "assistant"), msg(3, "user"), msg(4, "assistant", { status: "failed", content: "La IA no respondió" }), msg(5, "assistant")];
    expect(recentHistory(messages, EMPTY_MEMORY).map((m) => m.content)).toEqual(["Pregunta 1", "Respuesta 2", "Pregunta 3", "Respuesta 5"]);
    const covered = { ...EMPTY_MEMORY, coveredMessageCount: 2 };
    expect(recentHistory(messages, covered).map((m) => m.content)).toEqual(["Pregunta 3", "Respuesta 5"]);
  });

  it("anota en el historial qué propuestas ofreció el agente", () => {
    const history = recentHistory([msg(1, "user"), msg(2, "assistant", { proposals: [{ type: "task", title: "Llamar a 5 clientes" }] })], EMPTY_MEMORY);
    expect(history[1].content).toContain("task: Llamar a 5 clientes");
  });

  it("pliega los mensajes viejos solo cuando la conversación supera la ventana", () => {
    const short = Array.from({ length: THREAD_WINDOW.foldAbove }, (_, i) => msg(i, i % 2 ? "assistant" : "user"));
    expect(messagesToFold(short, EMPTY_MEMORY)).toEqual([]);
    const long = Array.from({ length: THREAD_WINDOW.foldAbove + 4 }, (_, i) => msg(i, i % 2 ? "assistant" : "user"));
    const folded = messagesToFold(long, EMPTY_MEMORY);
    expect(folded).toHaveLength(long.length - THREAD_WINDOW.keepRecent);
    const next = foldDeterministic(EMPTY_MEMORY, folded, "2026-10-31T00:00:00.000Z");
    expect(next.coveredMessageCount).toBe(folded.length);
    expect(next.summary).toContain("Persona: Pregunta 0");
    expect(messagesToFold(long, next)).toEqual([]);
  });

  it("un hilo largo guarda su memoria y la usa en el siguiente turno", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Huerta urbana", description: "Kits de cultivo", nature: "exploring_idea" });
    const thread = await createAgentThread(ent, project.id, "Precios");

    // Sin clave: simulación y pliegue determinista.
    vi.stubEnv("OPENROUTER_API_KEY", "");
    for (let i = 0; i < 11; i++) {
      await runAgentTurn(ent, { projectId: project.id, threadId: thread.id, message: `Dato ${i}: vendo kits a vecinos del barrio` });
    }
    const saved = await w.repo.agentThreads.get(thread.id);
    expect(saved?.memory?.coveredMessageCount).toBeGreaterThan(0);
    expect(saved?.memory?.summary).toContain("Dato 0");

    // Con clave: el modelo recibe el estado del proyecto, la memoria y solo los mensajes recientes.
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    const bodies: Array<{ messages: Array<{ role: string; content: unknown }> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        bodies.push(JSON.parse(options?.body as string));
        return new Response(JSON.stringify({ model: "m", choices: [{ message: { content: "Retomo lo que me contaste." } }] }), { status: 200 });
      }),
    );
    const turn = await runAgentTurn(ent, { projectId: project.id, threadId: thread.id, message: "¿Qué sabemos hasta ahora?" });
    expect(turn.result.reply).toBe("Retomo lo que me contaste.");
    const [system, ...rest] = bodies[0].messages;
    const systemText = JSON.stringify(system.content);
    expect(systemText).toContain("<project_state>");
    expect(systemText).toContain("Huerta urbana");
    expect(systemText).toContain("Dato 0");
    expect(rest.map((m) => String(m.content)).join("\n")).not.toContain("Dato 0:");
    expect(rest.at(-1)?.content).toBe("¿Qué sabemos hasta ahora?");
  });
});

describe("herramientas en dos pasos", () => {
  it("ejecuta la herramienta y deja que el modelo redacte la respuesta final", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Taller de bicis", description: "Reparación a domicilio", nature: "designing_solution" });
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    const bodies: Array<{ messages: Array<{ role: string; content: unknown }>; tool_choice?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        bodies.push(body);
        const message = bodies.length === 1
          ? { content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "propose_tasks", arguments: JSON.stringify({ tasks: [{ title: "Encuestar a 10 ciclistas" }] }) } }] }
          : { content: "Te propongo una tarea para empezar: encuestar a 10 ciclistas." };
        return new Response(JSON.stringify({ model: "m", choices: [{ message }] }), { status: 200 });
      }),
    );
    const turn = await runAgentTurn(ent, { projectId: project.id, message: "Armame un plan" });
    expect(turn.result.proposals.map((p) => p.title)).toEqual(["Encuestar a 10 ciclistas"]);
    expect(turn.result.reply).toBe("Te propongo una tarea para empezar: encuestar a 10 ciclistas.");
    expect(bodies).toHaveLength(2);
    expect(bodies[1].messages.some((m) => m.role === "tool")).toBe(true);
    // Puede encadenar otra herramienta si la necesita; la última vuelta ya no ofrece herramientas.
    expect(bodies[1].tool_choice).toBe("auto");
    expect(turn.assistantMessage?.proposals).toHaveLength(1);
    expect(turn.assistantMessage?.metrics).toMatchObject({ model: "m", tools: ["propose_tasks"], modelCalls: 2 });
  });

  it("encadena varias vueltas de herramientas y la última redacta sin herramientas", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Taller de bicis", description: "Reparación a domicilio", nature: "designing_solution" });
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    const bodies: Array<{ tool_choice?: string; tools?: unknown[] }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        bodies.push(body);
        // Pide herramientas mientras se las ofrezcan; sin herramientas, responde.
        const message = body.tool_choice === "none"
          ? { content: "Listo, te dejé tres tareas." }
          : { content: "", tool_calls: [{ id: `c${bodies.length}`, type: "function", function: { name: "propose_tasks", arguments: JSON.stringify({ tasks: [{ title: `Tarea ${bodies.length}` }] }) } }] };
        return new Response(JSON.stringify({ model: "m", choices: [{ message }] }), { status: 200 });
      }),
    );
    const turn = await runAgentTurn(ent, { projectId: project.id, message: "Armame un plan" });
    expect(bodies.map((b) => b.tool_choice ?? "-")).toEqual(["-", "auto", "auto", "none"]);
    expect(turn.result.proposals.map((p) => p.title)).toEqual(["Tarea 1", "Tarea 2", "Tarea 3"]);
    expect(turn.result.reply).toBe("Listo, te dejé tres tareas.");
  });

  it("ejecuta en paralelo herramientas distintas pedidas en la misma vuelta", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Taller de bicis", description: "Reparación a domicilio", nature: "designing_solution" });
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        const message = calls === 1
          ? {
              content: "",
              tool_calls: [
                { id: "a", type: "function", function: { name: "propose_tasks", arguments: JSON.stringify({ tasks: [{ title: "Encuestar" }] }) } },
                { id: "b", type: "function", function: { name: "propose_tasks", arguments: JSON.stringify({ tasks: [{ title: "Llamar" }] }) } },
              ],
            }
          : { content: "Hecho." };
        return new Response(JSON.stringify({ model: "m", choices: [{ message }] }), { status: 200 });
      }),
    );
    const turn = await runAgentTurn(ent, { projectId: project.id, message: "Armame un plan" });
    // El orden de las propuestas respeta el orden en que el modelo las pidió.
    expect(turn.result.proposals.map((p) => p.title)).toEqual(["Encuestar", "Llamar"]);
  });

  it("si la IA no responde, el turno queda como fallo visible y sin propuestas inventadas", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Taller", description: "x", nature: "unknown" });
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: 503, message: "down" } }), { status: 503 })));
    const turn = await runAgentTurn(ent, { projectId: project.id, message: "Hola" });
    expect(turn.assistantMessage?.status).toBe("failed");
    expect(turn.assistantMessage?.proposals).toEqual([]);
    expect(turn.result.unavailable?.message).toContain("no respondió");
  });
});

describe("proyectos con armado incompleto", () => {
  it.skipIf(BACKEND === "pg")("un proyecto sin diagnóstico no rompe el espacio de trabajo: se repara", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "A medias", description: "x", nature: "unknown" });
    const [dx] = await w.repo.diagnoses.list({ projectId: project.id });
    // Simula un armado que falló antes de crear el diagnóstico.
    (w.repo.diagnoses as unknown as { rows?: Map<string, unknown> }).rows?.delete(dx.id);
    expect(await w.repo.diagnoses.list({ projectId: project.id })).toHaveLength(0);
    const ws = await getWorkspace(ent, project.id);
    expect(ws.phase).toBe("new");
    expect(await w.repo.diagnoses.list({ projectId: project.id })).toHaveLength(1);
  });
});
