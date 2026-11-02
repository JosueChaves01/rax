import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import { addNote, scheduleSession } from "@/lib/services/mentoring";
import {
  addNoteReply,
  createSessionNote,
  getSessionWorkspaceWithReplies,
  listProjectNotes,
  updateNoteReply,
  updateSessionNote,
} from "@/lib/services/session-notes";
import { createAgentThread } from "@/lib/services/agent-chat";
import { runAgentTurn } from "@/lib/services/agent-turn";

afterAll(closeWorlds);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  const w = await world();
  const ent = w.as("ent1");
  const mentor = w.as("men1");
  const p = await createProject(ent, { name: "Tutorías Mate", description: "Aprender cálculo", nature: "exploring_idea" });
  await assignMentor(w.as("adm"), p.id, w.id("men1"));
  const session = await scheduleSession(ent, p.id, { kind: "follow_up", scheduledAt: "2026-11-05T15:00:00.000Z" });
  return { w, ent, mentor, p, session };
}

describe("notas de mentoría con respuestas", () => {
  it("el mentor crea y edita notas; el estudiante las lee y las responde; nadie edita lo ajeno", async () => {
    const { w, ent, mentor, p, session } = await setup();
    const question = await createSessionNote(mentor, p.id, { sessionId: session.id, kind: "question", body: "¿Qué tema te cuesta más?" });
    const secret = await addNote(mentor, session.id, "observation", "Le falta base de álgebra", undefined, true);

    // El estudiante no crea notas ni edita las del mentor, pero sí responde.
    await expect(createSessionNote(ent, p.id, { sessionId: session.id, body: "hola" })).rejects.toBeTruthy();
    await expect(updateSessionNote(ent, question.id, { body: "cambiada" })).rejects.toMatchObject({ code: "forbidden" });
    const reply = await addNoteReply(ent, question.id, "Las derivadas implícitas");
    const fixed = await updateNoteReply(ent, reply.id, "Las derivadas implícitas y la regla de la cadena");
    expect(fixed.updatedAt).toBeTruthy();
    await expect(updateNoteReply(mentor, reply.id, "otra cosa")).rejects.toMatchObject({ code: "forbidden" });

    // La nota privada no existe para el estudiante.
    await expect(addNoteReply(ent, secret.id, "¿?")).rejects.toMatchObject({ code: "not_found" });

    // El mentor corrige su nota y responde la respuesta.
    const edited = await updateSessionNote(mentor, question.id, { body: "¿Qué tema de cálculo te cuesta más?" });
    expect(edited.updatedAt).toBeTruthy();
    await addNoteReply(mentor, question.id, "Perfecto, empezamos por ahí.");

    const studentView = await listProjectNotes(ent, p.id);
    expect(studentView.notes.map((n) => n.id)).toEqual([question.id]);
    expect(studentView.notes[0].replies.map((r) => r.body)).toEqual(["Las derivadas implícitas y la regla de la cadena", "Perfecto, empezamos por ahí."]);

    const mentorView = await listProjectNotes(mentor, p.id, { sessionId: session.id });
    expect(mentorView.notes.map((n) => n.id)).toEqual([question.id, secret.id]);

    const ws = await getSessionWorkspaceWithReplies(ent, session.id);
    expect(ws.permissions.canReply).toBe(true);
    expect(ws.notes[0].replies).toHaveLength(2);

    // Alguien ajeno al proyecto no lee ni responde.
    await expect(listProjectNotes(w.as("ent2"), p.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(addNoteReply(w.as("ent2"), question.id, "hola")).rejects.toMatchObject({ code: "not_found" });
  });

  it("el agente lee las notas y guarda la respuesta del estudiante", async () => {
    const { w, ent, mentor, p, session } = await setup();
    const question = await createSessionNote(mentor, p.id, { sessionId: session.id, kind: "question", body: "¿Cuántos ejercicios harás esta semana?" });
    const thread = await createAgentThread(ent, p.id, "Notas");

    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    const bodies: Array<{ messages: Array<{ role: string; content: unknown }>; tools?: Array<{ function: { name: string } }> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        bodies.push(body);
        const call = (name: string, args: unknown) => ({ content: "", tool_calls: [{ id: `c${bodies.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
        const message =
          bodies.length === 1
            ? call("read_mentor_notes", {})
            : bodies.length === 2
              ? call("save_note_reply", { note_id: question.id, body: "Haré 20 ejercicios de derivadas." })
              : { content: "Listo, respondí la pregunta de tu mentora." };
        return new Response(JSON.stringify({ model: "m", choices: [{ message }] }), { status: 200 });
      }),
    );

    const turn = await runAgentTurn(ent, { projectId: p.id, threadId: thread.id, message: "Responde la pregunta de mi mentora: haré 20 ejercicios de derivadas" });
    const names = bodies[0].tools?.map((t) => t.function.name) ?? [];
    expect(names).toEqual(expect.arrayContaining(["read_mentor_notes", "save_note_reply"]));
    expect(names).not.toContain("save_mentor_note");
    // El resultado de leer llega al modelo con el id de la nota.
    expect(JSON.stringify(bodies[1].messages)).toContain(question.id);
    expect(turn.result.reply).toContain("Listo");

    const replies = await w.repo.sessionNoteReplies.list({ noteId: question.id });
    expect(replies.map((r) => r.body)).toEqual(["Haré 20 ejercicios de derivadas."]);
    expect(replies[0].authorId).toBe(w.id("ent1"));
  });

  it("el mentor puede pedirle al agente que cree una nota", async () => {
    const { w, mentor, p, session } = await setup();
    const thread = await createAgentThread(mentor, p.id, "Sesión");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "");
    let n = 0;
    const tools: string[][] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options?: RequestInit) => {
        const body = JSON.parse(options?.body as string);
        tools.push((body.tools ?? []).map((t: { function: { name: string } }) => t.function.name));
        const message =
          ++n === 1
            ? { content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "save_mentor_note", arguments: JSON.stringify({ session_id: session.id, kind: "commitment", body: "Practicar 20 derivadas" }) } }] }
            : { content: "Guardé el compromiso en la sesión." };
        return new Response(JSON.stringify({ model: "m", choices: [{ message }] }), { status: 200 });
      }),
    );
    await runAgentTurn(mentor, { projectId: p.id, threadId: thread.id, message: "Anota como compromiso: practicar 20 derivadas" });
    expect(tools[0]).toContain("save_mentor_note");
    const notes = await w.repo.sessionNotes.list({ sessionId: session.id });
    expect(notes.map((x) => [x.kind, x.body, x.authorId])).toEqual([["commitment", "Practicar 20 derivadas", w.id("men1")]]);
  });
});
