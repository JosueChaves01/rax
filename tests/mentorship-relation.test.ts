import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import {
  confirmMentorshipAgreement,
  createMentorshipGoal,
  decideCompatibility,
  initiateMentorshipRelation,
  saveMentorshipAgreement,
  suggestGoalsAndAgreement,
  transitionMentorshipStage,
  updateMentorshipGoalStatus,
} from "@/lib/services/mentorship-relation";

afterAll(closeWorlds);

describe("Fase 1: Relación de Mentoría, Acuerdos y Objetivos", () => {
  it("Escenario A — permite explorar compatibilidad y declinar sin crear un programa forzado", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const stranger = as("ent2");
    const adm = as("adm");

    // 1. Proyecto base
    const p = await createProject(ent, {
      name: "BioFiltros",
      description: "Filtros biológicos de agua",
      nature: "exploring_idea",
    });
    await assignMentor(adm, p.id, id("men1"));

    // 2. Control de acceso: un usuario ajeno no puede iniciar relación
    await expect(initiateMentorshipRelation(stranger, p.id, id("ent1"), id("men1"))).rejects.toMatchObject({
      name: "DomainError",
      code: "not_found",
    });

    // 3. Iniciar relación en etapa de exploración
    const rel = await initiateMentorshipRelation(ent, p.id, id("ent1"), id("men1"));
    expect(rel.stage).toBe("exploration");
    expect(rel.compatibilityStatus).toBe("pending");

    // Verificar auditoría
    const audits = await repo.auditEvents.list({ projectId: p.id, action: "mentorship.relation_created" });
    expect(audits).toHaveLength(1);

    // 4. Tras la primera sesión exploratoria, ambas partes concluyen que las expectativas no coinciden
    const declinedRel = await decideCompatibility(
      mentor,
      rel.id,
      "declined",
      "El emprendedor busca consultoría legal regulatoria fuera de mi especialidad.",
    );

    expect(declinedRel.compatibilityStatus).toBe("declined");
    expect(declinedRel.stage).toBe("closed");
    expect(declinedRel.compatibilityRationale).toContain("consultoría legal");

    // Verificar evento de auditoría
    const compAudits = await repo.auditEvents.list({ projectId: p.id, action: "mentorship.compatibility_decided" });
    expect(compAudits).toHaveLength(1);
    expect(compAudits[0].meta?.status).toBe("declined");
    expect(compAudits[0].meta?.nextStage).toBe("closed");
  });

  it("Escenario B — compatibilidad positiva, acuerdos de trabajo bidireccionales y objetivos con línea base", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    // 1. Proyecto y mentor asignado
    const p = await createProject(ent, {
      name: "SolarIoT",
      description: "Monitoreo remoto de paneles solares",
      nature: "designing_solution",
    });
    await assignMentor(adm, p.id, id("men1"));

    // 2. Iniciar relación
    const rel = await initiateMentorshipRelation(mentor, p.id, id("ent1"), id("men1"));
    expect(rel.stage).toBe("exploration");

    // 3. Compatibilidad exitosa: avanzamos a diagnóstico
    const diagnosedRel = await decideCompatibility(
      mentor,
      rel.id,
      "proceed",
      "Excelente química y alineación técnica en hardware e IoT.",
    );
    expect(diagnosedRel.compatibilityStatus).toBe("proceed");
    expect(diagnosedRel.stage).toBe("diagnosis");

    // 4. Concluido el diagnóstico, avanzamos a formalizar acuerdos
    const agreementStageRel = await transitionMentorshipStage(ent, rel.id, "agreement");
    expect(agreementStageRel.stage).toBe("agreement");

    // Rechaza transiciones no permitidas
    await expect(transitionMentorshipStage(ent, rel.id, "evaluation")).rejects.toMatchObject({
      name: "DomainError",
      code: "invalid_transition",
    });

    // 5. Redactar acuerdo de mentoría formal y versionado
    const agreement = await saveMentorshipAgreement(mentor, rel.id, {
      frequency: "biweekly",
      sessionDurationMinutes: 60,
      authorizedChannels: ["Slack", "Google Meet"],
      scope: "Acompañamiento en arquitectura técnica y primeras 3 pruebas piloto.",
      mentorCommitments: "Preparar cada sesión, revisar arquitectura y asistir a llamadas quincenales.",
      entrepreneurCommitments: "Enviar avances al menos 24h antes y cumplir acuerdos semanales.",
      confidentialityTerms: "Confidencialidad recíproca sobre esquemas y datos de clientes.",
      expectedDurationWeeks: 12,
    });

    expect(agreement.status).toBe("draft");
    expect(agreement.version).toBe(1);
    expect(agreement.expectedDurationWeeks).toBe(12);

    // 6. Confirmación bidireccional
    // El mentor confirma primero
    const mentorConfirmed = await confirmMentorshipAgreement(mentor, agreement.id);
    expect(mentorConfirmed.status).toBe("confirmed_by_mentor");

    // El emprendedor confirma después -> se activa el acuerdo y la relación avanza a active_mentoring
    const activeAgreement = await confirmMentorshipAgreement(ent, agreement.id);
    expect(activeAgreement.status).toBe("active");
    expect(activeAgreement.confirmedAt).toBeDefined();

    const currentRel = await repo.mentorshipRelations.get(rel.id);
    expect(currentRel?.stage).toBe("active_mentoring");

    // 7. Formulación de objetivos conectados con línea base
    const goal1 = await createMentorshipGoal(mentor, rel.id, {
      title: "Cerrar 3 pilotos comerciales no remunerados",
      description: "Instalar telemetría en 3 parques solares pequeños para validar conectividad continua.",
      whyItMatters: "Sin estabilidad de señal comprobada en campo, ningún cliente pagará.",
      kind: "metric",
      baseline: "0 instalaciones en campo; solo prototipos de banco de pruebas en laboratorio.",
      targetResult: "3 pilotos instalados con uptime ≥95% durante 3 semanas.",
      metricIndicator: "Tasa de disponibilidad de transmisión de paquetes de datos.",
      targetDate: "2026-12-15",
      priority: "high",
    });

    expect(goal1.status).toBe("active");
    expect(goal1.baseline).toContain("0 instalaciones");
    expect(goal1.kind).toBe("metric");

    // Actualizar estado del objetivo cuando se cumple
    const achievedGoal = await updateMentorshipGoalStatus(mentor, goal1.id, "achieved");
    expect(achievedGoal.status).toBe("achieved");

    // Verificar auditoría de objetivos
    const goalAudits = await repo.auditEvents.list({ projectId: p.id, action: "mentorship.goal_created" });
    expect(goalAudits).toHaveLength(1);
  });

  it("Escenario C — Asistencia de IA: sugiere objetivos con línea base y términos de acuerdo fundamentados en el diagnóstico", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    // 1. Crear proyecto y diagnosticar un problema confirmado
    const p = await createProject(ent, {
      name: "AppReciclaje",
      description: "Plataforma de logística inversa para recicladores urbanos",
      nature: "operating_business",
    });
    await assignMentor(adm, p.id, id("men1"));

    // Insertar un problema confirmado en el diagnóstico
    await repo.diagnosisItems.insert({
      id: id("dx_prob"),
      projectId: p.id,
      category: "problem",
      title: "Costos logísticos elevados en rutas dispersas",
      content: "Las cooperativas gastan más del 40% de sus ingresos en fletes debido a puntos de recolección fragmentados.",
      infoType: "documented_observation",
      reviewStatus: "confirmed",
      uncertainty: "medium",
      source: { kind: "entrepreneur_edit" },
      authorId: id("ent1"),
      relatedItemIds: [],
      evidenceIds: [],
      priority: {
        rank: 1,
        rationale: "Principal drenaje de rentabilidad operativa.",
        setBy: id("men1"),
        setAt: new Date().toISOString(),
      },
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Iniciar relación y avanzar compatibilidad
    const rel = await initiateMentorshipRelation(ent, p.id, id("ent1"), id("men1"));
    await decideCompatibility(mentor, rel.id, "proceed", "Alta complementariedad en logística urbana.");

    // 3. Invocar sugerencia de objetivos y acuerdos con IA
    const res = await suggestGoalsAndAgreement(mentor, p.id, rel.id);

    expect(res).toBeDefined();
    expect(res.provider).toBe("simulated");
    expect(res.suggestion.suggestedGoals.length).toBeGreaterThanOrEqual(1);

    for (const g of res.suggestion.suggestedGoals) {
      expect(g.title.length).toBeGreaterThan(3);
      expect(["metric", "qualitative", "capability", "strategic"]).toContain(g.kind);
      expect(["high", "medium", "low"]).toContain(g.priority);
      // Principio fundamental: baseline obligatoria y targetResult observable
      expect(g.baseline.length).toBeGreaterThan(5);
      expect(g.targetResult.length).toBeGreaterThan(5);
    }

    // Términos de acuerdo sugeridos
    const terms = res.suggestion.suggestedAgreementTerms;
    expect(terms).toBeDefined();
    expect(["weekly", "biweekly", "monthly", "on_demand"]).toContain(terms?.frequency);
    expect(terms?.sessionDurationMinutes).toBeGreaterThanOrEqual(15);
    expect(terms?.scope.length).toBeGreaterThan(10);
    expect(terms?.mentorCommitments.length).toBeGreaterThan(10);
    expect(terms?.entrepreneurCommitments.length).toBeGreaterThan(10);

    // 4. Adoptar el primer objetivo sugerido y el acuerdo formal
    const adoptedGoal = await createMentorshipGoal(mentor, rel.id, {
      title: res.suggestion.suggestedGoals[0].title,
      description: res.suggestion.suggestedGoals[0].description,
      whyItMatters: res.suggestion.suggestedGoals[0].whyItMatters,
      kind: res.suggestion.suggestedGoals[0].kind,
      baseline: res.suggestion.suggestedGoals[0].baseline,
      targetResult: res.suggestion.suggestedGoals[0].targetResult,
      priority: res.suggestion.suggestedGoals[0].priority,
    });
    expect(adoptedGoal.id).toBeDefined();
    expect(adoptedGoal.status).toBe("active");

    const savedAgr = await saveMentorshipAgreement(mentor, rel.id, {
      frequency: terms!.frequency,
      sessionDurationMinutes: terms!.sessionDurationMinutes,
      authorizedChannels: terms!.authorizedChannels,
      scope: terms!.scope,
      mentorCommitments: terms!.mentorCommitments,
      entrepreneurCommitments: terms!.entrepreneurCommitments,
      confidentialityTerms: terms!.confidentialityTerms,
      expectedDurationWeeks: terms!.expectedDurationWeeks,
    });
    expect(savedAgr.status).toBe("draft");

    // Verificar auditoría de la invocación de IA
    const aiAudits = await repo.auditEvents.list({ projectId: p.id, action: "ai.invoked" });
    expect(aiAudits).toHaveLength(1);
    expect(aiAudits[0].meta?.kind).toBe("goals_and_agreement");
  });
});

