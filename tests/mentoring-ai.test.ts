import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world, INTERVIEW } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { sendMessage } from "@/lib/services/conversation";
import { confirmSummary } from "@/lib/services/diagnosis";
import { addNotesBatch, completeFirstReview, requestReview, startSession, suggestFirstReview } from "@/lib/services/mentoring";
import { assignMentor } from "@/lib/services/admin";

afterAll(closeWorlds);

describe("Asistencia de IA en Primera Revisión (orientar el enfoque y cerrar acuerdo)", () => {
  it("recopila contexto acumulado, genera borrador de acuerdo y notas sugeridas, y permite persistirlas", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const otherMentor = as("men2");
    const adm = as("adm");

    // 1. Proyecto con entrevista y confirmación de resumen
    const p = await createProject(ent, { name: "EcoLimpieza", description: "Lavandería ecológica", nature: "exploring_idea" });
    for (const msg of INTERVIEW) {
      await sendMessage(ent, p.id, msg);
    }
    await confirmSummary(ent, p.id);

    // 2. Asignar mentor y solicitar primera revisión
    await assignMentor(adm, p.id, id("men1"));
    const session = await requestReview(ent, p.id, "first_review");
    await startSession(mentor, session.id);

    // 3. Verificación de permisos: el emprendedor no tiene rol mentor (forbidden)
    // y un mentor no asignado no tiene acceso al proyecto (not_found para no filtrar existencia)
    await expect(suggestFirstReview(ent, session.id)).rejects.toMatchObject({
      name: "DomainError",
      code: "forbidden",
    });
    await expect(suggestFirstReview(otherMentor, session.id)).rejects.toMatchObject({
      name: "DomainError",
      code: "not_found",
    });

    // 4. Invocación de suggestFirstReview por el mentor asignado
    const suggestion = await suggestFirstReview(mentor, session.id);

    // Debe contener una propuesta de acuerdo sustancial (mínimo 10 caracteres)
    expect(suggestion.agreement).toBeDefined();
    expect(suggestion.agreement.length).toBeGreaterThanOrEqual(10);
    expect(suggestion.agreement).toMatch(/investigar/i);

    // Debe contener notas sugeridas tipadas (preguntas, observaciones o sugerencias)
    expect(suggestion.suggestedNotes).toBeDefined();
    expect(suggestion.suggestedNotes.length).toBeGreaterThan(0);
    for (const note of suggestion.suggestedNotes) {
      expect(["observation", "question", "suggestion"]).toContain(note.kind);
      expect(note.body.length).toBeGreaterThan(5);
    }

    // Se registró evento de auditoría
    const auditEvents = await repo.auditEvents.list({ projectId: p.id, action: "ai.invoked" });
    expect(auditEvents.length).toBeGreaterThan(0);
    expect(auditEvents.some((a) => a.meta?.task === "first_review_suggestion")).toBe(true);

    // 5. Guardar notas sugeridas en lote (addNotesBatch)
    const savedNotes = await addNotesBatch(mentor, session.id, suggestion.suggestedNotes);
    expect(savedNotes).toHaveLength(suggestion.suggestedNotes.length);

    // Verificar que las notas aparecen en la sesión dentro del workspace
    const wsBeforeClosing = await getWorkspace(mentor, p.id);
    const sessionNotesInWs = wsBeforeClosing.notes.filter((n) => n.sessionId === session.id);
    expect(sessionNotesInWs.length).toBeGreaterThanOrEqual(suggestion.suggestedNotes.length);

    // 6. Completar la primera revisión usando el acuerdo sugerido
    await completeFirstReview(mentor, session.id, suggestion.agreement);

    // La sesión queda completada y el proyecto pasa a priorizar problemas
    const wsAfter = await getWorkspace(ent, p.id);
    const completedSession = wsAfter.sessions.find((s) => s.id === session.id);
    expect(completedSession?.status).toBe("completed");
    expect(wsAfter.phase).toBe("prioritizing");

    // 7. No se puede invocar la sugerencia sobre una sesión ya completada
    await expect(suggestFirstReview(mentor, session.id)).rejects.toThrow(/terminó/);
  });
});
