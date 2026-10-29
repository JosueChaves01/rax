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
import {
  recordCycleEvaluation,
  listCycleEvaluations,
} from "@/lib/services/evaluation";

afterAll(closeWorlds);

describe("Fase 6: Evaluación de Resultados, Cierre y Renovación", () => {
  it("Escenario H1 — Evaluación compara línea base vs resultados observados y califica autonomía", async () => {
    const { as, id, repo } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    const p = await createProject(ent, {
      name: "NutriSnacks",
      description: "Snacks saludables de legumbres",
      nature: "operating_business",
    });
    await assignMentor(adm, p.id, id("men1"));
    const rel = await initiateMentorshipRelation(ent, p.id, id("ent1"), id("men1"));
    await transitionMentorshipStage(mentor, rel.id, "diagnosis");
    await transitionMentorshipStage(mentor, rel.id, "agreement");
    await transitionMentorshipStage(mentor, rel.id, "active_mentoring");

    // Crear dos objetivos con línea base
    const g1 = await createMentorshipGoal(mentor, rel.id, {
      title: "Validar costo de empaque biodegradable",
      description: "Encontrar proveedor local",
      whyItMatters: "Margen y sustentabilidad",
      kind: "metric",
      baseline: "Costo unitario actual $1.20 importado",
      targetResult: "Costo unitario < $0.80 nacional",
      priority: "high",
    });

    const g2 = await createMentorshipGoal(mentor, rel.id, {
      title: "Desarrollar hábito de revisión semanal de caja",
      description: "Construir flujo de caja proyectado a 8 semanas",
      whyItMatters: "Prevenir descalces",
      kind: "capability",
      baseline: "No se lleva registro sistemático",
      targetResult: "Flujo de caja actualizado cada lunes",
      priority: "medium",
    });

    // Registrar evaluación del ciclo 1
    const evaluation = await recordCycleEvaluation(mentor, {
      relationId: rel.id,
      cycleNumber: 1,
      goalEvaluations: [
        {
          goalId: g1.id,
          goalTitle: g1.title,
          baseline: g1.baseline,
          targetResult: g1.targetResult,
          actualResult: "Proveedor local acordado a $0.72 por unidad",
          status: "achieved",
          evidenceNotes: "Contrato firmado y primera muestra aprobada.",
        },
        {
          goalId: g2.id,
          goalTitle: g2.title,
          baseline: g2.baseline,
          targetResult: g2.targetResult,
          actualResult: "Planilla activa desde hace 4 semanas consecutivas",
          status: "achieved",
          evidenceNotes: "Emprendedor gestiona la herramienta sin asistencia.",
        },
      ],
      autonomyAssessment: {
        rating: "autonomous",
        observations: "El emprendedor consolidó criterio propio en la gestión de costos y flujo de caja.",
      },
      mentorFeedback: "Excelente capacidad de ejecución y apertura al aprendizaje.",
      entrepreneurFeedback: "El acompañamiento me dio claridad para negociar con proveedores.",
      decision: "renew",
      nextCycleFocus: "Ciclo 2: Estrategia de canal mayorista y distribución en dietéticas.",
    });

    expect(evaluation.id).toBeDefined();
    expect(evaluation.decision).toBe("renew");
    expect(evaluation.autonomyAssessment.rating).toBe("autonomous");

    // Verificar que los objetivos actualizaron su status a achieved
    const updatedG1 = await repo.mentorshipGoals.get(g1.id);
    const updatedG2 = await repo.mentorshipGoals.get(g2.id);
    expect(updatedG1?.status).toBe("achieved");
    expect(updatedG2?.status).toBe("achieved");

    // La relación pasó a estado "renewed"
    const updatedRel = await repo.mentorshipRelations.get(rel.id);
    expect(updatedRel?.stage).toBe("renewed");

    // Verificar auditorías
    const audits = await repo.auditEvents.list({ projectId: p.id });
    expect(audits.some((a) => a.action === "mentorship.cycle_evaluated")).toBe(true);
    expect(audits.some((a) => a.action === "mentorship.renewed")).toBe(true);
  });

  it("Escenario H2 — Cierre formal archiva el ciclo manteniendo el historial inmutable", async () => {
    const { as, id, repo } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    const p = await createProject(ent, {
      name: "Taller Artesanal",
      description: "Cerámica contemporánea",
      nature: "operating_business",
    });
    await assignMentor(adm, p.id, id("men1"));
    const rel = await initiateMentorshipRelation(ent, p.id, id("ent1"), id("men1"));
    await transitionMentorshipStage(mentor, rel.id, "diagnosis");
    await transitionMentorshipStage(mentor, rel.id, "agreement");
    await transitionMentorshipStage(mentor, rel.id, "active_mentoring");

    const goal = await createMentorshipGoal(mentor, rel.id, {
      title: "Lanzar tienda online",
      description: "Configurar pasarela y catálogo",
      whyItMatters: "Ventas directas",
      kind: "strategic",
      baseline: "Solo ventas por mensaje directo",
      targetResult: "Tienda online operativa con catálogo",
      priority: "high",
    });

    // Cierre exitoso del proceso
    await recordCycleEvaluation(mentor, {
      relationId: rel.id,
      cycleNumber: 1,
      goalEvaluations: [
        {
          goalId: goal.id,
          goalTitle: goal.title,
          baseline: goal.baseline,
          targetResult: goal.targetResult,
          actualResult: "Tienda lanzada con 30 productos y pasarela integrada",
          status: "achieved",
          evidenceNotes: "Ventas activas.",
        },
      ],
      autonomyAssessment: {
        rating: "autonomous",
        observations: "Capacidad demostrada para operar la tienda independientemente.",
      },
      mentorFeedback: "Objetivos de acompañamiento cumplidos satisfactoriamente.",
      decision: "close",
      nextCycleFocus: "Proceso completado.",
    });

    // Estado cerrado
    const closedRel = await repo.mentorshipRelations.get(rel.id);
    expect(closedRel?.stage).toBe("closed");

    // Historial inmutable disponible para ambas partes
    const historyForMentor = await listCycleEvaluations(mentor, rel.id);
    const historyForEnt = await listCycleEvaluations(ent, rel.id);

    expect(historyForMentor).toHaveLength(1);
    expect(historyForEnt).toHaveLength(1);
    expect(historyForEnt[0].goalEvaluations[0].actualResult).toContain("Tienda lanzada");

    // Ningún dato fue borrado
    const goalsInRepo = await repo.mentorshipGoals.list({ relationId: rel.id });
    expect(goalsInRepo).toHaveLength(1);

    // Auditoría registró mentorship.closed
    const audits = await repo.auditEvents.list({ projectId: p.id, action: "mentorship.closed" });
    expect(audits).toHaveLength(1);
  });
});
