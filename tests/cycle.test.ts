import { beforeEach, describe, expect, it } from "vitest";
import type { MentorSession, Profile, Project } from "@/types/domain";
import type { ServiceDeps } from "@/lib/services/base";
import type { Repository } from "@/lib/data/repository";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import { SimulatedProvider } from "@/lib/ai/simulated";
import { isDomainError } from "@/lib/errors";
import {
  advanceCycleStage,
  canAdvance,
  confirmAttendance,
  cycleSignalsForBriefing,
  getCycleOverview,
  onIntakeSubmitted,
  onSessionClosed,
  scheduleCycleSession,
  updateSessionAgenda,
} from "@/lib/services/cycle";
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

/* ───────────── Fase 3 ───────────── */

async function closeSession(id: string, patch: Partial<MentorSession> = {}) {
  return repo.mentorSessions.update(id, { status: "completed", completedAt: new Date(Date.parse(AT) + ++tick * 1000).toISOString(), ...patch });
}

async function seedAgreement() {
  await repo.mentorshipRelations.insert({
    id: "rel_1", projectId: "prj_panaderia", entrepreneurId: CAMI.id, mentorId: MARA.id, stage: "agreement", compatibilityStatus: "proceed", version: 1, createdAt: AT, updatedAt: AT,
  });
  await repo.mentorshipAgreements.insert({
    id: "agr_1", relationId: "rel_1", version: 1, frequency: "biweekly", sessionDurationMinutes: 60, authorizedChannels: [], scope: "Ordenar los números del negocio",
    mentorCommitments: "Revisar avances", entrepreneurCommitments: "Llevar registro diario de ventas", confidentialityTerms: "", expectedDurationWeeks: 12, status: "active", confirmedAt: AT, createdAt: AT,
  });
  await repo.mentorshipGoals.insert({
    id: "goal_1", relationId: "rel_1", title: "Conocer el margen por producto", description: "", whyItMatters: "Decidir qué vender", kind: "metric", baseline: "",
    targetResult: "Margen de los 5 productos principales", priority: "high", status: "active", version: 1, createdAt: AT, updatedAt: AT,
  });
}

describe("agenda de una sesión", () => {
  it("el mentor la edita y valida; el cliente no; una sesión cerrada no cambia", async () => {
    const k = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: TOPICS });
    await updateSessionAgenda(as(MARA), k.id, [{ ...TOPICS[0], status: "covered" }, { id: "", title: " Precios ", goal: "", status: "planned" }]);
    const agenda = (await repo.mentorSessions.get(k.id))!.agenda!;
    expect(agenda.map((t) => [t.title, t.status])).toEqual([["Margen por producto", "covered"], ["Precios", "planned"]]);
    expect(await code(updateSessionAgenda(as(MARA), k.id, "nada" as never))).toBe("validation");
    expect(await code(updateSessionAgenda(as(MARA), k.id, [{ id: "x", title: "T", goal: "", status: "hecho" as never }]))).toBe("validation");
    expect(await code(updateSessionAgenda(as(CAMI), k.id, []))).toBe("forbidden");
    expect(await code(updateSessionAgenda(as(OTHER_MENTOR), k.id, []))).toBe("not_found");
    await closeSession(k.id);
    expect(await code(updateSessionAgenda(as(MARA), k.id, []))).toBe("validation");
  });
});

describe("onSessionClosed", () => {
  it("cerrar la Sesión 1 pasa el proyecto a cycle y sugiere la Sesión 2 con el acuerdo, los objetivos y la síntesis", async () => {
    await seedAgreement();
    const k = await scheduleCycleSession(as(MARA), "prj_panaderia", {
      kind: "kickoff",
      scheduledAt: FUTURE,
      agenda: [...TOPICS, { id: "t2", title: "Caja", goal: "", status: "covered" }],
    });
    const closed = await closeSession(k.id, {
      postSessionSynthesis: {
        generatedAt: AT,
        summary: "Acordamos ordenar los números.",
        agreedDecisions: ["Registrar ventas"],
        entrepreneurCommitments: [{ title: "Anotar ventas diarias" }],
        mentorCommitments: [],
        nextSteps: "Traer el registro de dos semanas",
      },
    });
    const next = await onSessionClosed(as(MARA), closed);
    expect((await project()).cycleStage).toBe("cycle");
    expect(next).toMatchObject({ kind: "follow_up", status: "pending", sessionNumber: 2, mentorId: MARA.id });
    expect(next!.scheduledAt).toBeUndefined();
    expect(next!.agenda!.map((t) => t.title)).toEqual([
      "Margen por producto",
      "Avance: Conocer el margen por producto",
      "Compromisos del acuerdo",
      "Compromisos de la Sesión 1",
      "Próximos pasos de la Sesión 1",
    ]);
    expect(next!.agenda!.every((t) => t.status === "planned")).toBe(true);
    // En la Sesión 1 lo no cubierto queda «carried_over»; lo cubierto, igual.
    expect((await repo.mentorSessions.get(k.id))!.agenda!.map((t) => t.status)).toEqual(["carried_over", "covered"]);
    const [n] = await listNotifications(as(CAMI));
    expect(n).toMatchObject({ kind: "session_closed", payload: { projectId: "prj_panaderia", sessionId: k.id, nextSessionId: next!.id, sessionNumber: 1 } });
  });

  it("es idempotente: no duplica la sesión, los temas ni el aviso", async () => {
    const k = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: TOPICS });
    const closed = await closeSession(k.id);
    const a = await onSessionClosed(as(MARA), closed);
    const b = await onSessionClosed(as(MARA), closed);
    expect(b!.id).toBe(a!.id);
    expect(b!.agenda).toEqual(a!.agenda);
    expect(await sessions()).toHaveLength(2);
    expect((await listNotifications(as(CAMI))).filter((x) => x.kind === "session_closed")).toHaveLength(1);
    const audits = await repo.auditEvents.list({ projectId: "prj_panaderia", action: "project.status_changed" });
    expect(audits.filter((e) => e.meta?.cycleStageTo === "cycle")).toHaveLength(1);
  });

  it("al cerrar un seguimiento pasa los temas no cubiertos a la próxima sesión pendiente (o la crea)", async () => {
    await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: [] });
    await advanceCycleStage(as(MARA), "prj_panaderia", "cycle");
    const s2 = await scheduleCycleSession(as(MARA), "prj_panaderia", {
      kind: "follow_up",
      scheduledAt: FUTURE,
      agenda: [
        { id: "a", title: "Precios", goal: "", status: "planned" },
        { id: "b", title: "Proveedores", goal: "", status: "planned" },
      ],
    });
    const s3 = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "follow_up", scheduledAt: "", agenda: [{ id: "c", title: "proveedores", goal: "", status: "planned" }] });
    await updateSessionAgenda(as(MARA), s2.id, [
      { id: "a", title: "Precios", goal: "", status: "covered" },
      { id: "b", title: "Proveedores", goal: "", status: "planned" },
    ]);
    const next = await onSessionClosed(as(MARA), await closeSession(s2.id));
    expect(next!.id).toBe(s3.id);
    // «Proveedores» ya estaba (mismo título): no se repite.
    expect(next!.agenda!.map((t) => t.title)).toEqual(["proveedores"]);
    expect((await repo.mentorSessions.get(s2.id))!.agenda!.map((t) => t.status)).toEqual(["covered", "carried_over"]);

    await updateSessionAgenda(as(MARA), s3.id, [
      { id: "c", title: "Proveedores", goal: "", status: "planned" },
      { id: "d", title: "Local nuevo", goal: "", status: "covered" },
    ]);
    const after = await onSessionClosed(as(MARA), await closeSession(s3.id));
    expect(after).toMatchObject({ kind: "follow_up", sessionNumber: 4, status: "pending" });
    expect(after!.agenda!.map((t) => [t.id, t.title, t.status])).toEqual([["c", "Proveedores", "planned"]]);
  });

  it("la sesión sugerida se agenda sin duplicarla", async () => {
    const k = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: TOPICS });
    const suggested = await onSessionClosed(as(MARA), await closeSession(k.id));
    const s = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "follow_up", scheduledAt: FUTURE, agenda: [] });
    expect(s.id).toBe(suggested!.id);
    expect(s).toMatchObject({ scheduledAt: FUTURE, sessionNumber: 2, agenda: suggested!.agenda });
    expect(await sessions()).toHaveLength(2);
    const other = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "follow_up", scheduledAt: FUTURE, agenda: [] });
    expect(other.sessionNumber).toBe(3);
    expect(await code(scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "follow_up", scheduledAt: FUTURE, agenda: [], sessionId: k.id }))).toBe("not_found");
  });

  it("no hace nada con sesiones abiertas ni proyectos del flujo viejo; otro mentor no puede", async () => {
    const k = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: [] });
    expect(await onSessionClosed(as(MARA), k)).toBeNull();
    const closed = await closeSession(k.id);
    expect(await code(onSessionClosed(as(OTHER_MENTOR), closed))).toBe("not_found");
    await repo.projects.update("prj_panaderia", { mentorId: undefined });
    expect(await onSessionClosed(as(MARA), closed)).toBeNull();
    expect(await sessions()).toHaveLength(1);
  });

  it("con el ciclo cerrado marca los temas pero no sugiere otra sesión", async () => {
    const k = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: TOPICS });
    await advanceCycleStage(as(MARA), "prj_panaderia", "cycle");
    await advanceCycleStage(as(MARA), "prj_panaderia", "closed");
    expect(await onSessionClosed(as(MARA), await closeSession(k.id))).toBeNull();
    expect(await sessions()).toHaveLength(1);
    expect((await repo.mentorSessions.get(k.id))!.agenda![0].status).toBe("carried_over");
  });
});

describe("asistencia y vista del ciclo", () => {
  it("el cliente confirma asistencia (una vez) y el mentor recibe el aviso", async () => {
    const pending = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: "", agenda: [] });
    expect(await code(confirmAttendance(as(CAMI), pending.id))).toBe("validation");
    const k = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: [] });
    const first = await confirmAttendance(as(CAMI), k.id);
    const again = await confirmAttendance(as(CAMI), k.id);
    expect(again.confirmedAt).toBe(first.confirmedAt);
    expect(await code(confirmAttendance(as(BETO), k.id))).toBe("not_found");
    expect(await code(confirmAttendance(as(MARA), k.id))).toBe("not_found");
    expect((await listNotifications(as(MARA))).filter((n) => n.kind === "session_confirmed")).toHaveLength(1);
    const o = await getCycleOverview(as(MARA), "prj_panaderia");
    expect(o.viewer).toBe("mentor");
    expect(o.sessions[0].attendance).toEqual([CAMI.id]);
  });

  it("el cliente ve sus compromisos y el acuerdo confirmado, nunca briefings, notas en vivo ni borradores", async () => {
    await seedAgreement();
    const k = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: TOPICS });
    await repo.mentorSessions.update(k.id, { liveNotes: "nota privada del mentor" });
    await repo.tasks.insert({ id: "tk1", projectId: "prj_panaderia", title: "Anotar ventas", assigneeId: CAMI.id, status: "todo", createdAt: AT, updatedAt: AT });
    await repo.tasks.insert({ id: "tk2", projectId: "prj_panaderia", title: "Otra", assigneeId: MARA.id, status: "todo", createdAt: AT, updatedAt: AT });
    const o = await getCycleOverview(as(CAMI), "prj_panaderia");
    expect(o.viewer).toBe("client");
    expect(o.nextSession?.id).toBe(k.id);
    expect(JSON.stringify(o)).not.toContain("nota privada");
    expect(o.commitments.map((t) => t.id)).toEqual(["tk1"]);
    expect(o.agreement?.entrepreneurCommitments).toBe("Llevar registro diario de ventas");
    expect(o.goals).toHaveLength(1);
    expect(o.intake).toEqual([{ clientId: CAMI.id, name: CAMI.name, status: "not_started" }]);
    await repo.mentorshipAgreements.update("agr_1", { status: "draft" });
    const draft = await getCycleOverview(as(CAMI), "prj_panaderia");
    expect(draft.agreement).toBeUndefined();
    expect(draft.goals).toEqual([]);
    expect((await getCycleOverview(as(MARA), "prj_panaderia")).agreement?.status).toBe("draft");
    expect(await code(getCycleOverview(as(BETO), "prj_panaderia"))).toBe("not_found");
  });
});

describe("señales para el briefing", () => {
  it("comentarios nuevos del cliente y resultados de evaluaciones desde la sesión anterior", async () => {
    const k = await scheduleCycleSession(as(MARA), "prj_panaderia", { kind: "kickoff", scheduledAt: FUTURE, agenda: [] });
    await repo.comments.insert({ id: "c_old", projectId: "prj_panaderia", targetType: "document", targetId: "doc1", authorId: CAMI.id, body: "antes", createdAt: "2026-11-09T09:00:00.000Z" });
    await closeSession(k.id);
    const later = "2026-11-10T09:00:00.000Z";
    await repo.comments.insert({ id: "c_new", projectId: "prj_panaderia", targetType: "session", targetId: k.id, authorId: CAMI.id, body: "¿Qué traigo?", createdAt: later });
    await repo.comments.insert({ id: "c_mentor", projectId: "prj_panaderia", targetType: "document", targetId: "doc1", authorId: MARA.id, body: "del mentor", createdAt: later });
    await repo.comments.insert({ id: "c_dx", projectId: "prj_panaderia", targetType: "hypothesis", targetId: "h1", authorId: CAMI.id, body: "viejo", createdAt: later });
    const sig = await cycleSignalsForBriefing(as(MARA), "prj_panaderia");
    expect(sig).toEqual({ newComments: [{ targetType: "session", targetId: k.id, authorId: CAMI.id, body: "¿Qué traigo?", createdAt: later }], assessmentResults: [] });

    await repo.assessments.insert({ id: "asm1", projectId: "prj_panaderia", createdBy: MARA.id, title: "Margen", instructions: "", questions: [], status: "published", createdAt: AT });
    await repo.assessmentSubmissions.insert({ id: "sub1", assessmentId: "asm1", clientId: CAMI.id, answers: [], status: "reviewed", score: 8, createdAt: later, submittedAt: later, reviewedAt: later });
    await repo.assessmentSubmissions.insert({ id: "sub2", assessmentId: "asm1", clientId: BETO.id, answers: [], status: "draft", createdAt: later });
    const withResults = await cycleSignalsForBriefing(as(MARA), "prj_panaderia");
    expect(withResults.assessmentResults).toEqual([{ assessmentId: "asm1", title: "Margen", clientId: CAMI.id, status: "reviewed", score: 8 }]);
    expect((await cycleSignalsForBriefing(as(MARA), "prj_panaderia", { since: "2000-01-01T00:00:00.000Z" })).newComments).toHaveLength(2);
    expect(await code(cycleSignalsForBriefing(as(CAMI), "prj_panaderia"))).toBe("forbidden");
  });
});
