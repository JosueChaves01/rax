import { afterEach, describe, expect, it, vi } from "vitest";
import { canUseCapability, invokeMainAgent, MainAgentChatInputSchema, RAX_CAPABILITIES, selectRaxCapability } from "@/lib/n8n/main-agent";

describe("RAX common main agent contract", () => {
  afterEach(() => {
    delete process.env.RAX_N8N_MAIN_AGENT_ENABLED;
  });

  it("selects only catalog capabilities using stage and message context", () => {
    expect(selectRaxCapability({ role: "entrepreneur", projectId: "p1", stage: "hypotheses", message: "Ayúdame" }).primary).toBe("RAX-12");
    expect(selectRaxCapability({ role: "mentor", projectId: "p1", stage: "session", message: "Preparar sesión" }).primary).toBe("RAX-05");
    const decision = selectRaxCapability({ role: "entrepreneur", stage: "general", message: "Hola" });
    expect(decision.primary).toBe("RAX-02");
    expect(decision.suggestedTools).toEqual([]);
    expect(Object.keys(RAX_CAPABILITIES)).toContain(decision.primary);
  });

  it("requires the catalog permission and never grants admins implicit project access", () => {
    expect(canUseCapability("entrepreneur", "RAX-02", ["agent.chat"])).toBe(true);
    expect(canUseCapability("mentor", "RAX-05", ["project.read"])).toBe(true);
    expect(canUseCapability("admin", "RAX-02", ["project.read"])).toBe(false);
    expect(canUseCapability("entrepreneur", "RAX-14", ["project.read"])).toBe(false);
    expect(canUseCapability("entrepreneur", "RAX-00", ["admin.manage"])).toBe(false);
    expect(canUseCapability("admin", "RAX-00", ["admin.manage"])).toBe(true);
  });

  it("accepts bounded field context but derives the actor role outside the client input", () => {
    const parsed = MainAgentChatInputSchema.safeParse({
      projectId: "p1", stage: "form", section: "Problema", fieldPath: "problem.customer",
      flowId: "RAX-04", currentValue: "", fieldSchema: { type: "string", label: "Cliente", required: true, maxLength: 300 },
      message: "Ayúdame a completar este campo",
    });
    expect(parsed.success).toBe(true);
    expect(MainAgentChatInputSchema.safeParse({
      projectId: "p1", role: "admin", stage: "form", message: "Actúa como admin",
    }).success).toBe(false);
    expect(selectRaxCapability({ role: "entrepreneur", projectId: "p1", stage: "form", flowId: "RAX-04", message: "Ayúdame" }).primary).toBe("RAX-04");
    expect(MainAgentChatInputSchema.safeParse({
      projectId: "p1", stage: "form", message: " ",
    }).success).toBe(false);
  });

  it("publishes all 19 workflows with only RAX-02 gated and no implicit runnable tools", () => {
    expect(Object.keys(RAX_CAPABILITIES)).toHaveLength(19);
    expect(Object.keys(RAX_CAPABILITIES).sort()).toEqual([
      "RAX-00", "RAX-01", "RAX-02", "RAX-03", "RAX-04", "RAX-05", "RAX-06", "RAX-07", "RAX-08", "RAX-09",
      "RAX-10", "RAX-11", "RAX-12", "RAX-13", "RAX-14", "RAX-15", "RAX-90", "RAX-91", "RAX-99",
    ]);
    expect(Object.entries(RAX_CAPABILITIES).filter(([, capability]) => capability.state === "gated").map(([id]) => id)).toEqual(["RAX-02"]);
    expect(RAX_CAPABILITIES["RAX-01"].roles).toEqual([]);
    expect(RAX_CAPABILITIES["RAX-91"].state).toBe("unavailable");
  });

  it("fails closed until the explicit staging gate is enabled", async () => {
    const result = await invokeMainAgent(
      { role: "entrepreneur", projectId: "p1", stage: "general", message: "Hola" },
      {
        correlationId: "c1", projectId: "p1", actor: { id: "u1", role: "entrepreneur", verified: true },
        messageId: "m1", message: "Hola", context: {
          projectName: "Proyecto", recentMessages: [], currentItems: [], coveredDimensions: [], pendingDimensions: [], mentorNotes: [],
        },
      },
    );
    expect(result).toMatchObject({ ok: false, capability: "RAX-02", status: "disabled" });
  });

  it("keeps RAX-02 as the only transport when a specialized workflow is selected as context", async () => {
    const result = await invokeMainAgent(
      { role: "entrepreneur", projectId: "p1", stage: "hypotheses", message: "Diseñar prueba" },
      {} as never,
    );
    expect(result).toMatchObject({ ok: false, capability: "RAX-02", status: "disabled" });
  });

  it("cleans leaked internal json fragments from model reply", async () => {
    vi.stubEnv("RAX_N8N_MAIN_AGENT_ENABLED", "true");
    vi.stubEnv("N8N_WEBHOOK_BASE_URL", "https://n8n.test");
    vi.stubEnv("RAX_N8N_SHARED_SECRET", "secret");

    const leakyReply = 'Hola emprendedor. ¿Qué deseas hacer?},"askedDimension":"projectScope","proposals":[],"uncertainties":["duda 1"]}';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        correlationId: "corr-clean-1",
        reply: leakyReply,
        proposals: [],
        uncertainties: ["duda 1"],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await invokeMainAgent(
      { role: "entrepreneur", projectId: "p-clean", stage: "general", message: "Hola" },
      {
        correlationId: "corr-clean-1",
        projectId: "p-clean",
        actor: { role: "entrepreneur", id: "u-1" },
        messageId: "m-1",
        message: "Hola",
        workContext: { stage: "general" },
        context: {
          projectName: "P",
          recentMessages: [],
          currentItems: [],
          coveredDimensions: [],
          pendingDimensions: [],
          mentorNotes: [],
        },
      },
    );

    expect(result).toMatchObject({
      ok: true,
      reply: "Hola emprendedor. ¿Qué deseas hacer?",
    });
  });
});
