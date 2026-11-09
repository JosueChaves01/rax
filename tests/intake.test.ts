import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, Project } from "@/types/domain";
import type { ServiceDeps } from "@/lib/services/base";
import { createMemoryRepository } from "@/lib/data/memory-repository";
import type { Repository } from "@/lib/data/repository";
import { SimulatedProvider } from "@/lib/ai/simulated";
import { isDomainError } from "@/lib/errors";
import { B2B_PEOPLE, fakeBuildMentorContext, sampleMentorProfile } from "./fixtures/b2b";

vi.mock("@/lib/ai/mentor-context", () => ({ buildMentorContext: vi.fn(fakeBuildMentorContext) }));
vi.mock("@/lib/services/cycle", () => ({
  scheduleCycleSession: vi.fn(async () => {
    throw new Error("stub de Fase 0");
  }),
  advanceCycleStage: vi.fn(async () => undefined),
}));

const { buildGroupBrief, getIntakeState, getIntakeView, runIntakeTurn, submitIntake, recordIntakeAnswer } = await import("@/lib/services/intake");
const cycle = await import("@/lib/services/cycle");
const { CLIENT_TOOLS } = await import("@/lib/ai/tools/client");

const AT = "2026-11-09T10:00:00.000Z";
const [MARA, CAMI, BETO] = B2B_PEOPLE;
const OUTSIDER: Profile = { id: "u_ximena", name: "Ximena Ajena", email: "x@demo.rax", role: "entrepreneur", mentorStatus: "none", createdAt: AT };

let repo: Repository;
let tick = 0;
const as = (actor: Profile): ServiceDeps => ({
  repo,
  ai: new SimulatedProvider(),
  actor,
  now: () => new Date(Date.parse(AT) + ++tick * 1000).toISOString(),
  newId: (p) => `${p}_${++tick}`,
});

async function seed(mode: Project["mode"] = "individual", clients: Profile[] = [CAMI]) {
  repo = createMemoryRepository();
  for (const p of [...B2B_PEOPLE, OUTSIDER]) await repo.profiles.insert(p);
  const profile = sampleMentorProfile(MARA.id);
  await repo.mentorProfiles.insert({ ...profile, id: profile.mentorId });
  await repo.projects.insert({
    id: "prj_panaderia",
    ownerId: clients[0].id,
    mentorId: MARA.id,
    mode,
    cycleStage: "intake",
    name: "Panadería La Espiga",
    description: "",
    nature: "operating_business",
    status: "active",
    shareConversationWithMentor: false,
    createdAt: AT,
    updatedAt: AT,
  } as Project);
  for (const c of clients) await repo.projectMembers.insert({ id: `prj_panaderia:${c.id}`, projectId: "prj_panaderia", profileId: c.id, role: "client", createdAt: AT });
}

/** Responde la entrevista completa (simulación): la guía de ejemplo tiene 3 preguntas. */
async function answerAll(actor: Profile) {
  const d = as(actor);
  const opening = await runIntakeTurn(d, "prj_panaderia", "");
  expect(opening.reply).toContain("¿Qué vendes y a quién?");
  await runIntakeTurn(d, "prj_panaderia", "Vendemos pan artesanal y repostería a las familias del barrio, sobre todo por la mañana.");
  await runIntakeTurn(d, "prj_panaderia", "No sé si la repostería me deja dinero y a fin de mes la caja no alcanza para pagar a proveedores.");
  return runIntakeTurn(d, "prj_panaderia", "Unos dos millones de colones al mes, más o menos, según la temporada.");
}

const code = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (isDomainError(e) ? e.code : String(e)));

beforeEach(() => {
  tick = 0;
  vi.mocked(cycle.scheduleCycleSession).mockClear();
  vi.mocked(cycle.advanceCycleStage).mockClear();
});

describe("entrevista de intake (simulada)", () => {
  it("abre con saludo y una sola pregunta, y guarda la transcripción marcada por persona", async () => {
    await seed();
    const d = as(CAMI);
    const { reply, state, provider } = await runIntakeTurn(d, "prj_panaderia", "");
    expect(provider).toBe("simulated");
    expect(reply).toMatch(/¡Hola, Cami!/);
    expect(reply.match(/¿/g)).toHaveLength(1);
    expect(reply).toContain("Método de los tres números");
    expect(state).toMatchObject({ status: "in_progress", coverage: {} });
    expect(state).not.toHaveProperty("brief");

    const record = (await repo.intakeBriefs.list({ projectId: "prj_panaderia" }))[0];
    expect(record.guideSnapshot.map((q) => q.id)).toEqual(["q_negocio", "q_dolor", "q_numeros"]);
    const msgs = await repo.messages.list({ projectId: "prj_panaderia" });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ author: "assistant", provider: "simulated", intakeClientId: "u_cami" });
  });

  it("marca la cobertura de cada respuesta y repregunta una vez si la respuesta es corta", async () => {
    await seed();
    const d = as(CAMI);
    await runIntakeTurn(d, "prj_panaderia", "");
    const short = await runIntakeTurn(d, "prj_panaderia", "Pan.");
    expect(short.state.coverage).toEqual({ q_negocio: "partial" });
    expect(short.reply).toContain("¿Me cuentas un poco más?");
    const full = await runIntakeTurn(d, "prj_panaderia", "Pan artesanal y repostería para las familias del barrio.");
    expect(full.state.coverage.q_negocio).toBe("answered");
    expect(full.reply).toContain("¿Qué te quita el sueño hoy del negocio?");
    const skip = await runIntakeTurn(d, "prj_panaderia", "No sé");
    expect(skip.state.coverage.q_dolor).toBe("skipped");
    expect(skip.reply).toContain("¿Cuánto vendes en un mes normal?");
  });

  it("al cubrir la guía avisa que puede enviar; el envío deja el brief solo para el mentor", async () => {
    await seed();
    const last = await answerAll(CAMI);
    expect(last.finished).toBe(true);
    expect(last.reply).toContain("Enviar a mi mentor");
    expect(last.state.coverage).toEqual({ q_negocio: "answered", q_dolor: "answered", q_numeros: "answered" });

    const brief = await submitIntake(as(CAMI), "prj_panaderia");
    expect(brief.answers.map((a) => a.questionId)).toEqual(["q_negocio", "q_dolor", "q_numeros"]);
    expect(brief.model).toBe("simulado");

    const asClient = await getIntakeState(as(CAMI), "prj_panaderia");
    expect(asClient.status).toBe("submitted");
    expect(asClient).not.toHaveProperty("brief");
    const asMentor = await getIntakeState(as(MARA), "prj_panaderia");
    expect(asMentor).toMatchObject({ status: "submitted", clientId: "u_cami" });
    expect(asMentor.brief?.summary).toContain("Cami Brenes");

    // Fase 2: el ciclo es un stub que falla; el envío no se cae por eso.
    expect(cycle.scheduleCycleSession).toHaveBeenCalledWith(expect.anything(), "prj_panaderia", expect.objectContaining({ kind: "kickoff" }));

    // Doble clic: devuelve el mismo brief; después ya no se puede seguir conversando.
    expect(await submitIntake(as(CAMI), "prj_panaderia")).toEqual(brief);
    expect(await code(runIntakeTurn(as(CAMI), "prj_panaderia", "Una cosa más"))).toBe("validation");
  });

  it("no se envía una entrevista sin respuestas", async () => {
    await seed();
    expect(await code(submitIntake(as(CAMI), "prj_panaderia"))).toBe("validation");
    await runIntakeTurn(as(CAMI), "prj_panaderia", "");
    expect(await code(submitIntake(as(CAMI), "prj_panaderia"))).toBe("validation");
  });

  it("permisos: solo el cliente responde; nadie ajeno ve el proyecto; el cliente no ve el de otro", async () => {
    await seed("group", [CAMI, BETO]);
    expect(await code(runIntakeTurn(as(MARA), "prj_panaderia", ""))).toBe("forbidden");
    expect(await code(runIntakeTurn(as(OUTSIDER), "prj_panaderia", ""))).toBe("not_found");
    expect(await code(getIntakeState(as(OUTSIDER), "prj_panaderia"))).toBe("not_found");
    expect(await code(getIntakeState(as(CAMI), "prj_panaderia", BETO.id))).toBe("forbidden");
  });

  it("proyecto grupal: una entrevista por persona y brief consolidado cuando envían todos", async () => {
    await seed("group", [CAMI, BETO]);
    await answerAll(CAMI);
    await runIntakeTurn(as(BETO), "prj_panaderia", "");
    await runIntakeTurn(as(BETO), "prj_panaderia", "Me encargo de la repostería: queques y tortas por encargo para cumpleaños.");

    // Las transcripciones no se mezclan.
    const camiView = await getIntakeView(as(CAMI), "prj_panaderia");
    const betoView = await getIntakeView(as(BETO), "prj_panaderia");
    expect(camiView.messages.some((m) => m.content.includes("queques"))).toBe(false);
    expect(betoView.messages.filter((m) => m.role === "client")).toHaveLength(1);
    expect(betoView.state.coverage).toEqual({ q_negocio: "answered" });

    await submitIntake(as(CAMI), "prj_panaderia");
    expect((await repo.intakeBriefs.list({ projectId: "prj_panaderia" })).some((r) => !r.clientId)).toBe(false);
    expect(cycle.scheduleCycleSession).not.toHaveBeenCalled();

    await submitIntake(as(BETO), "prj_panaderia");
    const rows = await repo.intakeBriefs.list({ projectId: "prj_panaderia" });
    const group = rows.find((r) => !r.clientId);
    expect(group?.status).toBe("submitted");
    expect(group?.brief?.summary).toMatch(/2 persona/);
    expect(group?.brief?.answers.find((a) => a.questionId === "q_negocio")?.answer).toMatch(/Cami: .*Beto: /);
    expect(group?.coverage.q_negocio).toBe("answered");
    expect(group?.coverage.q_dolor).toBe("partial");
    expect(cycle.scheduleCycleSession).toHaveBeenCalledTimes(1);

    // El mentor ve el consolidado por defecto y lo puede rehacer.
    const asMentor = await getIntakeState(as(MARA), "prj_panaderia");
    expect(asMentor.clientId).toBeUndefined();
    expect(asMentor.brief?.summary).toBe(group?.brief?.summary);
    await buildGroupBrief(as(MARA), "prj_panaderia");
    expect((await repo.intakeBriefs.list({ projectId: "prj_panaderia" })).filter((r) => !r.clientId)).toHaveLength(1);
  });

  it("buildGroupBrief solo existe para proyectos grupales", async () => {
    await seed();
    expect(await code(buildGroupBrief(as(MARA), "prj_panaderia"))).toBe("validation");
  });

  it("recordIntakeAnswer valida que la pregunta esté en la guía", async () => {
    await seed();
    const state = await recordIntakeAnswer(as(CAMI), "prj_panaderia", "q_numeros", "skipped");
    expect(state.coverage).toEqual({ q_numeros: "skipped" });
    expect(await code(recordIntakeAnswer(as(CAMI), "prj_panaderia", "q_inventada", "answered"))).toBe("validation");
  });
});

describe("herramientas del agente del cliente", () => {
  const ctx = (actor: Profile) => ({ deps: as(actor), project: { id: "prj_panaderia" } as Project });
  const tool = (name: string) => CLIENT_TOOLS.find((t) => t.definition.name === name)!;

  it("record_intake_answer y finish_intake usan el servicio del intake", async () => {
    await seed();
    expect(CLIENT_TOOLS.map((t) => t.definition.name)).toEqual(["record_intake_answer", "finish_intake"]);
    const check = await tool("finish_intake").run(ctx(CAMI), {});
    expect(check.data).toMatchObject({ status: "not_started", pendingRequired: ["q_negocio", "q_dolor"] });

    await answerAll(CAMI);
    const rec = await tool("record_intake_answer").run(ctx(CAMI), { question_id: "q_numeros", status: "partial" });
    expect(rec.data).toEqual({ coverage: { q_negocio: "answered", q_dolor: "answered", q_numeros: "partial" } });
    const bad = await tool("record_intake_answer").run(ctx(CAMI), { question_id: "q_negocio", status: "listo" });
    expect(bad.summary).toMatch(/status válido/);

    const sent = await tool("finish_intake").run(ctx(CAMI), { confirmed: true });
    expect(sent.data).toEqual({ submitted: true });
    expect((await getIntakeState(as(CAMI), "prj_panaderia")).status).toBe("submitted");
  });
});
