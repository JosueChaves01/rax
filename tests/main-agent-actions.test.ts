import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";

const { getDepsMock } = vi.hoisted(() => ({ getDepsMock: vi.fn() }));
vi.mock("@/lib/runtime", () => ({ getDeps: getDepsMock, homeFor: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { loadMainAgentThreadAction, sendMainAgentMessageAction, sendMessageAction } from "@/app/actions";

afterAll(closeWorlds);

describe("acciones del chat persistente del agente", () => {
  let fixture: Awaited<ReturnType<typeof world>>;
  let deps: ReturnType<Awaited<ReturnType<typeof world>>["as"]>;
  let projectId: string;

  beforeEach(async () => {
    fixture = await world();
    deps = fixture.as("ent1");
    getDepsMock.mockResolvedValue(deps);
    const project = await createProject(deps, { name: "Chat", description: "Proyecto de acción", nature: "unknown" });
    projectId = project.id;
  });

  it("sin n8n, RAX-02 usa el agente nativo y guarda el turno en el hilo de la persona", async () => {
    const result = await sendMainAgentMessageAction({ projectId, stage: "conversation", message: "¿Qué sigue?" });
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data) return;
    expect(result.data).toMatchObject({ ok: true });
    if (!result.data.ok) return;
    // Responde con el estado real del proyecto, no con un texto genérico.
    expect(result.data.reply).toContain("Entender");
    const loaded = await loadMainAgentThreadAction(projectId);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || !loaded.data) return;
    const { messages } = loaded.data;
    expect(messages.map((m) => m.author)).toEqual(["user", "assistant"]);
    expect(messages[0].content).toBe("¿Qué sigue?");
    expect(messages[1].status).toBe("complete");
  });

  it("los borradores de campo no se guardan en el hilo de conversación", async () => {
    const result = await sendMainAgentMessageAction({
      projectId,
      stage: "form",
      fieldPath: "experiment.metric",
      fieldSchema: { type: "string", label: "Métrica" },
      message: "Proponé una métrica",
    });
    expect(result.ok).toBe(true);
    expect(await deps.repo.agentMessages.list({ projectId })).toHaveLength(0);
  });

  it("routes the legacy interview action through agent persistence without adding interview rows", async () => {
    const before = await deps.repo.messages.list({ projectId });
    const result = await sendMessageAction(projectId, "Consulta desde conversación");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.aiError).toBeNull();
    expect(await deps.repo.messages.list({ projectId })).toHaveLength(before.length);
    expect(await deps.repo.agentMessages.list({ projectId })).toHaveLength(2);
  });
});
