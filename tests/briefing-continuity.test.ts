import { afterAll, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import { addNote, completeSession, generatePreSessionBriefing, scheduleSession } from "@/lib/services/mentoring";
import { addNoteReply } from "@/lib/services/session-notes";
import { SimulatedProvider } from "@/lib/ai/simulated";

afterAll(closeWorlds);

describe("Briefing de la siguiente sesión: continuidad con las notas y sus respuestas", () => {
  it("usa las preguntas del mentor, las respuestas de la persona y lo que sigue sin respuesta", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const p = await createProject(ent, { name: "AguaViva", description: "Filtros de agua para escuelas rurales", nature: "operating_business" });
    await assignMentor(as("adm"), p.id, id("men1"));

    // Primera sesión: el mentor deja preguntas y una nota privada.
    const first = await scheduleSession(ent, p.id, { kind: "follow_up", scheduledAt: "2026-11-05T15:00:00.000Z" });
    const q1 = await addNote(mentor, first.id, "question", "¿Cuántas escuelas aceptaron el piloto?");
    await addNote(mentor, first.id, "question", "¿Quién paga el mantenimiento de los filtros?");
    await addNote(mentor, first.id, "observation", "Nota privada: dudo del compromiso del socio.", undefined, true);
    await completeSession(mentor, first.id);

    // La persona responde una de las preguntas después de la sesión.
    await addNoteReply(ent, q1.id, "Aceptaron 3 escuelas de Guanacaste; dos más lo están evaluando.");

    // Segunda sesión: el briefing debe traer la respuesta y la pregunta abierta.
    const second = await scheduleSession(ent, p.id, { kind: "follow_up", scheduledAt: "2026-11-12T15:00:00.000Z" });
    const ai = new SimulatedProvider();
    const spy = vi.spyOn(ai, "generatePreSessionBriefing");
    const briefing = await generatePreSessionBriefing(as("men1", ai), second.id);

    const ctx = spy.mock.calls[0][0];
    const answered = ctx.questionsFromNotes?.find((q) => q.question.includes("Cuántas escuelas"));
    expect(answered?.answered).toBe(true);
    expect(answered?.answers[0]).toContain("3 escuelas");
    expect(ctx.questionsFromNotes?.find((q) => q.question.includes("mantenimiento"))?.answered).toBe(false);
    expect(ctx.previousSessionNotes.find((n) => n.body.includes("Cuántas escuelas"))?.replies?.[0]).toMatchObject({ author: "emprendedor" });
    expect(ctx.previousSessions?.[0].notes.length).toBe(2);
    // Las notas privadas nunca llegan al modelo.
    expect(JSON.stringify(ctx)).not.toContain("dudo del compromiso");

    expect(briefing.pendingTopicsSummary).toContain("3 escuelas");
    expect(briefing.pendingTopicsSummary).toContain("sin respuesta");
    expect(briefing.pendingTopicsSummary).toContain("mantenimiento");

    // Una respuesta nueva rehace el briefing de la sesión que todavía no empezó.
    const q2 = (await repo.sessionNotes.list({ sessionId: first.id })).find((n) => n.body.includes("mantenimiento"))!;
    await addNoteReply(ent, q2.id, "Lo paga la municipalidad con un convenio anual.");
    const refreshed = (await repo.mentorSessions.get(second.id))?.preSessionBriefing;
    expect(refreshed?.pendingTopicsSummary).toContain("municipalidad");
  });
});
