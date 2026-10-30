import { afterAll, describe, expect, it, vi } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import {
  confirmMentorshipAgreement,
  createMentorshipGoal,
  decideCompatibility,
  initiateMentorshipRelation,
  saveMentorshipAgreement,
} from "@/lib/services/mentorship-relation";
import { createMilestone, diagnoseTaskDelay } from "@/lib/services/roadmap";
import { createTask, setTaskStatus } from "@/lib/services/validation";
import { sendMessage } from "@/lib/services/conversation";
import { SimulatedProvider } from "@/lib/ai/simulated";
import {
  addNote,
  adoptPostSessionCommitments,
  completeSession,
  generatePostSessionSynthesis,
  generatePreSessionBriefing,
  scheduleSession,
} from "@/lib/services/mentoring";

afterAll(closeWorlds);

describe("Fase 4: Ciclo de Sesiones, Briefing 4-Capas y Privacidad Dual (Principios 2.1, 2.2, 2.4)", () => {
  it("Escenario E1 — Agendamiento y Preparación de Sesión con Briefing de 4 Capas de Memoria", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const stranger = as("ent2");
    const adm = as("adm");

    // 1. Proyecto base, asignación y relación de mentoría
    const p = await createProject(ent, {
      name: "SolarClean",
      description: "Limpieza automatizada de paneles solares",
      nature: "operating_business",
    });
    await assignMentor(adm, p.id, id("men1"));
    const rel = await initiateMentorshipRelation(ent, p.id, id("ent1"), id("men1"));
    await decideCompatibility(mentor, rel.id, "proceed");

    // 2. Acuerdo formal y objetivo
    const agr = await saveMentorshipAgreement(ent, rel.id, {
      frequency: "biweekly",
      sessionDurationMinutes: 60,
      authorizedChannels: ["Google Meet", "WhatsApp"],
      scope: "Validación de modelo comercial B2B con plantas solares",
      mentorCommitments: "Puntualidad y feedback constructivo",
      entrepreneurCommitments: "Actualizar métricas 24h antes",
      confidentialityTerms: "Confidencialidad recíproca",
      expectedDurationWeeks: 12,
    });
    await confirmMentorshipAgreement(mentor, agr.id);
    await confirmMentorshipAgreement(ent, agr.id);

    const goal = await createMentorshipGoal(mentor, rel.id, {
      title: "Validar costo operativo por MW instalado",
      description: "Medir costo de limpieza mecánica vs tradicional",
      whyItMatters: "Clave para propuesta económica",
      kind: "metric",
      baseline: "$120/MW",
      targetResult: "$75/MW",
      priority: "high",
    });

    const ms = await createMilestone(ent, p.id, {
      title: "Piloto en parque solar Atacama",
      goalId: goal.id,
    });

    // 3. Ejecución previa: tarea completada y tarea con retraso diagnosticado
    const t1 = await createTask(ent, p.id, {
      title: "Medición de consumo de agua por panel",
      actionType: "operational_task",
      milestoneId: ms.id,
    });
    await setTaskStatus(ent, t1.id, "done");

    const t2 = await createTask(ent, p.id, {
      title: "Entrevistar a jefe de operaciones de planta SolarSur",
      actionType: "conversation_third_party",
      milestoneId: ms.id,
    });
    await diagnoseTaskDelay(mentor, t2.id, {
      causeCategory: "external",
      detail: "Planta en paro técnico; entrevista reprogramada",
    });

    // 4. Agendar sesión de seguimiento
    const session = await scheduleSession(ent, p.id, {
      kind: "follow_up",
      scheduledAt: "2026-11-05T15:00:00.000Z",
      relationId: rel.id,
    });
    expect(session.status).toBe("pending");
    expect(session.scheduledAt).toBe("2026-11-05T15:00:00.000Z");

    // 5. Control de acceso: usuario ajeno no puede generar el briefing
    await expect(generatePreSessionBriefing(stranger, session.id)).rejects.toMatchObject({
      name: "DomainError",
      code: "not_found",
    });

    // 6. El mentor genera el briefing de 4 capas de memoria antes de la sesión
    const briefing = await generatePreSessionBriefing(mentor, session.id);
    expect(briefing.activeAgreementsAndGoalsSummary).toContain("Validar costo operativo");
    expect(briefing.recentProgressSummary).toContain("Medición de consumo de agua");
    expect(briefing.recentProgressSummary).toContain("Planta en paro técnico");
    expect(briefing.suggestedAgenda.length).toBeGreaterThanOrEqual(3);
    expect(briefing.suggestedQuestions.length).toBeGreaterThanOrEqual(2);

    // Auditoría verificada
    const audits = await repo.auditEvents.list({ projectId: p.id, action: "session.briefing_generated" });
    expect(audits).toHaveLength(1);
  });

  it("Escenario E2 — Toma de notas en vivo con privacidad dual (notas privadas vs compartidas)", async () => {
    const { as, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    const p = await createProject(ent, {
      name: "HealthTrack",
      description: "Monitoreo remoto de pacientes",
      nature: "operating_business",
    });
    await assignMentor(adm, p.id, id("men1"));

    const session = await scheduleSession(mentor, p.id, {
      kind: "follow_up",
    });

    // 1. Mentor agrega nota compartida (acuerdo y decisión)
    const sharedNote = await addNote(
      mentor,
      session.id,
      "agreement",
      "Acordamos priorizar la integración con HL7 antes que la app móvil.",
      undefined,
      false,
    );
    expect(sharedNote.isPrivate).toBe(false);

    // 2. Mentor agrega nota privada (reflexión confidencial del mentor)
    const privateNote = await addNote(
      mentor,
      session.id,
      "observation",
      "Observación privada: El fundador muestra signos de fatiga; evaluar reducir alcance temporal.",
      undefined,
      true,
    );
    expect(privateNote.isPrivate).toBe(true);

    // The entrepreneur interview must never send private session notes to the AI,
    // including in the in-memory test repository where RLS is not present.
    const ai = new SimulatedProvider();
    const interpret = vi.spyOn(ai, "interpret");
    await sendMessage(as("ent1", ai), p.id, "Quiero revisar el siguiente paso del proyecto.");
    expect(interpret).toHaveBeenCalledOnce();
    expect(interpret.mock.calls[0][0].mentorNotes).not.toContain(privateNote.body);

    // 3. Emprendedor consulta el workspace: NO debe ver la nota privada
    const wsEntrepreneur = await getWorkspace(ent, p.id);
    const entrepreneurNotes = wsEntrepreneur.notes.filter((n) => n.sessionId === session.id);
    expect(entrepreneurNotes).toHaveLength(1);
    expect(entrepreneurNotes[0].body).toContain("Acordamos priorizar la integración");
    expect(entrepreneurNotes.some((n) => n.isPrivate)).toBe(false);

    // 4. Mentor consulta el workspace: debe ver tanto la compartida como su nota privada
    const wsMentor = await getWorkspace(mentor, p.id);
    const mentorNotes = wsMentor.notes.filter((n) => n.sessionId === session.id);
    expect(mentorNotes).toHaveLength(2);
    expect(mentorNotes.some((n) => n.isPrivate)).toBe(true);
  });

  it("Escenario E3 — Síntesis Pos-Sesión y Adopción en 1 Clic de Compromisos", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    const p = await createProject(ent, {
      name: "DevHub",
      description: "Herramienta colaborativa para desarrolladores",
      nature: "operating_business",
    });
    await assignMentor(adm, p.id, id("men1"));

    const session = await scheduleSession(mentor, p.id, {
      kind: "follow_up",
    });

    // Notas tomadas durante la sesión
    await addNote(mentor, session.id, "agreement", "Foco puesto en reducir el tiempo de onboarding.", undefined, false);
    await addNote(mentor, session.id, "commitment", "Entrevistar a 5 usuarios que abandonaron en el paso 2.", undefined, false);
    await addNote(mentor, session.id, "decision", "Descartar soporte de autenticación LDAP por ahora.", undefined, false);

    // 1. Generar síntesis pos-sesión
    const synthesis = await generatePostSessionSynthesis(mentor, session.id);
    expect(synthesis.summary).toBeDefined();
    expect(synthesis.agreedDecisions.length).toBeGreaterThanOrEqual(1);
    expect(synthesis.entrepreneurCommitments.length).toBeGreaterThanOrEqual(1);

    const synthAudits = await repo.auditEvents.list({ projectId: p.id, action: "session.synthesis_generated" });
    expect(synthAudits).toHaveLength(1);

    // 2. Adoptar compromisos en 1 clic
    const adoptedTasks = await adoptPostSessionCommitments(mentor, session.id);
    expect(adoptedTasks.length).toBeGreaterThanOrEqual(1);

    // Verificar que las tareas creadas viven en el proyecto
    const projectTasks = await repo.tasks.list({ projectId: p.id });
    expect(projectTasks.length).toBeGreaterThanOrEqual(1);
    expect(projectTasks[0].status).toBe("todo");

    const adoptAudits = await repo.auditEvents.list({ projectId: p.id, action: "session.commitments_adopted" });
    expect(adoptAudits).toHaveLength(1);

    // 3. Finalizar sesión
    const completedSession = await completeSession(mentor, session.id, "Sesión muy productiva, foco claro.");
    expect(completedSession.status).toBe("completed");
    expect(completedSession.completedAt).toBeDefined();

    const completeAudits = await repo.auditEvents.list({ projectId: p.id, action: "session.completed" });
    expect(completeAudits).toHaveLength(1);
  });
});
