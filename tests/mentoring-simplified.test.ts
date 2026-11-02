import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world, INTERVIEW } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { sendMessage } from "@/lib/services/conversation";
import { confirmSummary } from "@/lib/services/diagnosis";
import { closeSession, requestReview, scheduleSession, updatePostSessionSynthesis } from "@/lib/services/mentoring";
import { assignMentor } from "@/lib/services/admin";
import type { ServiceDeps } from "@/lib/services/base";

afterAll(closeWorlds);

async function readyForFirstReview(d: ServiceDeps, adm: ServiceDeps, mentorId: string) {
  const p = await createProject(d, { name: "Lavandería", description: "", nature: "exploring_idea" });
  for (const m of INTERVIEW) await sendMessage(d, p.id, m);
  await confirmSummary(d, p.id);
  await assignMentor(adm, p.id, mentorId);
  return p;
}

describe("Flujo de mentoría simplificado", () => {
  it("pedir revisión guarda la fecha y deja el briefing listo para el mentor", async () => {
    const { as, repo, id } = await world();
    const d = as("ent1");
    const p = await readyForFirstReview(d, as("adm"), id("men1"));
    const s = await requestReview(d, p.id, "first_review", { scheduledAt: "2026-11-05T15:00:00.000Z" });
    expect(s.scheduledAt).toBe("2026-11-05T15:00:00.000Z");
    const saved = await repo.mentorSessions.get(s.id);
    expect(saved?.preSessionBriefing?.suggestedAgenda.length).toBeGreaterThan(0);
  });

  it("agendar sirve solo para seguimientos: una revisión no se salta sus requisitos", async () => {
    const { as, id } = await world();
    const d = as("ent1");
    const p = await createProject(d, { name: "Sin resumen", description: "", nature: "exploring_idea" });
    await assignMentor(as("adm"), p.id, id("men1"));
    await expect(scheduleSession(d, p.id, { kind: "second_review" })).rejects.toThrow(/seguimiento/);
    await expect(scheduleSession(d, p.id, { kind: "first_review" })).rejects.toThrow(/seguimiento/);
    await expect(requestReview(d, p.id, "follow_up")).rejects.toThrow(/primera y la segunda/);
  });

  it("el cierre único registra acuerdo y prioridad, crea las tareas una vez y abre Probar", async () => {
    const { as, repo, id } = await world();
    const d = as("ent1");
    const m = as("men1");
    const p = await readyForFirstReview(d, as("adm"), id("men1"));
    const s = await requestReview(d, p.id, "first_review");
    await updatePostSessionSynthesis(m, s.id, {
      summary: "Hablamos de quién paga.",
      agreedDecisions: ["Investigar primero el prepago"],
      entrepreneurCommitments: [{ title: "Entrevistar a 5 estudiantes" }, { title: "Armar formulario de preventa" }],
      mentorCommitments: [],
    });

    const problem = (await repo.diagnosisItems.list({ projectId: p.id })).find((i) => i.category === "problem" && i.infoType !== "unknown");
    expect(problem).toBeTruthy();

    // Sin elegir problema no se cierra, y nada queda a medias.
    await expect(closeSession(m, s.id, { agreement: "Investigar primero quién paga." })).rejects.toThrow(/problema/);
    expect(await repo.tasks.list({ projectId: p.id })).toHaveLength(0);
    // El emprendedor no cierra la revisión.
    await expect(closeSession(d, s.id, { agreement: "Investigar primero quién paga.", priority: { itemId: problem!.id, rationale: "x" } })).rejects.toMatchObject({ code: "forbidden" });

    const closed = await closeSession(m, s.id, {
      agreement: "Investigar primero quién paga.",
      priority: { itemId: problem!.id, rationale: "Es lo que más incertidumbre tiene." },
    });
    expect(closed.status).toBe("completed");
    expect(closed.postSessionSynthesis?.commitmentsAdoptedAt).toBeTruthy();
    expect((await repo.tasks.list({ projectId: p.id })).map((t) => t.title).sort()).toEqual(["Armar formulario de preventa", "Entrevistar a 5 estudiantes"]);
    expect((await repo.diagnosisItems.get(problem!.id))?.priority?.rank).toBe(1);
    expect((await getWorkspace(d, p.id)).phase).toBe("hypotheses");

    // Editar la síntesis después no vuelve a crear las tareas.
    await updatePostSessionSynthesis(m, s.id, {
      summary: "Hablamos de quién paga (corregido).",
      agreedDecisions: [],
      entrepreneurCommitments: [{ title: "Entrevistar a 5 estudiantes" }],
      mentorCommitments: [],
    });
    expect((await repo.mentorSessions.get(s.id))?.postSessionSynthesis?.commitmentsAdoptedAt).toBeTruthy();
    expect(await repo.tasks.list({ projectId: p.id })).toHaveLength(2);
  });

  it("un seguimiento se cierra sin acuerdo obligatorio", async () => {
    const { as, id } = await world();
    const d = as("ent1");
    const m = as("men1");
    const p = await readyForFirstReview(d, as("adm"), id("men1"));
    const s = await scheduleSession(d, p.id, { kind: "follow_up" });
    const closed = await closeSession(m, s.id, {});
    expect(closed.status).toBe("completed");
  });
});
