import { describe, expect, it } from "vitest";
import type { AssessmentInput } from "@/types/b2b";
import {
  aggregateSubmissions,
  closeAssessment,
  createAssessment,
  getAssessment,
  listAssessments,
  publishAssessment,
  reviewSubmission,
  submitAssessment,
  updateAssessment,
} from "@/lib/services/assessments";
import { cycleSignalsForBriefing } from "@/lib/services/cycle";
import { listNotifications } from "@/lib/services/notifications";
import { BETO, CAMI, MARA, OTHER_MENTOR, OUTSIDER, PID, b2bWorld, code } from "./fixtures/b2b-world";

/** Fase 4 · evaluaciones: el mentor crea, publica, cierra y revisa; cada cliente responde una vez. */

const INPUT: AssessmentInput = {
  title: "¿Cuánto te deja cada producto?",
  instructions: "Responde con tus números de la última semana.",
  questions: [
    { id: "q_open", kind: "open", prompt: "¿Cuál es tu producto con más margen?" },
    { id: "q_single", kind: "single_choice", prompt: "¿Llevas registro de ventas?", options: ["Sí", "No"] },
    { id: "q_multi", kind: "multi_choice", prompt: "¿Qué revisas cada semana?", options: ["Ventas", "Margen", "Caja"] },
    { id: "q_scale", kind: "scale", prompt: "¿Qué tan claro tienes tu margen?", options: ["Nada", "Muy claro"], points: 5 },
  ],
};

const ANSWERS = (scale: number, multi = ["Ventas", "Caja"]) => [
  { questionId: "q_open", value: "El pan dulce" },
  { questionId: "q_single", value: "Sí" },
  { questionId: "q_multi", value: multi },
  { questionId: "q_scale", value: scale },
];

describe("evaluaciones · mentor", () => {
  it("crea un borrador validado con zod; solo el mentor del proyecto", async () => {
    const w = await b2bWorld();
    const a = await createAssessment(w.as(MARA), PID, INPUT);
    expect(a).toMatchObject({ status: "draft", createdBy: MARA.id, title: INPUT.title });
    expect(a.questions.map((q) => q.id)).toEqual(["q_open", "q_single", "q_multi", "q_scale"]);
    expect(a.questions[0]).not.toHaveProperty("options");

    expect(await code(createAssessment(w.as(CAMI), PID, INPUT))).toBe("not_found");
    expect(await code(createAssessment(w.as(OTHER_MENTOR), PID, INPUT))).toBe("not_found");
    expect(await code(createAssessment(w.as(MARA), PID, { ...INPUT, title: "  " }))).toBe("validation");
    expect(await code(createAssessment(w.as(MARA), PID, { ...INPUT, questions: [{ id: "x", kind: "single_choice", prompt: "¿?", options: ["Solo una"] }] }))).toBe("validation");
    expect(await code(createAssessment(w.as(MARA), PID, { ...INPUT, questions: [{ id: "x", kind: "nada" as never, prompt: "¿?" }] }))).toBe("validation");
    expect(await code(createAssessment(w.as(MARA), PID, { ...INPUT, sessionId: "ses_ajena" }))).toBe("validation");
    // Ids repetidos o vacíos se reemplazan.
    const dup = await createAssessment(w.as(MARA), PID, { title: "Dup", questions: [{ id: "a", kind: "open", prompt: "1" }, { id: "a", kind: "open", prompt: "2" }] });
    expect(new Set(dup.questions.map((q) => q.id)).size).toBe(2);
  });

  it("edita solo en borrador; publicar avisa a cada cliente una vez; cerrar corta las entregas", async () => {
    const w = await b2bWorld("group", [CAMI, BETO]);
    const a = await createAssessment(w.as(MARA), PID, { title: "Vacía", questions: [] });
    expect(await code(publishAssessment(w.as(MARA), a.id))).toBe("validation");
    await updateAssessment(w.as(MARA), a.id, INPUT);
    const pub = await publishAssessment(w.as(MARA), a.id);
    expect(pub.status).toBe("published");
    expect(pub.publishedAt).toBeDefined();
    await publishAssessment(w.as(MARA), a.id);
    for (const c of [CAMI, BETO]) {
      const n = await listNotifications(w.as(c));
      expect(n.filter((x) => x.kind === "assessment_published")).toHaveLength(1);
      expect(n[0].payload).toMatchObject({ projectId: PID, assessmentId: a.id });
    }
    expect(await code(updateAssessment(w.as(MARA), a.id, INPUT))).toBe("validation");
    expect(await code(publishAssessment(w.as(CAMI), a.id))).toBe("not_found");
    expect(await code(closeAssessment(w.as(CAMI), a.id))).toBe("not_found");
    await closeAssessment(w.as(MARA), a.id);
    expect(await code(submitAssessment(w.as(CAMI), a.id, ANSWERS(3)))).toBe("validation");
  });
});

describe("evaluaciones · cliente", () => {
  it("no ve borradores; ve publicadas y cerradas con su estado", async () => {
    const w = await b2bWorld();
    const draft = await createAssessment(w.as(MARA), PID, INPUT);
    expect(await listAssessments(w.as(CAMI), PID)).toEqual([]);
    expect(await code(getAssessment(w.as(CAMI), draft.id))).toBe("not_found");
    expect(await code(listAssessments(w.as(OUTSIDER), PID))).toBe("not_found");
    await publishAssessment(w.as(MARA), draft.id);
    const [item] = await listAssessments(w.as(CAMI), PID);
    expect(item.assessment.id).toBe(draft.id);
    expect(item.mine).toBeUndefined();
    expect(item.submitted).toBe(0);
  });

  it("guarda borrador, envía una sola vez, valida respuestas y avisa al mentor", async () => {
    const w = await b2bWorld();
    const a = await publishAssessment(w.as(MARA), (await createAssessment(w.as(MARA), PID, INPUT)).id);
    const draft = await submitAssessment(w.as(CAMI), a.id, [{ questionId: "q_open", value: "  A medias  " }], { draft: true });
    expect(draft).toMatchObject({ status: "draft", answers: [{ questionId: "q_open", value: "A medias" }] });
    expect((await getAssessment(w.as(CAMI), a.id)).mySubmission?.status).toBe("draft");

    expect(await code(submitAssessment(w.as(CAMI), a.id, [{ questionId: "q_open", value: "x" }]))).toBe("validation"); // faltan preguntas
    expect(await code(submitAssessment(w.as(CAMI), a.id, [...ANSWERS(3).slice(0, 3), { questionId: "q_scale", value: 9 }]))).toBe("validation");
    expect(await code(submitAssessment(w.as(CAMI), a.id, [...ANSWERS(3).slice(0, 1), { questionId: "q_single", value: "Quizás" }, ...ANSWERS(3).slice(2)]))).toBe("validation");
    expect(await code(submitAssessment(w.as(CAMI), a.id, ANSWERS(3, ["Ventas", "Otra"])))).toBe("validation");
    expect(await code(submitAssessment(w.as(MARA), a.id, ANSWERS(3)))).toBe("not_found");

    const sent = await submitAssessment(w.as(CAMI), a.id, ANSWERS(4, ["Caja", "Ventas"]));
    expect(sent.status).toBe("submitted");
    expect(sent.id).toBe(draft.id); // una fila por persona
    expect(sent.answers.find((x) => x.questionId === "q_multi")?.value).toEqual(["Ventas", "Caja"]); // orden de las opciones
    expect(await code(submitAssessment(w.as(CAMI), a.id, ANSWERS(5)))).toBe("conflict");
    expect(await w.repo.assessmentSubmissions.count({ assessmentId: a.id })).toBe(1);
    const toMentor = await listNotifications(w.as(MARA));
    expect(toMentor.map((n) => n.kind)).toContain("assessment_submitted");
  });

  it("el mentor revisa con puntaje y comentario; el cliente lo ve solo revisado", async () => {
    const w = await b2bWorld();
    const a = await publishAssessment(w.as(MARA), (await createAssessment(w.as(MARA), PID, INPUT)).id);
    const sub = await submitAssessment(w.as(CAMI), a.id, [{ questionId: "q_open", value: "Borrador" }], { draft: true });
    expect(await code(reviewSubmission(w.as(MARA), sub.id, { feedback: "Bien" }))).toBe("validation"); // borrador
    await submitAssessment(w.as(CAMI), a.id, ANSWERS(4));
    expect(await code(reviewSubmission(w.as(CAMI), sub.id, { feedback: "Yo misma" }))).toBe("not_found");
    expect(await code(reviewSubmission(w.as(OTHER_MENTOR), sub.id, { feedback: "Ajeno" }))).toBe("not_found");
    expect(await code(reviewSubmission(w.as(MARA), sub.id, { feedback: " " }))).toBe("validation");
    expect(await code(reviewSubmission(w.as(MARA), sub.id, { feedback: "x", score: -1 }))).toBe("validation");

    const mentorView = await getAssessment(w.as(MARA), a.id);
    expect(mentorView.submissions?.map((s) => s.clientName)).toEqual([CAMI.name]);
    expect(mentorView.pending).toEqual([]);
    expect(mentorView.aggregate).toBeUndefined(); // individual

    const reviewed = await reviewSubmission(w.as(MARA), sub.id, { score: 8, feedback: "Buen análisis del margen." });
    expect(reviewed).toMatchObject({ status: "reviewed", score: 8, mentorFeedback: "Buen análisis del margen." });
    const clientView = await getAssessment(w.as(CAMI), a.id);
    expect(clientView.mySubmission).toMatchObject({ status: "reviewed", score: 8 });
    const [item] = await listAssessments(w.as(CAMI), PID);
    expect(item.mine).toEqual({ status: "reviewed", score: 8 });
    expect((await listNotifications(w.as(CAMI))).map((n) => n.kind)).toContain("assessment_reviewed");

    // Llega al briefing de la próxima sesión (cycleSignalsForBriefing, que consume Dev A).
    const signals = await cycleSignalsForBriefing(w.as(MARA), PID);
    expect(signals.assessmentResults).toEqual([{ assessmentId: a.id, title: a.title, clientId: CAMI.id, status: "reviewed", score: 8 }]);
  });
});

describe("evaluaciones · proyecto grupal", () => {
  it("una entrega por persona y vista agregada (promedio y dispersión) para el mentor", async () => {
    const w = await b2bWorld("group", [CAMI, BETO]);
    const a = await publishAssessment(w.as(MARA), (await createAssessment(w.as(MARA), PID, INPUT)).id);
    const s1 = await submitAssessment(w.as(CAMI), a.id, ANSWERS(2, ["Ventas"]));
    let v = await getAssessment(w.as(MARA), a.id);
    expect(v.pending?.map((p) => p.id)).toEqual([BETO.id]);
    const s2 = await submitAssessment(w.as(BETO), a.id, ANSWERS(4, ["Ventas", "Margen"]));
    await reviewSubmission(w.as(MARA), s1.id, { score: 6, feedback: "Ok" });
    await reviewSubmission(w.as(MARA), s2.id, { score: 10, feedback: "Muy bien" });

    // Cada persona ve solo la suya.
    expect((await getAssessment(w.as(BETO), a.id)).mySubmission?.id).toBe(s2.id);
    expect((await getAssessment(w.as(BETO), a.id)).submissions).toBeUndefined();

    v = await getAssessment(w.as(MARA), a.id);
    expect(v.pending).toEqual([]);
    const agg = v.aggregate!;
    expect(agg).toMatchObject({ submissions: 2, clients: 2, score: { average: 8, spread: 2, min: 6, max: 10, count: 2 } });
    expect(agg.questions.find((q) => q.questionId === "q_scale")).toMatchObject({ average: 3, spread: 1, min: 2, max: 4, answered: 2 });
    expect(agg.questions.find((q) => q.questionId === "q_multi")?.options).toEqual([
      { option: "Ventas", count: 2 },
      { option: "Margen", count: 1 },
      { option: "Caja", count: 0 },
    ]);
    expect(agg.questions.find((q) => q.questionId === "q_open")).toMatchObject({ answered: 2 });
    const [item] = await listAssessments(w.as(MARA), PID);
    expect(item).toMatchObject({ submitted: 2, reviewed: 2, clients: 2 });
  });

  it("aggregateSubmissions ignora borradores", () => {
    const a = { id: "a", projectId: PID, createdBy: MARA.id, title: "t", instructions: "", status: "published" as const, createdAt: "x", questions: [{ id: "s", kind: "scale" as const, prompt: "p" }] };
    const sub = (status: "draft" | "submitted", v: number) => ({ id: `s${v}`, assessmentId: "a", clientId: `c${v}`, answers: [{ questionId: "s", value: v }], status, createdAt: "x" });
    const agg = aggregateSubmissions(a, [sub("draft", 1), sub("submitted", 5)], 2);
    expect(agg.submissions).toBe(1);
    expect(agg.questions[0]).toMatchObject({ average: 5, spread: 0 });
    expect(agg.score).toBeUndefined();
  });
});
