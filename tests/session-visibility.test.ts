import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKEND, closeWorlds, world, type World } from "./helpers";
import type { MentorSession } from "@/types/domain";
import type { Repository } from "@/lib/data/repository";
import type { ServiceDeps } from "@/lib/services/base";
import { createProjectAsMentor } from "@/lib/services/mentor-projects";
import { clientSafeSession, listSessionsForViewer, loadSessionForAccessCheck } from "@/lib/services/session-visibility";
import { getSessionRoomState } from "@/lib/services/session-room";
import { getSessionCallState } from "@/lib/services/session-calls";
import { getWorkspace } from "@/lib/services/projects";

vi.mock("@/lib/services/notifications", () => ({ notify: async () => ({}) }));

afterAll(closeWorlds);
beforeEach(() => vi.stubEnv("RAX_B2B_FLOW", "on"));
afterEach(() => vi.unstubAllEnvs());

const AT = "2026-11-09T10:00:00.000Z";
const SECRET = {
  briefing: { secret: "brief" },
  preSessionBriefing: { secret: "prep" },
  postSessionSynthesis: { secret: "synth" },
} as unknown as Partial<MentorSession>;

/**
 * Como en Supabase desde 20261109000104: la persona cliente no lee `mentor_sessions` con su propia
 * identidad (RLS), pero el servidor sí como sistema.
 */
function underRls(d: ServiceDeps, full: Repository): ServiceDeps {
  const hidden = { ...full.mentorSessions, get: async () => undefined, list: async () => [] } as unknown as Repository["mentorSessions"];
  return { ...d, repo: { ...full, mentorSessions: hidden } as Repository, sys: full };
}

async function setup() {
  const w: World = await world();
  const { project } = await createProjectAsMentor(w.as("men1"), { name: "Taller", description: "x", mode: "individual", clientEmails: [] });
  await w.repo.projectMembers.insert({ id: `${project.id}:ent1`, projectId: project.id, profileId: "ent1", role: "client", createdAt: AT } as never);
  const session = await w.repo.mentorSessions.insert({
    id: "ses_v", projectId: project.id, mentorId: "men1", kind: "follow_up", status: "pending", createdAt: AT, sessionNumber: 2,
    agenda: [{ id: "t1", title: "Precios", status: "planned" }],
    decision: { value: "continue", justification: "Razón interna", decidedAt: AT },
    ...SECRET,
  } as MentorSession);
  return { w, project, session, client: underRls(w.as("ent1"), w.repo), mentor: w.as("men1") };
}

describe.skipIf(BACKEND === "pg")("lo que la persona cliente ve de las sesiones (Fase 5)", () => {
  it("clientSafeSession quita la preparación, la síntesis y la justificación del mentor", async () => {
    const { session } = await setup();
    const safe = clientSafeSession(session);
    expect(safe).toMatchObject({ id: "ses_v", sessionNumber: 2, status: "pending", agenda: session.agenda });
    expect(safe.briefing).toBeUndefined();
    expect(safe.preSessionBriefing).toBeUndefined();
    expect(safe.postSessionSynthesis).toBeUndefined();
    expect(safe.decision?.justification).toBe("");
  });

  it("la persona cliente lista sus sesiones sin datos del mentor; el mentor las ve completas", async () => {
    const { project, client, mentor } = await setup();
    const forClient = await listSessionsForViewer(client, project.id);
    expect(forClient.map((s) => s.id)).toEqual(["ses_v"]);
    expect(JSON.stringify(forClient)).not.toContain("prep");
    expect((await listSessionsForViewer(mentor, project.id))[0].preSessionBriefing).toBeDefined();

    const { sessions } = await getWorkspace(client, project.id);
    expect(sessions.map((s) => s.id)).toEqual(["ses_v"]);
    expect(JSON.stringify(sessions)).not.toContain("synth");
  });

  it("una persona ajena no recibe nada aunque el servidor lea como sistema", async () => {
    const { w, project, session } = await setup();
    const outsider = underRls(w.as("ent2"), w.repo);
    expect(await listSessionsForViewer(outsider, project.id)).toEqual([]);
    await expect(getSessionRoomState(outsider, session.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getSessionCallState(outsider, session.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("la sala y la llamada siguen abriendo para la persona cliente sin leer la tabla", async () => {
    const { session, client } = await setup();
    const room = await getSessionRoomState(client, session.id);
    expect(room.viewer).toBe("client");
    expect(room.session).toMatchObject({ id: "ses_v", sessionNumber: 2 });
    expect(JSON.stringify(room)).not.toContain("prep");
    const call = await getSessionCallState(client, session.id);
    expect(call.mesh).toBe(true);
  });

  it("con el flag apagado no se lee como sistema", async () => {
    vi.stubEnv("RAX_B2B_FLOW", "off");
    const { session, client, project } = await setup();
    expect(await loadSessionForAccessCheck(client, session.id)).toBeUndefined();
    expect(await listSessionsForViewer(client, project.id)).toEqual([]);
  });
});
