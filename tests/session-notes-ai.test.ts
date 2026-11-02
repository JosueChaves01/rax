import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world, INTERVIEW } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { sendMessage } from "@/lib/services/conversation";
import { confirmSummary } from "@/lib/services/diagnosis";
import { addNotesBatch, requestReview, startSession, suggestSessionNotes } from "@/lib/services/mentoring";
import { addCallSegment, startCall } from "@/lib/services/session-calls";
import { assignMentor } from "@/lib/services/admin";

afterAll(closeWorlds);

async function setup() {
  const w = await world();
  const ent = w.as("ent1");
  const mentor = w.as("men1");
  const p = await createProject(ent, { name: "EcoLimpieza", description: "Lavandería ecológica", nature: "exploring_idea" });
  for (const msg of INTERVIEW) await sendMessage(ent, p.id, msg);
  await confirmSummary(ent, p.id);
  await assignMentor(w.as("adm"), p.id, w.id("men1"));
  const session = await requestReview(ent, p.id, "first_review");
  await startSession(mentor, session.id);
  return { ...w, ent, mentor, p, session };
}

describe("Notas con IA en Orientar", () => {
  it("solo el mentor de la sesión pide el borrador; sin llamada salen notas de preparación desde el contexto", async () => {
    const { ent, mentor, as, session, repo, p } = await setup();
    await expect(suggestSessionNotes(ent, session.id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(suggestSessionNotes(as("men2"), session.id)).rejects.toMatchObject({ code: "not_found" });

    const draft = await suggestSessionNotes(mentor, session.id);
    expect(draft.basedOn).toBe("context");
    expect(draft.notes.length).toBeGreaterThan(0);
    for (const n of draft.notes) expect(["question", "observation", "suggestion"]).toContain(n.kind);
    // El borrador no se guarda solo.
    expect((await repo.sessionNotes.list({ sessionId: session.id })).length).toBe(0);
    const audits = await repo.auditEvents.list({ projectId: p.id, action: "ai.invoked" });
    expect(audits.some((a) => a.meta?.task === "session_notes")).toBe(true);
  });

  it("usa la transcripción de la reunión y guarda solo lo que el mentor editó", async () => {
    const { ent, mentor, session, p } = await setup();
    const call = await startCall(mentor, session.id);
    await startCall(ent, session.id);
    await addCallSegment(mentor, call.id, "Quedamos en enfocarnos primero en las oficinas del centro.", 0);
    await addCallSegment(ent, call.id, "Voy a entrevistar a diez oficinas antes del viernes.", 20_000);

    const draft = await suggestSessionNotes(mentor, session.id);
    expect(draft.basedOn).toBe("transcript");
    expect(draft.notes.some((n) => n.kind === "agreement" && /oficinas/.test(n.body))).toBe(true);
    expect(draft.notes.some((n) => n.kind === "commitment" && /entrevistar/.test(n.body))).toBe(true);

    const edited = draft.notes.slice(0, 2).map((n, i) => ({ ...n, body: i === 0 ? "Acuerdo editado: oficinas del centro primero." : n.body }));
    await addNotesBatch(mentor, session.id, edited);
    const ws = await getWorkspace(mentor, p.id);
    const notes = ws.notes.filter((n) => n.sessionId === session.id);
    expect(notes).toHaveLength(2);
    expect(notes.some((n) => n.body === "Acuerdo editado: oficinas del centro primero.")).toBe(true);

    // Lo ya guardado no se vuelve a proponer.
    const again = await suggestSessionNotes(mentor, session.id);
    expect(again.notes.some((n) => n.body === edited[1].body)).toBe(false);
  });
});
