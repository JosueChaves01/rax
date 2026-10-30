import { afterEach, describe, expect, it } from "vitest";
import { dispatchEventToN8n, invokeSyncChatN8n } from "@/lib/n8n/dispatcher";

describe("n8n staging gates", () => {
  const oldEventsGate = process.env.RAX_N8N_EVENTS_ENABLED;
  const oldAgentGate = process.env.RAX_N8N_MAIN_AGENT_ENABLED;

  afterEach(() => {
    if (oldEventsGate === undefined) delete process.env.RAX_N8N_EVENTS_ENABLED;
    else process.env.RAX_N8N_EVENTS_ENABLED = oldEventsGate;
    if (oldAgentGate === undefined) delete process.env.RAX_N8N_MAIN_AGENT_ENABLED;
    else process.env.RAX_N8N_MAIN_AGENT_ENABLED = oldAgentGate;
  });

  it("does not send event calls before staging verification", async () => {
    delete process.env.RAX_N8N_EVENTS_ENABLED;
    const result = await dispatchEventToN8n({
      eventId: "event-1",
      eventType: "task.proposals_requested",
      occurredAt: new Date().toISOString(),
      schemaVersion: "1.0.0",
      correlationId: "corr-1",
      actor: { id: "actor-1", role: "entrepreneur", verified: true },
      projectId: "project-1",
      entityType: "project",
      entityId: "project-1",
      payload: {},
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(result.error).toContain("deshabilitada");
  });

  it("does not invoke the main agent before staging verification", async () => {
    delete process.env.RAX_N8N_MAIN_AGENT_ENABLED;
    const result = await invokeSyncChatN8n({} as never);
    expect(result).toMatchObject({ ok: false });
    expect(result.error).toContain("deshabilitado");
  });
});
