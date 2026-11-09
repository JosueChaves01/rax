import { beforeEach, describe, expect, it } from "vitest";
import type { Profile, Project } from "@/types/domain";
import type { ServiceDeps } from "@/lib/services/base";
import type { Repository } from "@/lib/data/repository";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { SimulatedProvider } from "@/lib/ai/simulated";
import { isDomainError } from "@/lib/errors";
import { advanceCycleStage, canAdvance, onIntakeSubmitted, scheduleCycleSession } from "@/lib/services/cycle";
import { listNotifications } from "@/lib/services/notifications";
import { B2B_PEOPLE } from "./fixtures/b2b";

/** Fase 2 · motor del ciclo: etapa explícita, kickoff pendiente sin fecha y agenda del mentor. */

const AT = "2026-11-09T10:00:00.000Z";
const FUTURE = "2026-11-20T15:00:00.000Z";
const [MARA, CAMI, BETO] = B2B_PEOPLE;
const OTHER_MENTOR: Profile = { id: "u_otro", name: "Otro Mentor", email: "otro@demo.rax", role: "mentor", mentorStatus: "approved", onboardedAt: AT, createdAt: AT };
const TOPICS = [{ id: "t1", title: "Margen por producto", goal: "Saber qué deja dinero", status: "planned" as const }];

let repo: Repository;
let tick = 0;
const as = (actor: Profile): ServiceDeps => ({
  repo,
  ai: new SimulatedProvider(),
  actor,
  now: () => new Date(Date.parse(AT) + ++tick * 1000).toISOString(),
  newId: (p) => `${p}_${++tick}`,
});
const code = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (isDomainError(e) ? e.code : String(e)));
const project = async () => (await repo.projects.get("prj_panaderia"))!;
const sessions = () => repo.mentorSessions.list({ projectId: "prj_panaderia" });

async function seed(mode: Project["mode"] = "individual", clients: Profile[] = [CAMI]) {
  repo = createMemoryRepository();
  for (const p of [...B2B_PEOPLE, OTHER_MENTOR]) await repo.profiles.insert(p);
  await repo.projects.insert({
    id: "prj_panaderia", mentorId: MARA.id, mode, cycleStage: "intake", name: "Panadería La Espiga", description: "",
    nature: "operating_business", status: "active", shareConversationWithMentor: false, createdAt: AT, updatedAt: AT,
  } as unknown as Project);
  for (const c of clients) await repo.projectMembers.insert({ id: `prj_panaderia:${c.id}`, projectId: "prj_panaderia", profileId: c.id, role: "client", createdAt: AT });
}

async function submitted(clientId: string) {
  await repo.intakeBriefs.insert({ id: `ib_${clientId}`, projectId: "prj_panaderia", clientId, status: "submitted", guideSnapshot: [], coverage: {}, createdAt: AT, updatedAt: AT });
}

beforeEach(async () => {
  tick = 0;
  await seed();
});

describe("etapa del ciclo", () => {
  it("solo avanza de a una etapa y hacia adelante", () => {
    expect(canAdvance("intake", "kickoff")).toBe(true);
    expect(canAdvance("kickoff", "cycle")).toBe(true);
    expect(canAdvance("cycle", "closed")).toBe(true);
    expect(canAdvance("intake", "cycle")).toBe(false);
    expect(canAdvance("closed", "cycle")).toBe(false);
    expect(canAdvance("cycle", "kickoff")).toBe(false);
  });

  it("advanceCycleStage: lo usa el mentor del proyecto, valida la transición y audita", async () => {
    expect(await code(advanceCycleStage(as(MARA), "prj_panaderia", "cycle"))).toBe("validation");
    await advanceCycleStage(as(MARA), "prj_panaderia", "kickoff");
    await advanceCycleStage(as(MARA), "prj_panaderia", "kickoff"); // misma etapa: no hace nada
    expect((await project()).cycleStage).toBe("kickoff");
    expect(await code(advanceCycleStage(as(CAMI), "prj_panaderia", "cycle"))).toBe("forbidden");
    expect(await code(advanceCycleStage(as(OTHER_MENTOR), "prj_panaderia", "cycle"))).toBe("not_found");
    expect(await code(advanceCycleStage(as(MARA), "prj_panaderia", "nada" as never))).toBe("validation");
    const events = await repo.auditEvents.list({ projectId: "prj_panaderia", action: "project.status_changed" });
    expect(events.map((e) => e.meta)).toEqual([{ cycleStageFrom: "intake", cycleStageTo: "kickoff" }]);
  });
});

describe("kickoff pendiente al enviar el intake", () => {
  it("crea la Sesión 1 sin fecha (scheduled_at vacío) y pasa a kickoff; es idempotente", async () => {
    expect(await onIntakeSubmitted(as(CAMI), "prj_panaderia", TOPICS)).toBeNull(); // todavía no envió
    await submitted(CAMI.id);
    const k = await onIntakeSubmitted(as(CAMI), "prj_panaderia", TOPICS);
    expect(k).toMatchObject({ kind: "kickoff", status: "pending", mentorId: MARA.id, sessionNumber: 1, agenda: TOPICS });
    expect(k!.scheduledAt).toBeUndefined();
    expect(k!.confirmedAt).toBeUndefined();
    expect((await project()).cycleStage).toBe("kickoff");
    await onIntakeSubmitted(as(CAMI), "prj_panaderia", TOPICS);
    expect(await sessions()).toHaveLength(1);
  });

  it("solo lo dispara un cliente del proyecto; en grupo espera a que envíen todos", async () => {
    expect(await code(onIntakeSubmitted(as(BETO), "prj_panaderia", TOPICS))).toBe("not_found");
    await seed("group", [CAMI, BETO]);
    await submitted(CAMI.id);
    expect(await onIntakeSubmitted(as(CAMI), "prj_panaderia", TOPICS)).toBeNull();
    expect((await project()).cycleStage).toBe("intake");
    await submitted(BETO.id);
    expect(await onIntakeSubmitted(as(BETO), "prj_panaderia", TOPICS)).not.toBeNull();
    expect((await project()).cycleStage).toBe("kickoff");
  });
});

describe("agendar sesiones del ciclo", () => {
  it("el mentor le pone fecha a la kickoff pendiente (sin duplicarla), queda confirmada y avisa al cliente", async () => {
    await submitted(CAMI.id);
    const pending = await onIntakeSubmitted(as(CAMI), "prj_panaderia", TOPICS);
    const s = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: [] });
    expect(s.id).toBe(pending!.id);
    expect(s).toMatchObject({ scheduledAt: FUTURE, agenda: TOPICS, sessionNumber: 1 });
    expect(s.confirmedAt).toBeDefined();
    expect(await sessions()).toHaveLength(1);
    const [n] = await listNotifications(as(CAMI));
    expect(n).toMatchObject({ kind: "session_scheduled", payload: { projectId: "prj_panaderia", sessionId: s.id, scheduledAt: FUTURE } });
  });

  it("kickoff sin intake abre la etapa; seguimiento numera la sesión; valida fecha y permisos", async () => {
    expect(await code(scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "follow_up", scheduledAt: FUTURE, agenda: [] }))).toBe("validation");
    expect(await code(scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: "2020-01-01T10:00:00.000Z", agenda: [] }))).toBe("validation");
    expect(await code(scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: "2026-11-20", agenda: [] }))).toBe("validation");
    expect(await code(scheduleCycleSession(as(CAMI), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: [] }))).toBe("forbidden");

    const k = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: "", agenda: [{ id: "", title: "  Acuerdos  ", goal: "", status: "planned" }] });
    expect(k.scheduledAt).toBeUndefined();
    expect(k.agenda?.[0]).toMatchObject({ title: "Acuerdos", status: "planned" });
    expect(k.agenda?.[0].id).toBeTruthy();
    expect((await project()).cycleStage).toBe("kickoff");

    const f = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "follow_up", scheduledAt: FUTURE, agenda: TOPICS });
    expect(f).toMatchObject({ kind: "follow_up", sessionNumber: 2, mentorId: MARA.id });
    const f2 = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "follow_up", scheduledAt: FUTURE, agenda: [] });
    expect(f2.sessionNumber).toBe(3);
  });
});
