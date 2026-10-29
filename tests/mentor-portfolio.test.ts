import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import {
  initiateMentorshipRelation,
  saveMentorshipAgreement,
  confirmMentorshipAgreement,
  createMentorshipGoal,
  transitionMentorshipStage,
} from "@/lib/services/mentorship-relation";
import { setTaskBlocked } from "@/lib/services/roadmap";
import { createTask } from "@/lib/services/validation";
import { scheduleSession } from "@/lib/services/mentoring";
import { getMentorPortfolio, dismissIntervention } from "@/lib/services/portfolio";

afterAll(closeWorlds);

describe("Fase 5: Productividad del Mentor y Cartera", () => {
  it("Escenario F1 — Dashboard de cartera calcula urgencia y prioriza emprendedores que necesitan intervención", async () => {
    const { as, id } = await world();
    const ent1 = as("ent1");
    const ent2 = as("ent2");
    const mentor = as("men1");
    const adm = as("adm");

    // Proyecto 1: Proyecto tranquilo con acuerdo activo y sin bloqueos
    const p1 = await createProject(ent1, {
      name: "BioFiltros Verde",
      description: "Filtros biológicos",
      nature: "operating_business",
    });
    await assignMentor(adm, p1.id, id("men1"));
    const rel1 = await initiateMentorshipRelation(ent1, p1.id, id("ent1"), id("men1"));
    await transitionMentorshipStage(mentor, rel1.id, "diagnosis");
    await transitionMentorshipStage(mentor, rel1.id, "agreement");
    await transitionMentorshipStage(mentor, rel1.id, "active_mentoring");
    const ag1 = await saveMentorshipAgreement(mentor, rel1.id, {
      frequency: "biweekly",
      sessionDurationMinutes: 60,
      authorizedChannels: ["email"],
      scope: "Escalar ventas",
      mentorCommitments: "Revisar pipeline",
      entrepreneurCommitments: "Traer métricas",
      confidentialityTerms: "Confidencial",
      expectedDurationWeeks: 12,
    });
    await confirmMentorshipAgreement(mentor, ag1.id);
    await confirmMentorshipAgreement(ent1, ag1.id);

    // Agendar próxima sesión dentro de 5 días
    await scheduleSession(mentor, p1.id, {
      kind: "follow_up",
      scheduledAt: "2026-11-05T15:00:00Z",
      relationId: rel1.id,
    });

    // Proyecto 2: Proyecto crítico con tarea bloqueada sin diagnosticar y acuerdo pendiente
    const p2 = await createProject(ent2, {
      name: "AgroSensor IoT",
      description: "Sensores de humedad",
      nature: "designing_solution",
    });
    await assignMentor(adm, p2.id, id("men1"));
    const rel2 = await initiateMentorshipRelation(ent2, p2.id, id("ent2"), id("men1"));
    await transitionMentorshipStage(mentor, rel2.id, "diagnosis");
    await transitionMentorshipStage(mentor, rel2.id, "agreement");

    // Crear tarea bloqueada en p2
    const task2 = await createTask(ent2, p2.id, {
      title: "Importar microcontroladores ESP32",
      actionType: "operational_task",
    });
    await setTaskBlocked(ent2, task2.id, "Aduana retuvo el paquete por falta de formulario");

    // Consultar el portfolio desde la perspectiva del mentor
    const portfolio = await getMentorPortfolio(mentor);

    expect(portfolio.mentorId).toBe(id("men1"));
    expect(portfolio.projects).toHaveLength(2);

    // El proyecto 2 (AgroSensor) debe tener mayor puntaje de urgencia que el proyecto 1
    const agroSummary = portfolio.projects.find((p) => p.projectId === p2.id);
    const bioSummary = portfolio.projects.find((p) => p.projectId === p1.id);

    expect(agroSummary).toBeDefined();
    expect(bioSummary).toBeDefined();

    expect(agroSummary!.urgencyScore).toBeGreaterThan(bioSummary!.urgencyScore);
    expect(portfolio.projects[0].projectId).toBe(p2.id); // Primero en la lista por urgencia

    // AgroSensor debe reflejar el bloqueo no diagnosticado
    expect(agroSummary!.blockedTasksCount).toBe(1);
    expect(agroSummary!.signals.some((s) => s.includes("Bloqueo sin diagnosticar"))).toBe(true);
    expect(agroSummary!.signals.some((s) => s.includes("Acuerdo bilateral pendiente"))).toBe(true);

    // Verificar las intervenciones dinámicas generadas
    expect(portfolio.interventions.length).toBeGreaterThanOrEqual(1);
    const blockerIntervention = portfolio.interventions.find(
      (i) => i.projectId === p2.id && i.category === "unresolved_blocker",
    );
    expect(blockerIntervention).toBeDefined();
    expect(blockerIntervention!.urgency).toBe("high");
    expect(blockerIntervention!.explanation.suggestedAction).toContain("Analizar la hipótesis de demora");
  });

  it("Escenario F2 — Permite descartar una intervención sin eliminar los datos", async () => {
    const { as, id, repo } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    const p = await createProject(ent, {
      name: "Logística Express",
      description: "Reparto de última milla",
      nature: "exploring_idea",
    });
    await assignMentor(adm, p.id, id("men1"));
    const rel = await initiateMentorshipRelation(ent, p.id, id("ent1"), id("men1"));

    // Tarea bloqueada
    const t = await createTask(ent, p.id, {
      title: "Contratar choferes",
      actionType: "operational_task",
    });
    await setTaskBlocked(ent, t.id, "No hay candidatos postulados");

    // Verificar intervención presente
    const pBefore = await getMentorPortfolio(mentor);
    expect(pBefore.interventions.some((i) => i.category === "unresolved_blocker")).toBe(true);

    // Descartar la intervención
    await dismissIntervention(mentor, {
      relationId: rel.id,
      category: "unresolved_blocker",
    });

    // Reconsultar: la intervención ya no aparece como pendiente en el portfolio
    const pAfter = await getMentorPortfolio(mentor);
    expect(pAfter.interventions.some((i) => i.relationId === rel.id && i.category === "unresolved_blocker")).toBe(false);

    // Trazabilidad: la auditoría registró intervention.dismissed
    const audits = await repo.auditEvents.list({ actorId: id("men1"), action: "intervention.dismissed" });
    expect(audits).toHaveLength(1);
  });
});
