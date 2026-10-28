import { afterAll, describe, expect, it, vi } from "vitest";
import { BACKEND, closeWorlds, world, INTERVIEW } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { sendMessage } from "@/lib/services/conversation";
import { addComment, addItem, changeItem, confirmSummary } from "@/lib/services/diagnosis";
import { addNote, completeFirstReview, completeSecondReview, requestReview, startSession } from "@/lib/services/mentoring";
import { assignMentor, revokeMentor } from "@/lib/services/admin";
import {
  addEvidence,
  approveHypothesis,
  createExperiment,
  markExperimentReady,
  proposeHypothesis,
  recordResult,
  reformulateHypothesis,
  startExperiment,
  submitHypothesis,
  updateExperiment,
} from "@/lib/services/validation";
import { AiUnavailableError, type AiProvider } from "@/lib/ai/provider";
import { buildInterviewContext } from "@/lib/ai/context";
import { vetProposals } from "@/lib/ai/apply";
import { OpenRouterProvider } from "@/lib/ai/openrouter";
import type { ServiceDeps } from "@/lib/services/base";

afterAll(closeWorlds);

/** Pruebas del adaptador de IA: no dependen de la base, corren solo en memoria. */
const memoryOnly = BACKEND === "memory";

async function projectWithInterview(d: ServiceDeps) {
  const p = await createProject(d, { name: "Lavandería", description: "", nature: "exploring_idea" });
  for (const m of INTERVIEW) await sendMessage(d, p.id, m);
  return p;
}

const HYP = {
  statement: "Al menos 4 de 15 estudiantes que viven solos pagarán por adelantado un mes de lavandería.",
  segment: "Estudiantes que viven solos",
  whyItMatters: "Sin prepagos no hay flujo de caja.",
  currentEvidence: "5 compañeros dijeron que la usarían.",
  uncertainty: "high" as const,
  costOfBeingWrong: "Alquilar equipo sin demanda.",
  evaluationCriterion: "Prepagos en una semana.",
};

const EXP = {
  question: "¿Prepagan estudiantes desconocidos?",
  method: "Preventa con formulario",
  participants: "15 estudiantes de otra residencia",
  activities: ["Volantes", "Formulario"],
  resources: "Formulario",
  budget: null,
  durationDays: 7,
  metric: "Prepagos",
  successCriterion: "4 o más prepagos",
  rejectionCriterion: "Menos de 2",
  risks: "Muestra pequeña",
  evidencePlan: "Registro de pagos",
};

describe("Escenario A · emprendedor sin claridad", () => {
  it("organiza, registra incertidumbre y deja avanzar sin exigir solución", async () => {
    const { as, repo } = await world();
    const d = as("ent1");
    const p = await createProject(d, { name: "Algo con ropa", description: "", nature: "unknown" });
    const r = await sendMessage(d, p.id, "No sé bien qué quiero hacer. Tengo una idea de vender ropa usada pero no sé cómo resolverlo.");
    expect(r.ok).toBe(true);
    const items = await repo.diagnosisItems.list({ projectId: p.id });
    const open = items.filter((i) => i.infoType === "unknown");
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((i) => i.uncertainty === "unknown" && i.category === "open_question")).toBe(true);
    // Lo que dijo queda registrado con su cita literal, aunque esté acompañado de un «no sé».
    expect(items.some((i) => i.source.quote?.includes("vender ropa usada"))).toBe(true);
    // Ninguna "solución" inventada.
    expect(items.some((i) => i.category === "solutions")).toBe(false);
    // La conversación sigue con una sola pregunta.
    if (r.ok) expect(r.reply.content.split("?").length - 1).toBeLessThanOrEqual(2);
    const again = await sendMessage(d, p.id, "Todavía no lo investigué.");
    expect(again.ok).toBe(true);
  });
});

describe("Escenario B · corrección del diagnóstico", () => {
  it("la corrección prevalece, el historial conserva la versión anterior y la IA no la pisa", async () => {
    const { as, repo } = await world();
    const d = as("ent1");
    const p = await projectWithInterview(d);
    const items = await repo.diagnosisItems.list({ projectId: p.id });
    const target = items.find((i) => i.title === "Naturaleza de la iniciativa")!;
    const corrected = await changeItem(d, target.id, { kind: "edit", content: "Ya tengo 3 clientes que pagan; no es solo una idea." }, target.version);
    expect(corrected.reviewStatus).toBe("corrected");
    expect(corrected.version).toBe(target.version + 1);
    const hist = await repo.diagnosisItemHistory.list({ itemId: target.id });
    expect(hist.some((h) => h.before?.content === target.content && h.after.content === corrected.content)).toBe(true);

    // Una interpretación de la IA corregida por una persona pasa a ser "corrección humana".
    const ai = await repo.diagnosisItems.insert({ ...target, id: d.newId("ai"), infoType: "ai_interpretation", reviewStatus: "proposed", authorId: "ai", version: 1, content: "El negocio es B2B" });
    const fixed = await changeItem(d, ai.id, { kind: "edit", content: "Es B2C" }, 1);
    expect(fixed.infoType).toBe("human_correction");

    // Rechazar otra interpretación: deja de ser vigente pero queda trazable.
    const other = await repo.diagnosisItems.insert({ ...ai, id: d.newId("ai"), content: "Los estudiantes tienen dinero de sobra", version: 1, reviewStatus: "proposed", infoType: "ai_interpretation" });
    await changeItem(d, other.id, { kind: "reject", reason: "No es cierto" }, 1);
    const ws = await getWorkspace(d, p.id);
    expect(ws.items.find((i) => i.id === other.id)?.reviewStatus).toBe("rejected");

    // La IA intenta: (1) actualizar el elemento corregido y (2) re-proponer lo rechazado.
    const all = await repo.diagnosisItems.list({ projectId: p.id });
    const msgs = await repo.messages.list({ projectId: p.id });
    const vetted = vetProposals(
      [
        { op: "update", targetItemId: target.id, category: "context", title: "x", content: "Solo una idea", infoType: "ai_interpretation", uncertainty: "medium", sourceMessageId: null, quote: null, reason: "" },
        { op: "create", targetItemId: null, category: "context", title: "y", content: "Los estudiantes tienen dinero de sobra", infoType: "ai_interpretation", uncertainty: "medium", sourceMessageId: null, quote: null, reason: "" },
      ],
      all,
      msgs,
    );
    expect(vetted).toHaveLength(1);
    expect(vetted[0].target).toBeUndefined();
    expect(vetted[0].proposal.op).toBe("create");
    // Y el contexto que recibe la IA marca lo corregido como protegido y lista lo rechazado.
    const [dx] = await repo.diagnoses.list({ projectId: p.id });
    const ctx = buildInterviewContext({ project: p, diagnosis: dx, messages: msgs, latestMessage: msgs[msgs.length - 1], items: all, mentorNotes: [] });
    expect(ctx.currentItems.find((i) => i.id === target.id)?.protected).toBe(true);
    expect(ctx.rejectedInterpretations.map((r) => r.id)).toContain(other.id);
  });

  it("una 'declaración del emprendedor' sin cita literal se degrada a interpretación de la IA", async () => {
    const { as, repo } = await world();
    const d = as("ent1");
    const p = await projectWithInterview(d);
    const msgs = await repo.messages.list({ projectId: p.id });
    const userMsg = msgs.find((m) => m.author === "entrepreneur")!;
    const [v] = vetProposals(
      [{ op: "create", targetItemId: null, category: "financial", title: "Ventas", content: "Vende 200 suscripciones al mes", infoType: "entrepreneur_statement", uncertainty: "low", sourceMessageId: userMsg.id, quote: "vendo 200 suscripciones", reason: "" }],
      [],
      msgs,
    );
    expect(v.proposal.infoType).toBe("ai_interpretation");
    expect(v.proposal.quote).toBeNull();
  });
});

describe("Escenario C · mentoría temprana", () => {
  it("el mentor recibe contexto, registra observaciones y orienta sin editar el diagnóstico", async () => {
    const { as, repo, id } = await world();
    const d = as("ent1");
    const m = as("men1");
    const p = await projectWithInterview(d);
    await expect(requestReview(d, p.id, "first_review")).rejects.toThrow(/confirmá el resumen/);
    await confirmSummary(d, p.id);
    await expect(requestReview(d, p.id, "first_review")).rejects.toThrow(/mentor asignado/);
    await assignMentor(as("adm"), p.id, id("men1"));
    const s = await requestReview(d, p.id, "first_review");
    expect(s.briefing?.whatTheyBuild).toBeTruthy();
    expect(s.briefing?.mainProblem).not.toMatch(/Sin problema/);

    await startSession(m, s.id);
    const item = (await repo.diagnosisItems.list({ projectId: p.id }))[0];
    await addNote(m, s.id, "question", "¿Quién decide la compra?", item.id);
    await addComment(m, p.id, "diagnosis_item", item.id, "Revisar la fuente");
    await changeItem(m, item.id, { kind: "request_clarification", reason: "¿De dónde sale esto?" }, item.version);
    // El mentor no puede reescribir lo que dijo el emprendedor.
    await expect(changeItem(m, item.id, { kind: "edit", content: "otra cosa" }, item.version + 1)).rejects.toThrow();
    await completeFirstReview(m, s.id, "Investigar primero quién paga: estudiantes o padres.");
    const ws = await getWorkspace(d, p.id);
    expect(ws.sessions[0].status).toBe("completed");
    expect(ws.phase).toBe("prioritizing");
    // La conversación no se comparte por defecto.
    expect((await getWorkspace(m, p.id)).conversationHidden).toBe(true);
  });
});

describe("Escenario D · información financiera desconocida", () => {
  it("registra la incógnita sin inventar cifras", async () => {
    const { as, repo } = await world();
    const d = as("ent1");
    const p = await createProject(d, { name: "Panadería", description: "", nature: "operating_business" });
    await sendMessage(d, p.id, "Vendo pan a vecinos.");
    await sendMessage(d, p.id, "No sé cuánto me cuesta cada pan ni cuánto pagarían.");
    const items = await repo.diagnosisItems.list({ projectId: p.id });
    const unknown = items.filter((i) => i.infoType === "unknown");
    expect(unknown).toHaveLength(1);
    expect(unknown[0].content).toBe("No sé cuánto me cuesta cada pan ni cuánto pagarían.");
    // Ningún elemento contiene números que la persona no dijo.
    expect(items.every((i) => !/\d/.test(i.content))).toBe(true);
    const manual = await addItem(d, p.id, { category: "financial", title: "Costo", content: "Desconocido", uncertainty: "low", infoType: "unknown" });
    expect(manual.uncertainty).toBe("unknown");
  });
});

describe("Escenario E · experimento con resultado negativo", () => {
  it("contrasta con criterios, debilita la hipótesis y permite reformular sin borrar evidencia", async () => {
    const { as, repo, id } = await world();
    const d = as("ent1");
    const m = as("men1");
    const p = await projectWithInterview(d);
    await confirmSummary(d, p.id);
    await assignMentor(as("adm"), p.id, id("men1"));
    const s1 = await requestReview(d, p.id, "first_review");
    await completeFirstReview(m, s1.id, "Investigar disposición a prepagar.");

    await expect(proposeHypothesis(d, p.id, { ...HYP, statement: "El negocio tendrá éxito con estudiantes." }).then((h) => submitHypothesis(d, h.id))).rejects.toThrow(/vaga/);
    const h = await proposeHypothesis(d, p.id, HYP);
    await submitHypothesis(d, h.id);
    await expect(approveHypothesis(d, h.id)).rejects.toThrow(); // el emprendedor no se aprueba a sí mismo
    await approveHypothesis(m, h.id);

    const e = await createExperiment(d, h.id, { ...EXP, metric: "" });
    await expect(markExperimentReady(d, e.id)).rejects.toThrow(/métrica/);
    const e2 = await updateExperiment(d, e.id, { metric: "Prepagos" }, e.version);
    await markExperimentReady(d, e2.id);
    const started = await startExperiment(d, e2.id);
    expect(started.criteriaLockedAt).toBeTruthy();
    await expect(updateExperiment(d, e2.id, { successCriterion: "1 prepago" }, started.version)).rejects.toThrow();

    const ev = await addEvidence(d, p.id, { kind: "note", title: "Registro", description: "1 de 15 prepagó" });
    await recordResult(d, e2.id, { outcome: "negative", observed: "1 de 15 prepagó", metricValue: "1", learnings: "El prepago es barrera", limitations: "Muestra chica", evidenceIds: [ev.id] });
    expect((await repo.hypotheses.get(h.id))?.status).toBe("weakened");

    const s2 = await requestReview(d, p.id, "second_review");
    await completeSecondReview(m, s2.id, "reformulate", "El prepago mensual es la barrera; probar pago semanal.", h.id);
    expect((await repo.hypotheses.get(h.id))?.status).toBe("reformulated");
    expect((await repo.experiments.get(e2.id))?.status).toBe("reviewed");
    const fresh = await reformulateHypothesis(d, h.id, { ...HYP, statement: "Al menos 4 de 15 estudiantes que viven solos pagarán por adelantado una semana de lavandería." });
    expect(fresh.status).toBe("draft");
    expect((await repo.hypotheses.get(h.id))?.supersededBy).toBe(fresh.id);
    // La evidencia y el resultado siguen ahí.
    expect(await repo.experimentResults.list({ experimentId: e2.id })).toHaveLength(1);
    expect(await repo.evidence.get(ev.id)).toBeTruthy();
    expect((await getWorkspace(d, p.id)).phase).toBe("decided");
  });
});

describe("Escenario F · acceso no autorizado", () => {
  it("bloquea a otros emprendedores, mentores no asignados, mentores revocados y al admin", async () => {
    const { as, repo, id } = await world();
    const owner = as("ent1");
    const p = await projectWithInterview(owner);
    const item = (await repo.diagnosisItems.list({ projectId: p.id }))[0];

    for (const intruder of ["ent2", "men2", "adm"]) {
      const d = as(intruder);
      await expect(getWorkspace(d, p.id)).rejects.toMatchObject({ code: "not_found" });
      await expect(sendMessage(d, p.id, "hola")).rejects.toMatchObject({ code: "not_found" });
      await expect(changeItem(d, item.id, { kind: "confirm" }, item.version)).rejects.toMatchObject({ code: "not_found" });
    }
    const asg = await assignMentor(as("adm"), p.id, id("men1"));
    await expect(getWorkspace(as("men1"), p.id)).resolves.toBeTruthy();
    await revokeMentor(as("adm"), asg.id);
    await expect(getWorkspace(as("men1"), p.id)).rejects.toMatchObject({ code: "not_found" });
    // Solo el admin asigna.
    await expect(assignMentor(owner, p.id, id("men1"))).rejects.toMatchObject({ code: "forbidden" });
    const denied = await repo.auditEvents.list({ action: "access.denied" });
    expect(denied.length).toBeGreaterThan(0);
    // El servidor no confía en el elemento: no se puede confirmar con una versión inventada.
    await expect(changeItem(owner, item.id, { kind: "confirm" }, 999)).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("Escenario G · proveedor de IA no disponible", () => {
  it("conserva el mensaje, no inventa respuesta y deja registro", async () => {
    const failing: AiProvider = {
      id: "openrouter",
      label: "falla",
      interpret: async () => {
        throw new AiUnavailableError("provider_error", "El proveedor de IA devolvió un error.");
      },
    };
    const { as, repo } = await world(failing);
    const d = as("ent1");
    const p = await createProject(d, { name: "Proyecto", description: "", nature: "unknown" });
    const before = await repo.messages.list({ projectId: p.id });
    const r = await sendMessage(d, p.id, "Hola, quiero contarte mi idea.");
    expect(r.ok).toBe(false);
    const after = await repo.messages.list({ projectId: p.id });
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((m) => m.author === "assistant")).toHaveLength(before.filter((m) => m.author === "assistant").length);
    expect(after.some((m) => m.provider === "simulated")).toBe(false);
    expect(await repo.auditEvents.list({ action: "ai.failed" })).toHaveLength(1);
  });

  it.runIf(memoryOnly)("el adaptador OpenRouter traduce errores y rechaza salidas inválidas", async () => {
    const { as, repo } = await world();
    const d = as("ent1");
    const p = await createProject(d, { name: "Prueba", description: "", nature: "unknown" });
    const [dx] = await repo.diagnoses.list({ projectId: p.id });
    const msg = await repo.messages.insert({ id: "m1", conversationId: "c", projectId: p.id, author: "entrepreneur", content: "hola", createdAt: "2026-10-01T00:00:00.000Z" });
    const ctx = buildInterviewContext({ project: p, diagnosis: dx, messages: [msg], latestMessage: msg, items: [], mentorNotes: [] });
    const provider = new OpenRouterProvider("test-key", "modelo/gratis:free");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    await expect(provider.interpret(ctx)).rejects.toMatchObject({ reason: "rate_limited" });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "no es json" } }] }), { status: 200 })));
    await expect(provider.interpret(ctx)).rejects.toMatchObject({ reason: "invalid_output" });

    const good = { reply: "¿Qué hiciste hasta ahora?", askedDimension: "stage", proposals: [], contradictions: [], summaryDraft: null };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ model: "modelo/gratis:free", choices: [{ message: { content: "```json\n" + JSON.stringify(good) + "\n```" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await provider.interpret(ctx);
    expect(r.turn.reply).toBe(good.reply);
    expect(r.usage?.inputTokens).toBe(10);
    const init = fetchMock.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    vi.unstubAllGlobals();
  });
});

describe.runIf(memoryOnly)("OpenRouter · modelos gratuitos", () => {
  const good = { reply: "¿Quién pagaría?", askedDimension: "people", proposals: [], contradictions: [], summaryDraft: null };
  const ok = (model: string) => new Response(JSON.stringify({ model, choices: [{ message: { content: JSON.stringify(good) } }] }), { status: 200 });
  const err = (status: number, message: string, raw?: string) =>
    new Response(JSON.stringify({ error: { code: status, message, metadata: raw ? { provider_name: "Google AI Studio", raw } : undefined } }), { status });

  async function ctx() {
    const { as, repo } = await world();
    const p = await createProject(as("ent1"), { name: "Prueba", description: "", nature: "unknown" });
    const [dx] = await repo.diagnoses.list({ projectId: p.id });
    const msg = await repo.messages.insert({ id: "m1", conversationId: "c", projectId: p.id, author: "entrepreneur", content: "hola", createdAt: "2026-10-01T00:00:00.000Z" });
    return buildInterviewContext({ project: p, diagnosis: dx, messages: [msg], latestMessage: msg, items: [], mentorNotes: [] });
  }
  const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body));

  it("si el modelo principal está saturado, usa el de respaldo y lo informa en el uso", async () => {
    const c = await ctx();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) =>
      bodyOf(init).model === "a/saturado:free" ? err(429, "Provider returned error", "a/saturado:free is temporarily rate-limited upstream") : ok("b/respaldo:free"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const r = await new OpenRouterProvider("k", "a/saturado:free", ["b/respaldo:free"]).interpret(c);
    expect(r.turn.reply).toBe(good.reply);
    expect(r.usage?.model).toBe("b/respaldo:free");
    expect(fetchMock.mock.calls.map(([, i]) => bodyOf(i).model)).toEqual(["a/saturado:free", "b/respaldo:free"]);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("el cupo diario agotado no se disfraza de saturación ni prueba otros modelos", async () => {
    const c = await ctx();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => err(429, "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new OpenRouterProvider("k", "a:free", ["b:free"]).interpret(c)).rejects.toMatchObject({ reason: "rate_limited", message: expect.stringContaining("cupo diario") });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("se adapta a modelos sin rol de sistema y sin modo JSON, y registra el detalle real", async () => {
    const c = await ctx();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      const b = bodyOf(init);
      if (b.messages[0].role === "system") return err(400, "Developer instruction is not enabled for models/gemma");
      if (b.response_format) return err(404, "No endpoints found that support the requested parameters");
      return ok("g/gemma:free");
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await new OpenRouterProvider("k", "g/gemma:free").interpret(c);
    expect(r.turn.reply).toBe(good.reply);
    const last = bodyOf(fetchMock.mock.calls.at(-1)![1]);
    expect(last.messages[0].role).toBe("user");
    expect(last.messages[0].content).toContain("RAX");
    expect(last.response_format).toBeUndefined();
    expect(log.mock.calls.flat().join(" ")).toContain("Developer instruction is not enabled");
    expect(log.mock.calls.flat().join(" ")).not.toContain("Bearer");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

describe("Escenario H · actualización concurrente", () => {
  it("rechaza la escritura con versión vieja sin perder el cambio del otro", async () => {
    const { as, repo, id } = await world();
    const d = as("ent1");
    const m = as("men1");
    const p = await projectWithInterview(d);
    await assignMentor(as("adm"), p.id, id("men1"));
    const problem = (await repo.diagnosisItems.list({ projectId: p.id })).find((i) => i.category === "problem" && i.infoType !== "unknown")!;
    const seenByOwner = problem.version;
    await changeItem(m, problem.id, { kind: "prioritize", rank: 1, rationale: "Más evidencia" }, problem.version);
    await expect(changeItem(d, problem.id, { kind: "edit", content: "versión vieja" }, seenByOwner)).rejects.toMatchObject({ code: "conflict" });
    const current = await repo.diagnosisItems.get(problem.id);
    expect(current?.priority?.rank).toBe(1);
    expect(current?.content).toBe(problem.content);
    // Con la versión actual, la edición entra.
    await changeItem(d, problem.id, { kind: "edit", content: "versión nueva" }, current!.version);
    expect((await repo.diagnosisItems.get(problem.id))?.priority?.rank).toBe(1);
  });
});
