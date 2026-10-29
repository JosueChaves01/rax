import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world, INTERVIEW } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import { sendMessage } from "@/lib/services/conversation";
import { confirmSummary, editSummary } from "@/lib/services/diagnosis";
import {
  confirmMentorshipAgreement,
  createMentorshipGoal,
  decideCompatibility,
  initiateMentorshipRelation,
  saveMentorshipAgreement,
  transitionMentorshipStage,
  updateMentorshipGoalStatus,
} from "@/lib/services/mentorship-relation";
import {
  addNote,
  completeFirstReview,
  requestReview,
  startSession,
  suggestFirstReview,
} from "@/lib/services/mentoring";
import {
  addEvidence,
  createTask,
  setTaskStatus,
} from "@/lib/services/validation";

afterAll(closeWorlds);

describe("Ciclo de Vida de Mentoría (Etapas 4 a 7 y Criterios Globales F e I)", () => {
  it("Etapa 4: Hoja de Ruta Multimodal — soporta acciones operativas, de aprendizaje y estratégicas sin forzar experimentos innecesarios", async () => {
    const { as, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    // 1. Proyecto base con diagnóstico completado
    const p = await createProject(ent, {
      name: "AgroTech Sensores",
      description: "Monitoreo de humedad de suelo para cooperativas agrícolas",
      nature: "designing_solution",
    });
    await assignMentor(adm, p.id, id("men1"));

    // 2. Establecer relación y acuerdos activos
    const rel = await initiateMentorshipRelation(mentor, p.id, id("ent1"), id("men1"));
    await decideCompatibility(mentor, rel.id, "proceed", "Alineación en agronomía y tecnología.");
    await transitionMentorshipStage(ent, rel.id, "agreement");

    const agreement = await saveMentorshipAgreement(mentor, rel.id, {
      frequency: "biweekly",
      sessionDurationMinutes: 60,
      authorizedChannels: ["Meet", "Email"],
      scope: "Estructuración operativa y primer despliegue en campo.",
      mentorCommitments: "Revisar avances quincenales y contactar con cooperativas.",
      entrepreneurCommitments: "Actualizar métricas y cumplir tareas operativas.",
      confidentialityTerms: "Confidencialidad total sobre los datos de sensores.",
      expectedDurationWeeks: 12,
    });
    await confirmMentorshipAgreement(mentor, agreement.id);
    await confirmMentorshipAgreement(ent, agreement.id);

    // 3. Formular objetivos multimodales: capacidad, decisión estratégica y métrica
    const capabilityGoal = await createMentorshipGoal(mentor, rel.id, {
      title: "Dominio de costos unitarios de hardware",
      description: "Aprender a costear la placa de sensores a escala piloto.",
      whyItMatters: "Sin costeo riguroso se corre el riesgo de vender a pérdida.",
      kind: "capability",
      baseline: "Costeo empírico aproximado sin considerar mano de obra ni fletes.",
      targetResult: "Plantilla de costos unitarios validada con desglose de componentes.",
      priority: "medium",
    });

    const strategicGoal = await createMentorshipGoal(mentor, rel.id, {
      title: "Definir modelo de comercialización (Venta vs Suscripción)",
      description: "Evaluar si las cooperativas prefieren comprar los sensores o pagar abono mensual por hectárea.",
      whyItMatters: "Determina el capital de trabajo requerido para financiar los dispositivos.",
      kind: "strategic",
      baseline: "Duda abierta sin consultas previas a clientes potenciales.",
      targetResult: "Decisión acordada basada en 5 consultas a gerentes de cooperativas.",
      priority: "high",
    });

    expect(capabilityGoal.kind).toBe("capability");
    expect(strategicGoal.kind).toBe("strategic");

    // 4. Crear tareas multimodales en la hoja de ruta
    // Acción 1: Tarea operativa concreta (trámite / compra sin requerir experimento)
    const taskOperativa = await createTask(ent, p.id, {
      title: "Solicitar cotizaciones a 3 distribuidores de componentes electrónicos",
      dueDate: "2026-11-15",
    });
    expect(taskOperativa.status).toBe("todo");
    expect(taskOperativa.experimentId).toBeUndefined();

    // Acción 2: Tarea de aprendizaje / capacitación
    const taskAprendizaje = await createTask(ent, p.id, {
      title: "Realizar ejercicio de costeo BOM con el mentor en la siguiente sesión",
      dueDate: "2026-11-20",
    });
    expect(taskAprendizaje.status).toBe("todo");

    // Acción 3: Tarea de toma de decisión
    const taskDecision = await createTask(ent, p.id, {
      title: "Reunión con gerente de Cooperativa Sur para comparar opción compra vs abono",
      dueDate: "2026-11-25",
    });
    expect(taskDecision.status).toBe("todo");

    // 5. Progreso de las tareas operativas sin bloqueos de hipótesis
    const inProgressTask = await setTaskStatus(ent, taskOperativa.id, "doing");
    expect(inProgressTask.status).toBe("doing");

    const completedTask = await setTaskStatus(ent, taskOperativa.id, "done");
    expect(completedTask.status).toBe("done");

    // Verificar que el workspace refleja todas las tareas en la hoja de ruta
    const ws = await getWorkspace(ent, p.id);
    expect(ws.tasks).toHaveLength(3);
    expect(ws.tasks.find((t) => t.id === taskOperativa.id)?.status).toBe("done");
  });

  it("Etapa 5: Ciclo de Sesiones — Briefing contextualizado, notas tipadas en vivo y privacidad de conversación", async () => {
    const { as, repo, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const stranger = as("men2");
    const adm = as("adm");

    // 1. Crear proyecto con entrevista
    const p = await createProject(ent, {
      name: "SaludConecta",
      description: "Telemedicina comunitaria para zonas rurales",
      nature: "exploring_idea",
    });
    for (const msg of INTERVIEW) {
      await sendMessage(ent, p.id, msg);
    }
    await confirmSummary(ent, p.id);
    await assignMentor(adm, p.id, id("men1"));

    // La conversación por defecto no está compartida con el mentor
    const wsMentorBefore = await getWorkspace(mentor, p.id);
    expect(wsMentorBefore.conversationHidden).toBe(true);
    expect(wsMentorBefore.messages).toHaveLength(0);

    // 2. Pre-sesión: Solicitud de sesión y generación automática de briefing
    const session = await requestReview(ent, p.id, "first_review");
    expect(session.briefing).toBeDefined();
    expect(session.briefing?.stage).toBeTruthy();
    expect(session.briefing?.mainProblem).toBeTruthy();
    expect(session.status).toBe("pending");

    // 3. Iniciar sesión por el mentor asignado
    const started = await startSession(mentor, session.id);
    expect(started.status).toBe("in_progress");

    // Mentor ajeno no puede acceder a las notas de la sesión
    await expect(addNote(stranger, session.id, "observation", "Nota intrusa")).rejects.toMatchObject({
      name: "DomainError",
      code: "not_found",
    });

    // 4. Intra-sesión: El mentor registra notas tipadas
    const noteObs = await addNote(mentor, session.id, "observation", "El tiempo de traslado de médicos es la mayor ineficiencia.");
    const noteQuest = await addNote(mentor, session.id, "question", "¿Qué conectividad mínima 3G/4G hay en los consultorios rurales?");
    const noteSugg = await addNote(mentor, session.id, "suggestion", "Comenzar con un piloto de solo mensajes asincrónicos antes de videollamadas.");

    expect(noteObs.kind).toBe("observation");
    expect(noteQuest.kind).toBe("question");
    expect(noteSugg.kind).toBe("suggestion");

    // 5. Pos-sesión: IA sugiere acuerdo y el mentor aprueba el cierre de la sesión
    const aiSuggestion = await suggestFirstReview(mentor, session.id);
    expect(aiSuggestion.agreement).toBeDefined();
    expect(aiSuggestion.suggestedNotes.length).toBeGreaterThan(0);

    // El mentor consolida y cierra la sesión con un acuerdo explícito
    await completeFirstReview(mentor, session.id, "Foco del ciclo: validar factibilidad técnica de teleconsultas asincrónicas con 3 postas de salud.");

    const completedSession = (await repo.mentorSessions.get(session.id))!;
    expect(completedSession.status).toBe("completed");
    expect(completedSession.completedAt).toBeDefined();

    // Auditoría de cierre de sesión
    const sessionAudits = await repo.auditEvents.list({ projectId: p.id, action: "mentor.session_completed" });
    expect(sessionAudits).toHaveLength(1);
  });

  it("Etapa 6: Accountability Contextual — detección de compromisos vencidos y diagnóstico de causas sin juzgar (Escenario F)", async () => {
    const { as, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    // 1. Proyecto y relación
    const p = await createProject(ent, {
      name: "EcoEnvases",
      description: "Envases biodegradables a partir de bagazo de caña",
      nature: "operating_business",
    });
    await assignMentor(adm, p.id, id("men1"));
    const rel = await initiateMentorshipRelation(mentor, p.id, id("ent1"), id("men1"));
    await decideCompatibility(mentor, rel.id, "proceed");
    await transitionMentorshipStage(ent, rel.id, "agreement");
    await transitionMentorshipStage(ent, rel.id, "active_mentoring");

    // 2. Crear compromiso con fecha límite en el pasado para simular retraso
    const expiredTask = await createTask(ent, p.id, {
      title: "Entregar muestras de material al laboratorio de degradabilidad",
      dueDate: "2026-10-01", // Fecha anterior a la fecha de simulación
    });
    expect(expiredTask.status).toBe("todo");

    // 3. El emprendedor encuentra un bloqueo externo y lo marca como 'blocked'
    const blockedTask = await setTaskStatus(ent, expiredTask.id, "blocked");
    expect(blockedTask.status).toBe("blocked");

    // 4. El mentor analiza el bloqueo en el workspace
    const ws = await getWorkspace(mentor, p.id);
    const delayed = ws.tasks.find((t) => t.id === expiredTask.id);
    expect(delayed?.status).toBe("blocked");

    // 5. Accountability constructivo (sin culpa):
    // El sistema y el mentor tratan el retraso como una hipótesis de causa externa:
    // "El laboratorio no tenía turnos disponibles por mantenimiento" en vez de "falta de compromiso"
    await editSummary(ent, p.id, "Producción de envases ecológicos a partir de residuos de caña de azúcar.");
    await confirmSummary(ent, p.id);
    const session = await requestReview(ent, p.id, "first_review");
    await startSession(mentor, session.id);

    const mentorHelpNote = await addNote(
      mentor,
      session.id,
      "suggestion",
      "Hipótesis de retraso: demora externa en laboratorio. Solución: derivar las muestras a un laboratorio secundario en convenio.",
    );
    expect(mentorHelpNote.body).toContain("Hipótesis de retraso: demora externa");

    // 6. El emprendedor resuelve la causa y marca la tarea como realizada
    const resolvedTask = await setTaskStatus(ent, expiredTask.id, "done");
    expect(resolvedTask.status).toBe("done");
  });

  it("Etapa 7: Evaluación de Resultados vs Línea Base, Cierre y Renovación Preservando el Histórico (Escenario I)", async () => {
    const { as, id } = await world();
    const ent = as("ent1");
    const mentor = as("men1");
    const adm = as("adm");

    // 1. Proyecto inicial
    const p = await createProject(ent, {
      name: "FinanPyme",
      description: "Plataforma de conciliación bancaria para pequeñas empresas",
      nature: "operating_business",
    });
    await assignMentor(adm, p.id, id("men1"));

    // 2. Relación y acuerdos iniciales (Ciclo 1)
    const rel = await initiateMentorshipRelation(mentor, p.id, id("ent1"), id("men1"));
    await decideCompatibility(mentor, rel.id, "proceed");
    await transitionMentorshipStage(ent, rel.id, "agreement");

    const agreementV1 = await saveMentorshipAgreement(mentor, rel.id, {
      frequency: "weekly",
      sessionDurationMinutes: 45,
      authorizedChannels: ["Slack"],
      scope: "Acompañamiento en validación comercial y primeras ventas.",
      mentorCommitments: "Feedback semanal de métricas.",
      entrepreneurCommitments: "Presentar avances de ventas cada lunes.",
      confidentialityTerms: "Confidencialidad financiera recíproca.",
      expectedDurationWeeks: 8,
    });
    await confirmMentorshipAgreement(mentor, agreementV1.id);
    await confirmMentorshipAgreement(ent, agreementV1.id);

    // 3. Objetivo con línea base explícita
    const goal1 = await createMentorshipGoal(mentor, rel.id, {
      title: "Primeros 5 clientes de pago recurrente",
      description: "Conseguir que 5 pymes paguen la suscripción mensual.",
      whyItMatters: "Comprueba disposición a pagar antes de invertir en marketing masivo.",
      kind: "metric",
      baseline: "0 clientes de pago; solo 12 usuarios en versión de prueba gratuita.",
      targetResult: "5 clientes pagando $50/mes con al menos 2 meses de permanencia.",
      metricIndicator: "Cantidad de clientes activos con facturación recurrente.",
      priority: "high",
    });

    expect(goal1.baseline).toContain("0 clientes de pago");
    expect(goal1.status).toBe("active");

    // 4. Registro de evidencia concreta durante el ciclo
    const ev1 = await addEvidence(ent, p.id, {
      kind: "note",
      title: "Reporte de facturación mes 2",
      description: "Se emitieron 6 facturas cobradas a pymes del sector gastronómico.",
    });
    const ev2 = await addEvidence(ent, p.id, {
      kind: "link",
      title: "Comprobante de cobros en Stripe",
      description: "Panel de suscripciones activas mostrando $300 MRR.",
      url: "https://dashboard.stripe.com/test/subscriptions",
    });
    expect(ev1.id).toBeDefined();
    expect(ev2.url).toContain("https://");

    // 5. Comparativa contra la línea base y actualización del objetivo a 'achieved'
    const achievedGoal = await updateMentorshipGoalStatus(mentor, goal1.id, "achieved");
    expect(achievedGoal.status).toBe("achieved");

    // 6. Evaluación de fin de ciclo: Transición a 'evaluation'
    const evalRel = await transitionMentorshipStage(ent, rel.id, "evaluation");
    expect(evalRel.stage).toBe("evaluation");

    // 7. Ruta 2: Renovación de la relación para una nueva etapa de escala
    const renewedRel = await transitionMentorshipStage(mentor, rel.id, "renewed");
    expect(renewedRel.stage).toBe("renewed");

    // En la etapa renovada se actualizan los acuerdos (Versión 2)
    await transitionMentorshipStage(ent, rel.id, "agreement");
    const agreementV2 = await saveMentorshipAgreement(mentor, rel.id, {
      frequency: "biweekly",
      sessionDurationMinutes: 60,
      authorizedChannels: ["Slack", "Google Meet"],
      scope: "Segunda etapa: Optimización de onboarding y adquisición escalable.",
      mentorCommitments: "Orientación en canales de adquisición B2B.",
      entrepreneurCommitments: "Reportar CAC y tasa de retención mensual.",
      confidentialityTerms: "Confidencialidad financiera recíproca.",
      expectedDurationWeeks: 12,
    });

    expect(agreementV2.version).toBe(2);
    await confirmMentorshipAgreement(mentor, agreementV2.id);
    await confirmMentorshipAgreement(ent, agreementV2.id);

    // Nuevo objetivo para la etapa renovada
    const goal2 = await createMentorshipGoal(mentor, rel.id, {
      title: "Reducción del costo de adquisición (CAC)",
      description: "Optimizar el embudo de ventas para bajar el CAC a menos de $100.",
      whyItMatters: "Necesario para que el crecimiento sea financieramente sostenible.",
      kind: "metric",
      baseline: "CAC inicial de $220 por cliente captado manualmente.",
      targetResult: "CAC promedio inferior a $100 con ciclo de cierre menor a 15 días.",
      priority: "high",
    });

    expect(goal2.version).toBe(1);

    // 8. Verificación de Preservación Histórica Inmutable (Ruta 3)
    const finalWs = await getWorkspace(ent, p.id);

    // Todos los acuerdos pasados y presentes se preservan
    expect(finalWs.mentorshipAgreements).toHaveLength(2);
    expect(finalWs.mentorshipAgreements.some((a) => a.id === agreementV1.id)).toBe(true);
    expect(finalWs.mentorshipAgreements.some((a) => a.id === agreementV2.id)).toBe(true);

    // Todos los objetivos (el logrado y el nuevo) coexisten
    expect(finalWs.mentorshipGoals).toHaveLength(2);
    expect(finalWs.mentorshipGoals.find((g) => g.id === goal1.id)?.status).toBe("achieved");
    expect(finalWs.mentorshipGoals.find((g) => g.id === goal2.id)?.status).toBe("active");

    // Todas las evidencias siguen disponibles
    expect(finalWs.evidence).toHaveLength(2);
    expect(finalWs.evidence.some((e) => e.id === ev1.id)).toBe(true);
    expect(finalWs.evidence.some((e) => e.id === ev2.id)).toBe(true);

    // La relación se encuentra activa en su nuevo ciclo
    expect(finalWs.mentorshipRelation?.stage).toBe("active_mentoring");
  });
});
