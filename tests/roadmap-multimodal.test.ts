import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import {
  confirmMentorshipAgreement,
  createMentorshipGoal,
  decideCompatibility,
  initiateMentorshipRelation,
} from "@/lib/services/mentorship-relation";
import {
  attachEvidenceToTask,
  createMilestone,
  deleteMilestone,
  diagnoseTaskDelay,
  setTaskBlocked,
  updateMilestone,
  updateMilestoneStatus,
} from "@/lib/services/roadmap";
import {
  addEvidence,
  approveHypothesis,
  createExperiment,
  createTask,
  createTasksBatch,
  proposeHypothesis,
  submitHypothesis,
} from "@/lib/services/validation";

afterAll(closeWorlds);

describe("Fase 3: Hoja de Ruta y Ejecución Multimodal (Principios 2.3 y 2.6)", () => {
  it("Escenario D1 — Gestión de hitos estratégicos de la hoja de ruta con trazabilidad", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const stranger = as("ent2");
    const adm = as("adm");

    // 1. Proyecto base y relación de mentoría
    const p = await createProject(ent, {
      name: "AgroTech Sensor",
      description: "Monitoreo satelital de cultivos",
      nature: "operating_business",
    });
    await assignMentor(adm, p.id, id("men1"));
    const rel = await initiateMentorshipRelation(ent, p.id, id("ent1"), id("men1"));
    await decideCompatibility(mentor, rel.id, "proceed");

    // Objetivo de mentoría
    const goal = await createMentorshipGoal(mentor, rel.id, {
      title: "Cerrar 3 pilotos comerciales pagos",
      description: "Validar disposición a pagar con cooperativas agrícolas",
      whyItMatters: "Demuestra tracción comercial antes de levantar capital",
      kind: "strategic",
      baseline: "0 pilotos activos",
      targetResult: "3 contratos de piloto firmados y facturados",
      priority: "high",
    });

    // 2. Control de acceso: un usuario ajeno no puede crear hitos
    await expect(
      createMilestone(stranger, p.id, {
        title: "Primer piloto instalado",
      }),
    ).rejects.toMatchObject({
      name: "DomainError",
      code: "not_found",
    });

    // Validación de longitud mínima de título
    await expect(
      createMilestone(ent, p.id, {
        title: "No",
      }),
    ).rejects.toMatchObject({
      name: "DomainError",
      code: "validation",
    });

    // 3. Crear hito vinculado al objetivo de mentoría
    const m1 = await createMilestone(ent, p.id, {
      title: "Despliegue de sensores en campo de prueba",
      description: "Verificar calibración y transmisión continua durante 7 días",
      targetDate: "2026-11-15",
      goalId: goal.id,
      relationId: rel.id,
    });

    expect(m1.title).toBe("Despliegue de sensores en campo de prueba");
    expect(m1.status).toBe("pending");
    expect(m1.goalId).toBe(goal.id);

    // Verificar auditoría de creación de hito
    const createdAudits = await repo.auditEvents.list({
      projectId: p.id,
      action: "roadmap.milestone_created",
    });
    expect(createdAudits).toHaveLength(1);
    expect(createdAudits[0].targetId).toBe(m1.id);

    // 4. Edición de hito
    const updatedM1 = await updateMilestone(mentor, m1.id, {
      description: "Verificar calibración y transmisión continua durante 14 días",
    });
    expect(updatedM1.description).toContain("14 días");

    // 5. Transición de estado del hito: pending -> in_progress -> achieved
    const inProgressM1 = await updateMilestoneStatus(ent, m1.id, "in_progress");
    expect(inProgressM1.status).toBe("in_progress");

    const achievedM1 = await updateMilestoneStatus(mentor, m1.id, "achieved");
    expect(achievedM1.status).toBe("achieved");

    // Verificar auditoría de cambio de estado
    const statusAudits = await repo.auditEvents.list({
      projectId: p.id,
      action: "roadmap.milestone_status_changed",
    });
    expect(statusAudits.length).toBeGreaterThanOrEqual(2);

    // 6. Creación y descarte (deferred) de un hito secundario
    const m2 = await createMilestone(ent, p.id, {
      title: "Hito temporal a descartar",
    });
    await deleteMilestone(ent, m2.id);
    const postDelete = await repo.roadmapMilestones.get(m2.id);
    expect(postDelete?.status).toBe("deferred");
  });

  it("Escenario D2 — Ejecución multimodal sin forzar que todo problema sea un experimento", async () => {
    const { as, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    const p = await createProject(ent, {
      name: "BioPharma Lab",
      description: "Kits de diagnóstico rápido",
      nature: "operating_business",
    });
    await assignMentor(adm, p.id, id("men1"));

    const m = await createMilestone(ent, p.id, {
      title: "Hito 1: Preparación regulatoria y financiera",
    });

    // 1. Tarea operativa estándar
    const tOp = await createTask(ent, p.id, {
      title: "Renovar póliza de seguro de laboratorio",
      actionType: "operational_task",
      milestoneId: m.id,
    });
    expect(tOp.actionType).toBe("operational_task");
    expect(tOp.milestoneId).toBe(m.id);

    // 2. Decisión estratégica
    const tDec = await createTask(mentor, p.id, {
      title: "Definir si tercerizar la logística en frío o comprar flota",
      actionType: "business_decision",
      milestoneId: m.id,
    });
    expect(tDec.actionType).toBe("business_decision");

    // 3. Revisión financiera
    const tFin = await createTask(ent, p.id, {
      title: "Auditar flujo de caja proyectado para los próximos 6 meses",
      actionType: "financial_review",
    });
    expect(tFin.actionType).toBe("financial_review");

    // 4. Aprendizaje / Habilidad
    const tSkill = await createTask(ent, p.id, {
      title: "Capacitación del equipo en normativas ISO 13485",
      actionType: "skill_learning",
    });
    expect(tSkill.actionType).toBe("skill_learning");

    // 5. Derivación a especialista
    const tExpRef = await createTask(mentor, p.id, {
      title: "Consultar a abogado especialista en patentes biomédicas",
      actionType: "expert_referral",
    });
    expect(tExpRef.actionType).toBe("expert_referral");

    // 6. Experimento empírico vinculado a hipótesis
    const h = await proposeHypothesis(ent, p.id, {
      statement: "Las clínicas privadas pagarán 50 USD por kit si la entrega es en menos de 2 horas",
      segment: "Clínicas privadas zona metropolitana",
      whyItMatters: "Define el pricing y el modelo logístico",
      currentEvidence: "3 cartas de intención informales",
      costOfBeingWrong: "Pérdida de margen en distribución rápida",
      evaluationCriterion: "Al menos 5 de 8 clínicas firman la orden de compra",
      uncertainty: "high",
    });
    await submitHypothesis(ent, h.id);
    await approveHypothesis(mentor, h.id);

    const exp = await createExperiment(ent, h.id, {
      question: "¿Están dispuestas las clínicas a pagar 50 USD con entrega < 2h?",
      method: "Entrevistas estructuradas con orden de compra simulada",
      participants: "8 directores médicos",
      activities: ["Presentar propuesta y solicitar firma de orden piloto"],
      resources: "Folletos de producto y contratos tipo",
      durationDays: 10,
      budget: null,
      metric: "Tasa de aceptación de la orden de compra",
      successCriterion: ">= 60%",
      rejectionCriterion: "< 30%",
      risks: "Riesgo de rechazo por precio inicial",
      evidencePlan: "Órdenes firmadas escaneadas",
    });

    // Sin especificar actionType, pero pasando experimentId -> infiere "experiment"
    const tExpInferred = await createTask(ent, p.id, {
      title: "Enviar propuesta comercial a clínica Santa María",
      experimentId: exp.id,
    });
    expect(tExpInferred.actionType).toBe("experiment");
    expect(tExpInferred.experimentId).toBe(exp.id);

    // Creación en lote conservando multimodalidad
    const batch = await createTasksBatch(ent, p.id, [
      {
        title: "Reunión con consultor tributario",
        actionType: "conversation_third_party",
        milestoneId: m.id,
      },
      {
        title: "Intervención del mentor con red de inversores ángeles",
        actionType: "mentor_intervention",
        milestoneId: m.id,
      },
    ]);
    expect(batch).toHaveLength(2);
    expect(batch[0].actionType).toBe("conversation_third_party");
    expect(batch[1].actionType).toBe("mentor_intervention");

    // Verificación de integridad: vincular a un hito inexistente falla
    await expect(
      createTask(ent, p.id, {
        title: "Tarea con hito fantasma",
        milestoneId: "mls_no_existe",
      }),
    ).rejects.toMatchObject({
      name: "DomainError",
      code: "not_found",
    });
  });

  it("Escenario D3 — Accountability constructivo y diagnóstico no punitivo de causas de retraso", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const stranger = as("ent2");
    const adm = as("adm");

    const p = await createProject(ent, {
      name: "LogiRoute AI",
      description: "Optimización de rutas de última milla",
      nature: "operating_business",
    });
    await assignMentor(adm, p.id, id("men1"));

    const task = await createTask(ent, p.id, {
      title: "Integrar API con sistema ERP del cliente piloto",
      actionType: "operational_task",
      dueDate: "2026-10-15",
    });

    // 1. Marcar como bloqueada con motivo
    const blockedTask = await setTaskBlocked(
      ent,
      task.id,
      "El equipo de TI del cliente todavía no entregó las credenciales del entorno de pruebas.",
    );
    expect(blockedTask.status).toBe("blocked");
    expect(blockedTask.blockedReason).toContain("credenciales");

    // 2. Control de acceso en diagnóstico: usuario ajeno no puede diagnosticar
    await expect(
      diagnoseTaskDelay(stranger, task.id, {
        causeCategory: "external",
        detail: "Sin acceso",
      }),
    ).rejects.toMatchObject({
      name: "DomainError",
      code: "not_found",
    });

    // 3. Mentor y emprendedor diagnostican la causa con enfoque constructivo y sin culpa
    const diagnosedTask = await diagnoseTaskDelay(mentor, task.id, {
      causeCategory: "external",
      detail:
        "Demora externa por procesos internos de seguridad del cliente piloto. Se acuerda que el mentor contacte al CTO para destrabar el acceso.",
    });

    expect(diagnosedTask.delayHypothesis).toBeDefined();
    expect(diagnosedTask.delayHypothesis?.causeCategory).toBe("external");
    expect(diagnosedTask.delayHypothesis?.detail).toContain("procesos internos de seguridad");
    expect(diagnosedTask.delayHypothesis?.identifiedAt).toBeDefined();

    // Auditoría registrada
    const delayAudits = await repo.auditEvents.list({
      projectId: p.id,
      action: "task.delay_diagnosed",
    });
    expect(delayAudits).toHaveLength(1);
    expect(delayAudits[0].meta).toMatchObject({ causeCategory: "external" });

    // 4. Adjuntar evidencia a la tarea
    const ev = await addEvidence(ent, p.id, {
      kind: "note",
      title: "Minuta de llamada con el CTO del cliente",
      description: "Confirmaron entrega de API keys para el próximo lunes.",
    });

    const taskWithEv = await attachEvidenceToTask(ent, task.id, ev.id);
    expect(taskWithEv.evidenceIds).toContain(ev.id);

    // 5. El workspace carga hitos y tareas con sus metadatos
    const ws = await getWorkspace(mentor, p.id);
    expect(ws.tasks).toHaveLength(1);
    expect(ws.tasks[0].delayHypothesis?.causeCategory).toBe("external");
    expect(ws.permissions["roadmap.manage"]).toBe(true);
    expect(ws.permissions["task.diagnose_delay"]).toBe(true);
  });
});
