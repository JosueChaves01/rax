import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { appendAgentAssistantMessage, appendAgentUserMessage, createAgentThread, listProjectThreads } from "@/lib/services/agent-chat";
import {
  archiveAgentThread,
  createAgentSession,
  GENERAL_SESSION_TITLE,
  listProjectSessions,
  updateAgentSession,
} from "@/lib/services/agent-sessions";
import { runAgentTurn } from "@/lib/services/agent-turn";

afterAll(closeWorlds);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Proyecto → Sesión → Hilo", () => {
  it("agrupa los hilos en sesiones y mueve los hilos sueltos a «Sesión general»", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Huerta", description: "Kits de huerta", nature: "exploring_idea" });

    const loose = await createAgentThread(ent, project.id, "Hilo viejo");
    const pricing = await createAgentSession(ent, project.id, { title: "Precios", goal: "Definir el precio del kit" });
    const t1 = await createAgentThread(ent, project.id, "Costos", pricing.id);
    const t2 = await createAgentThread(ent, project.id, "Competencia", pricing.id);

    const view = await listProjectSessions(ent, project.id);
    expect(view.supported).toBe(true);
    const general = view.sessions.find((s) => s.title === GENERAL_SESSION_TITLE);
    expect(general?.threads.map((t) => t.id)).toEqual([loose.id]);
    const p = view.sessions.find((s) => s.id === pricing.id);
    expect(p?.threads.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());

    // La segunda vez no crea otra sesión general.
    const again = await listProjectSessions(ent, project.id);
    expect(again.sessions.filter((s) => s.title === GENERAL_SESSION_TITLE)).toHaveLength(1);
  });

  it("solo quien creó la sesión la ve y la puede usar", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const other = w.as("ent2");
    const project = await createProject(ent, { name: "Taller", description: "x", nature: "unknown" });
    const session = await createAgentSession(ent, project.id, { title: "Mía" });
    await expect(updateAgentSession(other, session.id, { title: "Ajena" })).rejects.toThrow();
  });

  it("renombra, archiva sesiones y archiva hilos sin borrar mensajes", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Bicis", description: "x", nature: "unknown" });
    const s = await createAgentSession(ent, project.id, { title: "Plan" });
    const t = await createAgentThread(ent, project.id, "Uno", s.id);
    await appendAgentUserMessage(ent, t.id, "Hola");

    const renamed = await updateAgentSession(ent, s.id, { title: "Plan de lanzamiento", goal: "Lanzar en marzo" });
    expect(renamed.title).toBe("Plan de lanzamiento");
    expect(renamed.goal).toBe("Lanzar en marzo");

    await archiveAgentThread(ent, t.id);
    const view = await listProjectSessions(ent, project.id);
    expect(view.sessions.find((x) => x.id === s.id)?.threads).toHaveLength(0);
    expect((await listProjectThreads(ent, project.id)).some((x) => x.id === t.id)).toBe(false);
    expect(await w.repo.agentMessages.list({ threadId: t.id })).toHaveLength(1);

    const archived = await updateAgentSession(ent, s.id, { status: "archived" });
    expect(archived.status).toBe("archived");
  });

  it("el agente ve la sesión y sus otros hilos, y puede guardar notas en la sesión", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Café", description: "Café de especialidad", nature: "designing_solution" });
    const s = await createAgentSession(ent, project.id, { title: "Precios", goal: "Fijar precio por bolsa" });
    const other = await createAgentThread(ent, project.id, "Costos", s.id);
    await appendAgentUserMessage(ent, other.id, "El costo por bolsa es de 3 dólares");
    await appendAgentAssistantMessage(ent, other.id, { content: "Anotado: costo 3 dólares por bolsa." });
    const current = await createAgentThread(ent, project.id, "Precio final", s.id);

    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    const bodies: Array<{ messages: Array<{ role: string; content: unknown }>; tools?: Array<{ function: { name: string } }> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        bodies.push(body);
        const message =
          bodies.length === 1
            ? {
                content: "",
                tool_calls: [
                  {
                    id: "c1",
                    type: "function",
                    function: {
                      name: "update_session_notes",
                      arguments: JSON.stringify({ add_decisions: ["Precio de 8 dólares por bolsa"], next_steps: ["Probar el precio con 5 clientes"] }),
                    },
                  },
                ],
              }
            : { content: "Listo, quedó anotado en la sesión." };
        return new Response(JSON.stringify({ model: "m", choices: [{ message }] }), { status: 200 });
      }),
    );

    const turn = await runAgentTurn(ent, { projectId: project.id, threadId: current.id, message: "Decidí cobrar 8 dólares, anótalo" });
    const systemText = JSON.stringify(bodies[0].messages[0].content);
    expect(systemText).toContain("<session_state");
    expect(systemText).toContain("Fijar precio por bolsa");
    expect(systemText).toContain("Costos");
    expect(systemText).toContain("costo 3 dólares");
    expect(bodies[0].tools?.map((t) => t.function.name)).toEqual(expect.arrayContaining(["update_session_notes", "read_session_thread"]));
    expect(turn.result.sessionUpdated).toBe(true);

    const saved = await w.repo.agentSessions.get(s.id);
    expect(saved?.notes?.decisions).toEqual(["Precio de 8 dólares por bolsa"]);
    expect(saved?.notes?.nextSteps).toEqual(["Probar el precio con 5 clientes"]);
  });

  it("sin IA, «anota que…» igual guarda la nota en la sesión", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const project = await createProject(ent, { name: "Pan", description: "Panadería", nature: "exploring_idea" });
    const s = await createAgentSession(ent, project.id, { title: "Clientes" });
    const t = await createAgentThread(ent, project.id, "Uno", s.id);
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const turn = await runAgentTurn(ent, { projectId: project.id, threadId: t.id, message: "Anota que los clientes prefieren pan integral" });
    expect(turn.result.sessionUpdated).toBe(true);
    expect((await w.repo.agentSessions.get(s.id))?.notes?.decisions).toEqual(["los clientes prefieren pan integral"]);
  });
});
