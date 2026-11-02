import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world, INTERVIEW } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { sendMessage } from "@/lib/services/conversation";
import { confirmSummary } from "@/lib/services/diagnosis";
import { confirmSession, requestReview } from "@/lib/services/mentoring";
import { assignMentor } from "@/lib/services/admin";
import { executeWorkflowTool } from "@/lib/ai/workflow-tools";
import { applyAgentProposal } from "@/lib/services/agent-actions";
import { buildProjectState, renderProjectState } from "@/lib/ai/project-state";
import { parseSessionDateTime } from "@/lib/dates";
import type { ServiceDeps } from "@/lib/services/base";

afterAll(closeWorlds);

const propose = (d: ServiceDeps, projectId: string, args: Record<string, unknown>) => executeWorkflowTool(d, projectId, "propose_step_action", args);

async function applyAll(d: ServiceDeps, projectId: string, args: Record<string, unknown>) {
  const res = await propose(d, projectId, args);
  expect(res.ok, res.summary).toBe(true);
  return Promise.all(res.proposals.map((p) => applyAgentProposal(d, projectId, p)));
}

describe("fechas de sesión escritas por el agente", () => {
  it("interpreta la hora local de Costa Rica y exige la hora", () => {
    expect(parseSessionDateTime("2026-11-05T15:00")).toBe("2026-11-05T21:00:00.000Z");
    expect(parseSessionDateTime("2026-11-05T15:00-06:00")).toBe("2026-11-05T21:00:00.000Z");
    expect(parseSessionDateTime("2026-11-05T21:00:00.000Z")).toBe("2026-11-05T21:00:00.000Z");
    expect(() => parseSessionDateTime("2026-11-05")).toThrow(/hora/);
    expect(() => parseSessionDateTime("el jueves")).toThrow(/formato/);
    expect(parseSessionDateTime(undefined)).toBeUndefined();
  });
});

describe("agendar y confirmar revisiones desde el agente", () => {
  it("el estudiante pide la revisión con fecha y el mentor la confirma, cada uno desde su chat", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const men = w.as("men1");
    const p = await createProject(ent, { name: "Tutorías de cálculo", description: "", nature: "exploring_idea" });

    // Sin resumen confirmado ni mentor, el agente no ofrece la tarjeta: explica qué falta.
    const early = await propose(ent, p.id, { action: "request_review", kind: "first_review", scheduledAt: "2026-11-05T15:00-06:00" });
    expect(early.ok).toBe(false);
    expect(early.summary).toMatch(/resumen/);

    for (const m of INTERVIEW) await sendMessage(ent, p.id, m);
    await confirmSummary(ent, p.id);
    const noMentor = await propose(ent, p.id, { action: "request_review", kind: "first_review", scheduledAt: "2026-11-05T15:00-06:00" });
    expect(noMentor.summary).toMatch(/mentor asignado/);
    await assignMentor(w.as("adm"), p.id, w.id("men1"));

    // Sin hora o en el pasado tampoco.
    expect((await propose(ent, p.id, { action: "request_review", kind: "first_review", scheduledAt: "2026-11-05" })).summary).toMatch(/hora/);
    expect((await propose(ent, p.id, { action: "request_review", kind: "first_review", scheduledAt: "2026-09-01T10:00" })).summary).toMatch(/pasó/);
    // La segunda revisión pide resultados registrados.
    expect((await propose(ent, p.id, { action: "request_review", kind: "second_review", scheduledAt: "2026-11-05T15:00" })).summary).toMatch(/resultado/);

    const card = await propose(ent, p.id, { action: "request_review", kind: "first_review", scheduledAt: "2026-11-05T15:00-06:00" });
    expect(card.proposals[0].title).toContain("jueves 5 de noviembre de 2026, 15:00");
    const [applied] = await Promise.all(card.proposals.map((x) => applyAgentProposal(ent, p.id, x)));
    expect(applied.notice).toMatch(/Falta que el mentor confirme/);
    const [requested] = (await w.repo.mentorSessions.list({ projectId: p.id })).filter((s) => s.kind === "first_review");
    expect(requested.scheduledAt).toBe("2026-11-05T21:00:00.000Z");
    expect(requested.confirmedAt).toBeUndefined();

    // No se pide dos veces.
    expect((await propose(ent, p.id, { action: "request_review", kind: "first_review", scheduledAt: "2026-11-06T15:00" })).summary).toMatch(/en curso/);

    // El estado que lee el agente dice que falta la confirmación.
    const entState = renderProjectState(buildProjectState(await getWorkspace(ent, p.id), "entrepreneur", "2026-10-02T00:00:00.000Z"));
    expect(entState).toContain(`[${requested.id}] Primera revisión`);
    expect(entState).toContain("falta que el mentor la confirme");
    expect(entState).toContain("2026-11-05T15:00-06:00");

    // El estudiante no confirma: el agente no se lo propone.
    const denied = await propose(ent, p.id, { action: "confirm_session", targetId: requested.id });
    expect(denied.ok).toBe(false);
    await expect(confirmSession(ent, requested.id)).rejects.toMatchObject({ code: "forbidden" });

    // El mentor confirma la fecha pedida (sin indicar la sesión, toma la que espera confirmación).
    const [confirmed] = await applyAll(men, p.id, { action: "confirm_session" });
    expect(confirmed.notice).toContain("jueves 5 de noviembre de 2026, 15:00");
    const after = await w.repo.mentorSessions.get(requested.id);
    expect(after?.confirmedAt).toBeTruthy();
    expect(after?.scheduledAt).toBe("2026-11-05T21:00:00.000Z");
    const menState = renderProjectState(buildProjectState(await getWorkspace(men, p.id), "mentor", "2026-10-02T00:00:00.000Z"));
    expect(menState).toContain("confirmada por el mentor para el jueves 5 de noviembre de 2026, 15:00");
    // Ya no queda nada por confirmar.
    expect((await propose(men, p.id, { action: "confirm_session" })).summary).toMatch(/esperando confirmación/);

    // El mentor puede moverla a otra fecha: queda confirmada con la nueva.
    await applyAll(men, p.id, { action: "confirm_session", targetId: requested.id, scheduledAt: "2026-11-06T09:30" });
    expect((await w.repo.mentorSessions.get(requested.id))?.scheduledAt).toBe("2026-11-06T15:30:00.000Z");
    const audit = await w.repo.auditEvents.list({ projectId: p.id });
    expect(audit.filter((e) => e.action === "session.confirmed")).toHaveLength(2);
  });

  it("una revisión pedida sin fecha necesita que el mentor proponga una para confirmarla", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const men = w.as("men1");
    const p = await createProject(ent, { name: "Huerta escolar", description: "", nature: "exploring_idea" });
    for (const m of INTERVIEW) await sendMessage(ent, p.id, m);
    await confirmSummary(ent, p.id);
    await assignMentor(w.as("adm"), p.id, w.id("men1"));
    const s = await requestReview(ent, p.id, "first_review");

    expect((await propose(men, p.id, { action: "confirm_session", targetId: s.id })).summary).toMatch(/no tiene fecha/);
    await expect(confirmSession(men, s.id)).rejects.toThrow(/no tiene fecha/);
    await applyAll(men, p.id, { action: "confirm_session", targetId: s.id, scheduledAt: "2026-11-10T16:00-06:00" });
    const saved = await w.repo.mentorSessions.get(s.id);
    expect(saved?.scheduledAt).toBe("2026-11-10T22:00:00.000Z");
    expect(saved?.confirmedAt).toBeTruthy();
  });

  it("un seguimiento que agenda el propio mentor ya queda confirmado", async () => {
    const w = await world();
    const ent = w.as("ent1");
    const men = w.as("men1");
    const byMentor = await createProject(ent, { name: "Taller de robótica", description: "", nature: "exploring_idea" });
    const byStudent = await createProject(ent, { name: "Club de lectura", description: "", nature: "exploring_idea" });
    for (const p of [byMentor, byStudent]) await assignMentor(w.as("adm"), p.id, w.id("men1"));
    await applyAll(men, byMentor.id, { action: "schedule_session", scheduledAt: "2026-11-12T10:00" });
    await applyAll(ent, byStudent.id, { action: "schedule_session", scheduledAt: "2026-11-13T10:00" });
    const [m] = await w.repo.mentorSessions.list({ projectId: byMentor.id });
    const [e] = await w.repo.mentorSessions.list({ projectId: byStudent.id });
    expect([m.scheduledAt, Boolean(m.confirmedAt)]).toEqual(["2026-11-12T16:00:00.000Z", true]);
    expect([e.scheduledAt, Boolean(e.confirmedAt)]).toEqual(["2026-11-13T16:00:00.000Z", false]);
  });
});
