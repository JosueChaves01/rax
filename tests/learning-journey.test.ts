import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";

const { getDepsMock } = vi.hoisted(() => ({ getDepsMock: vi.fn() }));
vi.mock("@/lib/runtime", () => ({ getDeps: getDepsMock, homeFor: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import * as A from "@/app/actions";

afterAll(closeWorlds);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Recorrido «Aprender React»: el estudiante aprende y el mentor enseña usando solo los agentes. */
describe("recorrido de aprendizaje con agentes", () => {
  async function setup() {
    const w = await world();
    const student = w.as("ent1");
    const mentor = w.as("men1");
    getDepsMock.mockResolvedValue(student);
    const created = await A.completeExplorationAndCreateProjectAction({
      initiativeName: "Aprender React",
      sector: "Educación",
      summary: "Aprender React desde cero con acompañamiento de un mentor",
      motivation: "skills",
      description: "Quiero dominar componentes, estado y hooks",
      mentorId: w.id("men1"),
      agreement: { frequency: "weekly", cycleGoals: "Construir una app de tareas en React" },
    });
    if (!created.ok) throw new Error(created.error);
    return { w, student, mentor, pid: created.projectId, relationId: created.relationId };
  }

  const chat = async (pid: string, message: string) => {
    const r = await A.sendClaudeAgentMessageAction({ projectId: pid, message });
    if (!r.ok) throw new Error(r.error);
    return r.data!;
  };
  const apply = async (pid: string, proposals: Array<Record<string, unknown>>) => {
    const out = [];
    for (const p of proposals) out.push(await A.applyAiProposalAction(pid, p));
    return out;
  };

  it("el estudiante arma su diagnóstico y plan de estudio desde el chat", async () => {
    const { student, pid } = await setup();
    await apply(pid, (await chat(pid, "¿Por dónde empezamos?")).proposals);
    await apply(pid, (await chat(pid, "No entiendo bien los hooks de React y tengo 6 horas semanales")).proposals);
    const plan = await chat(pid, "Haceme un plan de estudio con tareas");
    expect(plan.proposals.filter((p) => p.type === "task")).toHaveLength(3);
    expect((await apply(pid, plan.proposals)).every((r) => r.ok)).toBe(true);
    await apply(pid, (await chat(pid, "Haceme un resumen de lo que sabemos")).proposals);
    expect((await A.confirmSummaryAction(pid)).ok).toBe(true);

    expect(await student.repo.tasks.list({ projectId: pid })).toHaveLength(3);
    expect((await student.repo.diagnosisItems.list({ projectId: pid })).length).toBeGreaterThanOrEqual(3);
  });

  it("el mentor prepara la sesión con el agente y los temas quedan en la agenda", async () => {
    const { mentor, pid, relationId } = await setup();
    getDepsMock.mockResolvedValue(mentor);

    const sinSesion = await chat(pid, "Preparame la sesión de tutoría sobre hooks");
    expect(sinSesion.proposals.every((p) => p.type === "agenda_topic")).toBe(true);
    const [rechazo] = await apply(pid, sinSesion.proposals.slice(0, 1));
    expect(rechazo).toMatchObject({ ok: false, error: expect.stringContaining("Programa una sesión") });

    const s = await A.scheduleSessionAction(pid, { kind: "follow_up", scheduledAt: "2026-11-05T15:00:00.000Z", relationId });
    if (!s.ok) throw new Error(s.error);
    const results = await apply(pid, (await chat(pid, "Preparame la sesión de tutoría sobre hooks")).proposals);
    expect(results.every((r) => r.ok)).toBe(true);
    const notes = await mentor.repo.sessionNotes.list({ sessionId: s.data!.id });
    expect(notes.map((n) => n.kind)).toEqual(["question", "question"]);
    // Guardar la agenda no da la sesión por iniciada
    expect((await mentor.repo.mentorSessions.get(s.data!.id))?.status).toBe("pending");

    const sid = s.data!.id;
    expect((await A.generatePreSessionBriefingAction(pid, sid)).ok).toBe(true);
    expect((await A.startSessionAction(pid, sid)).ok).toBe(true);
    expect((await A.generatePostSessionSynthesisAction(pid, sid)).ok).toBe(true);
    const adopted = await A.adoptPostSessionCommitmentsAction(pid, sid);
    expect(adopted.ok).toBe(true);
    expect((await A.completeSessionAction(pid, sid, "Sesión de hooks")).ok).toBe(true);
  });

  it("el estudiante guarda como tarea un tema para llevar a la sesión", async () => {
    const { student, pid } = await setup();
    const [r] = await apply(pid, [{ type: "agenda_topic", title: "¿Cuándo usar useMemo?", needsHumanApproval: true }]);
    expect(r.ok).toBe(true);
    const tasks = await student.repo.tasks.list({ projectId: pid });
    expect(tasks.map((t) => t.title)).toEqual(["Llevar a la sesión: ¿Cuándo usar useMemo?"]);
  });

  it("evaluar un ejercicio usa el agente y no inventa nota sin IA", async () => {
    const { pid } = await setup();
    const code = "function Counter(){ const [n,setN]=useState(0); return <button onClick={()=>setN(n+1)}>{n}</button> }";

    vi.stubEnv("OPENROUTER_API_KEY", "");
    const sinIa = await A.evaluateExerciseAction(pid, code);
    expect(sinIa).toMatchObject({ ok: false, error: expect.stringContaining("IA no está disponible") });

    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "Puntaje: 8/10\nBien usado useState. Falta extraer el handler." } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const conIa = await A.evaluateExerciseAction(pid, code);
    expect(conIa).toEqual({ ok: true, score: "8/10", feedback: "Bien usado useState. Falta extraer el handler." });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
