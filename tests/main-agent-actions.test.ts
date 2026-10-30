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

  it("persists project conversation before recording the gated RAX-02 result", async () => {
    const result = await sendMainAgentMessageAction({ projectId, stage: "conversation", message: "¿Qué sigue?" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ ok: false, capability: "RAX-02", status: "disabled" });
    const loaded = await loadMainAgentThreadAction(projectId);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || !loaded.data) return;
    const { thread, messages } = loaded.data;
    expect(thread?.status).toBe("error");
    expect(messages.map((m) => m.author)).toEqual(["user", "assistant"]);
    expect(messages[0].content).toBe("¿Qué sigue?");
    expect(messages[1]).toMatchObject({ status: "failed", errorCode: "agent_disabled" });
  });

  it("routes the legacy interview action through agent persistence without adding interview rows", async () => {
    const before = await deps.repo.messages.list({ projectId });
    const result = await sendMessageAction(projectId, "Consulta desde conversación");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.aiError).toContain("deshabilitado");
    expect(await deps.repo.messages.list({ projectId })).toHaveLength(before.length);
    expect(await deps.repo.agentMessages.list({ projectId })).toHaveLength(2);
  });
});
