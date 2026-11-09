import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKEND, closeWorlds, world, type World } from "./helpers";
import { sampleIntakeBrief } from "./fixtures/b2b";
import type { MentorSession } from "@/types/domain";
import { SimulatedProvider } from "@/lib/ai/simulated";
import type { PostSessionSynthesisContext } from "@/lib/ai/provider";
import { createProjectAsMentor } from "@/lib/services/mentor-projects";
import {
  addClientCommitment,
  addKickoffGoal,
  confirmKickoffAgreement,
  getSessionRoomState,
  saveKickoffAgreement,
  saveLiveNotes,
  LIVE_NOTES_MAX,
} from "@/lib/services/session-room";
import { endCall, getCallTranscript, getSessionCallState, startCall, MESH_MAX_PARTICIPANTS } from "@/lib/services/session-calls";
import { closeSession } from "@/lib/services/mentoring";

/** `onSessionClosed` es de Dev B (cycle.ts): se reemplaza por un espía que se puede hacer fallar. */
const h = vi.hoisted(() => ({ closed: [] as string[], fail: null as Error | null }));
vi.mock("@/lib/services/cycle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/cycle")>()),
  onSessionClosed: async (_d: unknown, session: MentorSession) => {
    h.closed.push(session.id);
    if (h.fail) throw h.fail;
  },
}));
vi.mock("@/lib/services/notifications", () => ({ notify: async () => ({}) }));

afterAll(closeWorlds);
beforeEach(() => {
  vi.stubEnv("RAX_B2B_FLOW", "on");
  h.closed.length = 0;
  h.fail = null;
});
afterEach(() => vi.unstubAllEnvs());

const errorOf = (p: Promise<unknown>) => p.then(() => null, (e: { code?: string; message?: string }) => e);
const AT = "2026-11-09T10:00:00.000Z";

/** Proyecto B2B del mentor men1 con clientes que ya aceptaron (ent1, y ent2 en grupal) y una sesión. */
async function setup(opts: { mode?: "individual" | "group"; kind?: MentorSession["kind"]; ai?: SimulatedProvider } = {}) {
  const w: World = await world(opts.ai);
  const mode = opts.mode ?? "individual";
  const { project } = await createProjectAsMentor(w.as("men1"), { name: "Panadería La Espiga", description: "Pan de barrio", mode, clientEmails: [] });
  const clients = mode === "group" ? ["ent1", "ent2"] : ["ent1"];
  for (const c of clients) await w.repo.projectMembers.insert({ id: `${project.id}:${c}`, projectId: project.id, profileId: c, role: "client", createdAt: AT } as never);
  const session = await w.repo.mentorSessions.insert({
    id: "ses_1", projectId: project.id, mentorId: "men1", kind: opts.kind ?? "kickoff", status: "pending", createdAt: AT, sessionNumber: 1,
    agenda: [{ id: "t1", title: "Margen por producto", goal: "Saber qué deja dinero", status: "planned" }],
  });
  return { w, project, session, mentor: w.as("men1"), client: w.as("ent1") };
}

describe.skipIf(BACKEND === "pg")("sala de la sesión (Fase 3, Dev A)", () => {
  it("notas en vivo: solo el mentor de la sesión, con control de concurrencia", async () => {
    const { w, session, mentor, client } = await setup();
    const first = await saveLiveNotes(mentor, session.id, "Vende 300 panes al día", "");
    expect((await w.repo.mentorSessions.get(session.id))).toMatchObject({ liveNotes: "Vende 300 panes al día", liveNotesUpdatedAt: first.updatedAt });

    const second = await saveLiveNotes(mentor, session.id, "Vende 300 panes al día\n- caja", first.updatedAt);
    expect(second.updatedAt > first.updatedAt).toBe(true);
    // Otra pestaña con la marca vieja (o que cree que nunca se guardó): conflicto, no escribe.
    expect((await errorOf(saveLiveNotes(mentor, session.id, "pisado", first.updatedAt)))?.code).toBe("conflict");
    expect((await errorOf(saveLiveNotes(mentor, session.id, "pisado", "")))?.code).toBe("conflict");
    expect((await w.repo.mentorSessions.get(session.id))?.liveNotes).toBe("Vende 300 panes al día\n- caja");
    // Sin marca se sobrescribe.
    await saveLiveNotes(mentor, session.id, "a mano");

    expect((await errorOf(saveLiveNotes(client, session.id, "hola")))?.code).toBe("forbidden");
    expect((await errorOf(saveLiveNotes(w.as("men2"), session.id, "hola")))?.code).toBe("not_found");
    expect((await errorOf(saveLiveNotes(w.as("ent2"), session.id, "hola")))?.code).toBe("not_found");
    expect((await errorOf(saveLiveNotes(mentor, session.id, "x".repeat(LIVE_NOTES_MAX + 1))))?.code).toBe("validation");

    await w.repo.mentorSessions.update(session.id, { status: "completed" });
    expect((await errorOf(saveLiveNotes(mentor, session.id, "tarde")))?.code).toBe("validation");
  });

  it("el mentor ve notas, brief y contexto; el cliente no", async () => {
    const { w, project, session, mentor, client } = await setup();
    await saveLiveNotes(mentor, session.id, "Privado del mentor");
    await w.repo.projects.update(project.id, { clientContext: "Tiene un socio." });
    await w.repo.intakeBriefs.insert({
      id: "ib_1", projectId: project.id, clientId: "ent1", status: "submitted", guideSnapshot: [], coverage: {}, brief: sampleIntakeBrief(), createdAt: AT, updatedAt: AT,
    });

    const forMentor = await getSessionRoomState(mentor, session.id);
    expect(forMentor.viewer).toBe("mentor");
    expect(forMentor.liveNotes?.text).toBe("Privado del mentor");
    expect(forMentor.briefs?.map((b) => b.clientName)).toEqual(["Emprendedora Uno"]);
    expect(forMentor.clientContext).toBe("Tiene un socio.");
    expect(forMentor.session.agenda).toHaveLength(1);
    expect(forMentor.clients).toEqual([{ id: "ent1", name: "Emprendedora Uno" }]);

    const forClient = await getSessionRoomState(client, session.id);
    expect(forClient.viewer).toBe("client");
    expect(forClient).not.toHaveProperty("liveNotes");
    expect(forClient).not.toHaveProperty("briefs");
    expect(forClient).not.toHaveProperty("clientContext");
    expect(JSON.stringify(forClient)).not.toContain("Privado del mentor");
    expect(forClient.mentorName).toBe("Mentora Asignada");

    expect((await errorOf(getSessionRoomState(w.as("ent2"), session.id)))?.code).toBe("not_found");
  });

  it("acuerdo de la Sesión 1: borrador solo para el mentor, confirmado visible para el cliente", async () => {
    const { session, mentor, client } = await setup();
    const input = { scope: "Ordenar la caja y el margen por producto", clientCommitments: "Anotar ventas diarias", mentorCommitments: "Revisar números cada semana", frequency: "weekly" as const, sessionDurationMinutes: 60, expectedDurationWeeks: 12 };
    expect((await errorOf(saveKickoffAgreement(client, session.id, input)))?.code).toBe("forbidden");
    expect((await errorOf(saveKickoffAgreement(mentor, session.id, { ...input, scope: "corto" })))?.code).toBe("validation");
    expect((await errorOf(confirmKickoffAgreement(mentor, session.id)))?.code).toBe("validation");

    const draft = await saveKickoffAgreement(mentor, session.id, input);
    expect(draft.status).toBe("draft");
    await addKickoffGoal(mentor, session.id, { title: "Caja ordenada", targetResult: "Cierre de caja diario" });
    expect((await getSessionRoomState(mentor, session.id)).agreement?.id).toBe(draft.id);
    // El cliente no ve el borrador ni los objetivos hasta que se confirme.
    expect(await getSessionRoomState(client, session.id)).toMatchObject({ agreement: undefined, goals: [] });

    const active = await confirmKickoffAgreement(mentor, session.id);
    expect(active.status).toBe("active");
    const seen = await getSessionRoomState(client, session.id);
    expect(seen.agreement).toMatchObject({ id: draft.id, status: "active", scope: input.scope });
    expect(seen.goals.map((g) => g.title)).toEqual(["Caja ordenada"]);

    // Una versión nueva reemplaza a la vigente al confirmarse.
    const v2 = await saveKickoffAgreement(mentor, session.id, { ...input, scope: "Caja, margen y precios nuevos" });
    expect(v2.id).not.toBe(draft.id);
    expect((await getSessionRoomState(client, session.id)).agreement?.id).toBe(draft.id);
    await confirmKickoffAgreement(mentor, session.id);
    expect((await getSessionRoomState(client, session.id)).agreement?.scope).toBe("Caja, margen y precios nuevos");
  });

  it("el acuerdo se registra solo en la Sesión 1", async () => {
    const { session, mentor } = await setup({ kind: "follow_up" });
    const err = await errorOf(saveKickoffAgreement(mentor, session.id, { scope: "Algo bastante largo", clientCommitments: "", mentorCommitments: "", frequency: "weekly", sessionDurationMinutes: 60, expectedDurationWeeks: 4 }));
    expect(err?.code).toBe("validation");
  });

  it("grupal: compromisos por persona como tareas asignadas a cada cliente", async () => {
    const { w, project, session, mentor, client } = await setup({ mode: "group" });
    expect((await errorOf(addClientCommitment(mentor, session.id, { title: "Sin persona" })))?.code).toBe("validation");
    expect((await errorOf(addClientCommitment(mentor, session.id, { clientId: "ent9", title: "Ajeno" })))?.code).toBe("not_found");
    expect((await errorOf(addClientCommitment(mentor, session.id, { clientId: "ent1", title: "Algo", dueDate: "mañana" })))?.code).toBe("validation");
    expect((await errorOf(addClientCommitment(client, session.id, { clientId: "ent1", title: "Me lo pongo yo" })))?.code).toBe("forbidden");

    const a = await addClientCommitment(mentor, session.id, { clientId: "ent1", title: "Anotar ventas diarias", dueDate: "2026-11-16" });
    const b = await addClientCommitment(mentor, session.id, { clientId: "ent2", title: "Cotizar harina" });
    expect(a).toMatchObject({ projectId: project.id, assigneeId: "ent1", dueDate: "2026-11-16" });
    expect(b.assigneeId).toBe("ent2");
    expect((await w.repo.tasks.list({ projectId: project.id })).map((t) => t.assigneeId).sort()).toEqual(["ent1", "ent2"]);

    const room = await getSessionRoomState(client, session.id);
    expect(room.commitments.map((c) => `${c.assigneeName}: ${c.title}`)).toEqual(["Emprendedora Uno: Anotar ventas diarias", "Emprendedor Dos: Cotizar harina"]);
    expect(room.project.mode).toBe("group");
  });

  it("individual: el compromiso va a la única persona sin elegirla", async () => {
    const { session, mentor } = await setup();
    expect((await addClientCommitment(mentor, session.id, { title: "Anotar ventas" })).assigneeId).toBe("ent1");
  });
});

describe.skipIf(BACKEND === "pg")("llamada de la sesión con clientes (malla B2B)", () => {
  it("el cliente entra, ve la llamada en malla de hasta 4 y no la cierra; el mentor sí", async () => {
    const { w, session, mentor, client } = await setup({ mode: "group" });
    const state = await getSessionCallState(client, session.id, { available: false, transcribe: async () => "" });
    expect(state).toMatchObject({ canCall: true, mesh: true, maxParticipants: MESH_MAX_PARTICIPANTS, hostId: "men1" });
    expect(state.iceServers.length).toBeGreaterThan(0);

    const call = await startCall(client, session.id);
    expect((await startCall(w.as("ent2"), session.id)).id).toBe(call.id);
    expect((await getCallTranscript(client, call.id)).segments).toEqual([]);
    expect((await errorOf(startCall(w.as("men2"), session.id)))?.code).toBe("not_found");

    expect((await errorOf(endCall(client, call.id)))?.code).toBe("forbidden");
    const ended = await endCall(mentor, call.id, { synthesize: false });
    expect(ended.call.status).toBe("ended");
  });

  it("con la bandera apagada el cliente B2B no entra y la llamada sigue siendo 1:1", async () => {
    const { session, mentor, client } = await setup();
    vi.stubEnv("RAX_B2B_FLOW", "");
    expect((await errorOf(startCall(client, session.id)))?.code).toBeTruthy();
    const state = await getSessionCallState(mentor, session.id, { available: false, transcribe: async () => "" });
    expect(state).toMatchObject({ mesh: false, maxParticipants: 2 });
  });
});

describe.skipIf(BACKEND === "pg")("cierre de la sesión con notas en vivo (Fase 3, Dev A)", () => {
  class SpyProvider extends SimulatedProvider {
    contexts: PostSessionSynthesisContext[] = [];
    override async generatePostSessionSynthesis(ctx: PostSessionSynthesisContext) {
      this.contexts.push(ctx);
      return super.generatePostSessionSynthesis(ctx);
    }
  }

  it("la síntesis usa las notas en vivo y el cierre avisa al motor del ciclo", async () => {
    const ai = new SpyProvider();
    const { w, session, mentor } = await setup({ ai });
    await saveLiveNotes(mentor, session.id, "Acordamos medir el margen del pan dulce.");
    const closed = await closeSession(mentor, session.id, { summary: "Primera sesión hecha" });
    expect(closed.status).toBe("completed");
    expect(ai.contexts).toHaveLength(1);
    expect(ai.contexts[0].sessionNotes.map((n) => n.body).join("\n")).toContain("Acordamos medir el margen del pan dulce.");
    expect((await w.repo.mentorSessions.get(session.id))?.postSessionSynthesis?.basedOn).toBe("notes");
    expect(h.closed).toEqual([session.id]);
  });

  it("si onSessionClosed falla, la sesión queda cerrada igual", async () => {
    const { session, mentor } = await setup();
    h.fail = new Error("stub");
    const closed = await closeSession(mentor, session.id, {});
    expect(closed.status).toBe("completed");
    expect(h.closed).toEqual([session.id]);
  });

  it("con la bandera apagada no lee notas en vivo ni llama al ciclo", async () => {
    const ai = new SpyProvider();
    const { w, session, mentor } = await setup({ ai });
    await saveLiveNotes(mentor, session.id, "Notas que no deben usarse");
    vi.stubEnv("RAX_B2B_FLOW", "");
    await closeSession(mentor, session.id, {});
    expect(ai.contexts).toHaveLength(0);
    expect((await w.repo.mentorSessions.get(session.id))?.postSessionSynthesis).toBeUndefined();
    expect(h.closed).toEqual([]);
  });
});
