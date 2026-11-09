import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/types/domain";
import { createAssessment, publishAssessment, submitAssessment } from "@/lib/services/assessments";
import { BETO, CAMI, MARA, OUTSIDER, PID, b2bWorld } from "./fixtures/b2b-world";

// El contexto del mentor (Dev A) se reemplaza por el fake de contrato.
vi.mock("@/lib/ai/mentor-context", async () => {
  const { fakeBuildMentorContext } = await import("./fixtures/b2b");
  return { buildMentorContext: vi.fn(fakeBuildMentorContext) };
});

const { CLIENT_TOOLS } = await import("@/lib/ai/tools/client");
const { buildMentorContext } = await import("@/lib/ai/mentor-context");

/** Fase 4 · herramientas del asistente del cliente: explain_resource y prepare_for_session. */

const tool = (name: string) => CLIENT_TOOLS.find((t) => t.definition.name === name)!;
const ctx = (w: Awaited<ReturnType<typeof b2bWorld>>, actor: typeof CAMI) => ({ deps: w.as(actor), project: { id: PID } as Project });

describe("explain_resource", () => {
  it("explica material publicado con el contexto del mentor y nunca abre uno sin publicar", async () => {
    const w = await b2bWorld("group", [CAMI, BETO]);
    await w.doc("doc_guia", { title: "Guía de margen", visibility: "published", publishedAt: "2026-11-05T00:00:00.000Z", content: "El margen es precio menos costo." });
    await w.doc("doc_beto", { title: "Plan de Beto", visibility: "published", publishedAt: "2026-11-06T00:00:00.000Z", audienceClientId: BETO.id });
    await w.doc("doc_secreto", { title: "Notas del mentor", content: "SECRETO del mentor" });

    // Un solo material visible para Cami: lo toma sin que lo nombre.
    const r = await tool("explain_resource").run(ctx(w, CAMI), { question: "¿qué es el margen?" });
    expect(r.data).toMatchObject({ resource: { id: "doc_guia", title: "Guía de margen" }, content: "El margen es precio menos costo.", question: "¿qué es el margen?" });
    expect((r.data as { mentorContext: string }).mentorContext).toContain("<mentor_context>");
    expect(buildMentorContext).toHaveBeenCalledWith(expect.anything(), MARA.id, expect.stringContaining("Guía de margen"));

    // Por título (sin tildes ni mayúsculas) y por id.
    expect((await tool("explain_resource").run(ctx(w, BETO), { title: "plan de beto" })).data).toMatchObject({ resource: { id: "doc_beto" } });
    // Nunca un documento sin publicar ni el de otra persona: devuelve la lista de lo publicado.
    for (const args of [{ document_id: "doc_secreto" }, { title: "Notas del mentor" }, { document_id: "doc_beto" }]) {
      const miss = await tool("explain_resource").run(ctx(w, CAMI), args);
      expect(JSON.stringify(miss)).not.toContain("SECRETO");
      expect(JSON.stringify(miss)).not.toContain("Plan de Beto");
      expect(miss.data).toEqual({ resources: [{ id: "doc_guia", title: "Guía de margen", kind: "material", publishedAt: "2026-11-05" }] });
    }
    // Varios materiales y ninguno nombrado: pide elegir.
    const many = await tool("explain_resource").run(ctx(w, BETO), {});
    expect((many.data as { resources: unknown[] }).resources).toHaveLength(2);
    // Alguien ajeno al proyecto: respuesta sin datos (no rompe el turno).
    const out = await tool("explain_resource").run(ctx(w, OUTSIDER), {});
    expect(out.data).toEqual({ error: "not_found" });
  });
});

describe("prepare_for_session", () => {
  it("resume la próxima sesión, compromisos pendientes y evaluaciones sin responder", async () => {
    const w = await b2bWorld("group", [CAMI, BETO]);
    await w.repo.mentorSessions.insert({
      id: "ses_3", projectId: PID, mentorId: MARA.id, kind: "follow_up", status: "pending", sessionNumber: 3, scheduledAt: "2026-11-20T15:00:00.000Z",
      agenda: [{ id: "t1", title: "Margen por producto", goal: "Saber qué deja dinero", status: "planned" }], createdAt: "2026-11-01T00:00:00.000Z",
    } as never);
    await w.repo.tasks.insert({ id: "tsk_1", projectId: PID, title: "Anotar ventas diarias", status: "todo", assigneeId: CAMI.id, createdAt: "2026-11-01T00:00:00.000Z" } as never);
    await w.repo.tasks.insert({ id: "tsk_2", projectId: PID, title: "Tarea de Beto", status: "todo", assigneeId: BETO.id, createdAt: "2026-11-01T00:00:00.000Z" } as never);
    await w.repo.tasks.insert({ id: "tsk_3", projectId: PID, title: "Ya hecha", status: "done", assigneeId: CAMI.id, createdAt: "2026-11-01T00:00:00.000Z" } as never);
    const q = [{ id: "q", kind: "open" as const, prompt: "¿Cómo vas?" }];
    const a1 = await publishAssessment(w.as(MARA), (await createAssessment(w.as(MARA), PID, { title: "Pendiente", questions: q })).id);
    const a2 = await publishAssessment(w.as(MARA), (await createAssessment(w.as(MARA), PID, { title: "Respondida", questions: q })).id);
    await createAssessment(w.as(MARA), PID, { title: "Borrador del mentor", questions: q });
    await submitAssessment(w.as(CAMI), a2.id, [{ questionId: "q", value: "Bien" }]);
    await w.doc("doc_guia", { title: "Guía de margen", visibility: "published", publishedAt: "2026-11-05T00:00:00.000Z" });
    await w.doc("doc_secreto", { title: "Notas del mentor" });

    const r = await tool("prepare_for_session").run(ctx(w, CAMI), {});
    expect(r.summary).toContain("Sesión 3");
    const data = r.data as {
      nextSession: { id: string; agenda: Array<{ title: string }> };
      commitments: Array<{ title: string }>;
      pendingAssessments: Array<{ id: string; title: string }>;
      recentMaterial: Array<{ id: string }>;
    };
    expect(data.nextSession.id).toBe("ses_3");
    expect(data.nextSession.agenda.map((t) => t.title)).toEqual(["Margen por producto"]);
    expect(data.commitments.map((c) => c.title)).toEqual(["Anotar ventas diarias"]);
    expect(data.pendingAssessments.map((a) => a.id)).toEqual([a1.id]);
    expect(data.recentMaterial.map((m) => m.id)).toEqual(["doc_guia"]);
    expect(JSON.stringify(r)).not.toContain("Borrador del mentor");
    expect(JSON.stringify(r)).not.toContain("Notas del mentor");
  });
});
