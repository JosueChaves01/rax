import { notFound } from "@/lib/errors";
import type {
  AgreementStatus,
  MentorIntervention,
  MentorshipStage,
  Project,
} from "@/types/domain";
import { sysRepo, type ServiceDeps } from "./base";

export interface PortfolioProjectSummary {
  relationId: string;
  projectId: string;
  projectName: string;
  projectStatus: Project["status"];
  entrepreneurName: string;
  stage: MentorshipStage;
  agreementStatus?: AgreementStatus;
  lastSessionDate?: string;
  nextSessionDate?: string;
  goalsCount: number;
  goalsAchievedCount: number;
  blockedTasksCount: number;
  totalTasksCount: number;
  completedTasksCount: number;
  urgencyScore: number;
  topIntervention?: MentorIntervention;
  signals: string[];
}

export interface MentorPortfolio {
  mentorId: string;
  projects: PortfolioProjectSummary[];
  interventions: MentorIntervention[];
  stats: {
    totalActiveProjects: number;
    projectsNeedingAttention: number;
    upcomingSessionsCount: number;
    pendingAgreementsCount: number;
  };
}

export async function getMentorPortfolio(d: ServiceDeps): Promise<MentorPortfolio> {
  const mentorId = d.actor.id;
  const now = d.now();
  const nowDate = new Date(now).getTime();

  // 1. Obtener relaciones asignadas a este mentor
  const allRelations = await d.repo.mentorshipRelations.list({ mentorId });
  const activeRelations = allRelations.filter((r) => r.stage !== "closed");

  // También traer intervenciones persistidas / descartadas
  const persistedInterventions = await d.repo.mentorInterventions.list({ mentorId });
  const dismissedSet = new Set(
    persistedInterventions.filter((i) => i.status === "dismissed").map((i) => `${i.relationId}:${i.category}`),
  );

  const projectsSummary: PortfolioProjectSummary[] = [];
  const dynamicInterventions: MentorIntervention[] = [];

  for (const rel of activeRelations) {
    const project = await d.repo.projects.get(rel.projectId);
    if (!project) continue;

    const entrepreneur = await d.repo.profiles.get(rel.entrepreneurId);
    const entrepreneurName = entrepreneur?.name ?? "Emprendedor";

    // Cargar datos del proyecto
    const [tasks, goals, agreements, sessions] = await Promise.all([
      d.repo.tasks.list({ projectId: project.id }),
      d.repo.mentorshipGoals.list({ relationId: rel.id }),
      d.repo.mentorshipAgreements.list({ relationId: rel.id }),
      d.repo.mentorSessions.list({ projectId: project.id }),
    ]);

    const latestAgreement = agreements.sort((a, b) => b.version - a.version)[0];
    const completedSessions = sessions
      .filter((s) => s.status === "completed" && s.completedAt)
      .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    const lastSession = completedSessions[0];

    const upcomingSessions = sessions
      .filter((s) => s.status !== "completed" && s.scheduledAt && new Date(s.scheduledAt).getTime() >= nowDate)
      .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));
    const nextSession = upcomingSessions[0];

    const blockedTasks = tasks.filter((t) => t.status === "blocked");
    const completedTasks = tasks.filter((t) => t.status === "done");
    const achievedGoals = goals.filter((g) => g.status === "achieved");

    let urgencyScore = 0;
    const signals: string[] = [];
    const relInterventions: MentorIntervention[] = [];

    // Regla 1: Bloqueos no diagnosticados (Urgencia Alta)
    for (const bt of blockedTasks) {
      if (!bt.delayHypothesis) {
        urgencyScore += 35;
        signals.push(`Bloqueo sin diagnosticar: «${bt.title}»`);
        const catKey = `${rel.id}:unresolved_blocker`;
        if (!dismissedSet.has(catKey)) {
          relInterventions.push({
            id: `int-blocker-${bt.id}`,
            mentorId,
            relationId: rel.id,
            projectId: project.id,
            projectName: project.name,
            urgency: "high",
            category: "unresolved_blocker",
            title: `Bloqueo pendiente en «${bt.title}»`,
            explanation: {
              whatHappened: `La tarea está detenida.${bt.blockedReason ? ` Motivo: "${bt.blockedReason}".` : " Sin motivo especificado."}`,
              whyItMatters: "Un bloqueo operativo sin revisar frena el ritmo de ejecución y la confianza.",
              supportingData: `Tarea asignada en la hoja de ruta de ${project.name}.`,
              suggestedAction: "Analizar la hipótesis de demora con el emprendedor o coordinar un destrabe en la próxima sesión.",
            },
            status: "pending",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // Regla 2: Acuerdo pendiente de confirmación
    if (rel.stage === "agreement" || (latestAgreement && latestAgreement.status !== "active")) {
      urgencyScore += 25;
      signals.push("Acuerdo bilateral pendiente");
      const catKey = `${rel.id}:pending_agreement`;
      if (!dismissedSet.has(catKey)) {
        relInterventions.push({
          id: `int-agreement-${rel.id}`,
          mentorId,
          relationId: rel.id,
          projectId: project.id,
          projectName: project.name,
          urgency: "medium",
          category: "pending_agreement",
          title: "Formalizar acuerdo de trabajo bilateral",
          explanation: {
            whatHappened: `El acuerdo está en estado "${latestAgreement?.status ?? "borrador"}".`,
            whyItMatters: "Un marco claro de frecuencia y compromisos previene desalineaciones.",
            supportingData: `${goals.length} objetivos definidos.`,
            suggestedAction: "Revisar y rubricar la confirmación del acuerdo de mentoría.",
          },
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Regla 3: Preparación de sesión próxima (< 48h y sin briefing)
    if (nextSession && nextSession.scheduledAt) {
      const msUntilSession = new Date(nextSession.scheduledAt).getTime() - nowDate;
      const hoursUntil = msUntilSession / (1000 * 60 * 60);
      if (hoursUntil <= 48 && !nextSession.preSessionBriefing) {
        urgencyScore += 20;
        signals.push("Sesión cercana sin briefing");
        const catKey = `${rel.id}:session_prep_needed`;
        if (!dismissedSet.has(catKey)) {
          relInterventions.push({
            id: `int-prep-${nextSession.id}`,
            mentorId,
            relationId: rel.id,
            projectId: project.id,
            projectName: project.name,
            urgency: "medium",
            category: "session_prep_needed",
            title: `Preparar briefing para sesión del ${new Date(nextSession.scheduledAt).toLocaleDateString("es")}`,
            explanation: {
              whatHappened: "Faltan menos de 48 horas para la reunión y aún no se generó el resumen de 4 capas.",
              whyItMatters: "Preparar la sesión con el briefing reduce el tiempo de revisión previa a menos de 3 minutos.",
              supportingData: `Sesión ${nextSession.kind}.`,
              suggestedAction: "Abrir la sesión para generar y revisar el briefing estructurado.",
            },
            status: "pending",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // Regla 4: Más de 14 días sin sesión y sin próxima agendada
    if (rel.stage === "active_mentoring" && !nextSession) {
      const daysSinceLast = lastSession?.completedAt
        ? (nowDate - new Date(lastSession.completedAt).getTime()) / (1000 * 60 * 60 * 24)
        : 20;
      if (daysSinceLast >= 14) {
        urgencyScore += 20;
        signals.push(`Sin sesión hace ${Math.floor(daysSinceLast)} días`);
        const catKey = `${rel.id}:stalled_progress`;
        if (!dismissedSet.has(catKey)) {
          relInterventions.push({
            id: `int-stalled-${rel.id}`,
            mentorId,
            relationId: rel.id,
            projectId: project.id,
            projectName: project.name,
            urgency: "medium",
            category: "stalled_progress",
            title: "Agendar sesión de seguimiento",
            explanation: {
              whatHappened: `Han transcurrido ${Math.floor(daysSinceLast)} días desde el último encuentro de mentoría.`,
              whyItMatters: "La cadencia periódica mantiene la continuidad del aprendizaje y los compromisos.",
              supportingData: `Última sesión: ${lastSession?.completedAt ? new Date(lastSession.completedAt).toLocaleDateString("es") : "ninguna"}.`,
              suggestedAction: "Proponer una nueva fecha de sesión al emprendedor.",
            },
            status: "pending",
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // Regla 5: Ciclo listo para evaluación (Fase 6)
    if (rel.stage === "active_mentoring" && goals.length > 0 && achievedGoals.length >= Math.ceil(goals.length * 0.7)) {
      urgencyScore += 15;
      signals.push("Objetivos mayormente logrados · Listo para evaluar");
      const catKey = `${rel.id}:cycle_review_needed`;
      if (!dismissedSet.has(catKey)) {
        relInterventions.push({
          id: `int-review-${rel.id}`,
          mentorId,
          relationId: rel.id,
          projectId: project.id,
          projectName: project.name,
          urgency: "low",
          category: "cycle_review_needed",
          title: "Evaluar resultados y cierre de ciclo",
          explanation: {
            whatHappened: `Se alcanzaron ${achievedGoals.length} de ${goals.length} objetivos del plan de mentoría.`,
            whyItMatters: "Consolidar el aprendizaje contra la línea base permite celebrar logros y decidir la renovación.",
            supportingData: `${achievedGoals.length} objetivos cumplidos.`,
            suggestedAction: "Completar la evaluación de ciclo comparativa con el emprendedor.",
          },
          status: "pending",
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Intervención principal para la tarjeta
    const topIntervention = relInterventions.sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 };
      return rank[b.urgency] - rank[a.urgency];
    })[0];

    projectsSummary.push({
      relationId: rel.id,
      projectId: project.id,
      projectName: project.name,
      projectStatus: project.status,
      entrepreneurName,
      stage: rel.stage,
      agreementStatus: latestAgreement?.status,
      lastSessionDate: lastSession?.completedAt,
      nextSessionDate: nextSession?.scheduledAt,
      goalsCount: goals.length,
      goalsAchievedCount: achievedGoals.length,
      blockedTasksCount: blockedTasks.length,
      totalTasksCount: tasks.length,
      completedTasksCount: completedTasks.length,
      urgencyScore: Math.min(urgencyScore, 100),
      topIntervention,
      signals,
    });

    dynamicInterventions.push(...relInterventions);
  }

  // Ordenar cartera por urgencia decreciente
  projectsSummary.sort((a, b) => b.urgencyScore - a.urgencyScore);

  // Ordenar intervenciones por urgencia (high -> medium -> low)
  dynamicInterventions.sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.urgency] - rank[a.urgency];
  });

  return {
    mentorId,
    projects: projectsSummary,
    interventions: dynamicInterventions,
    stats: {
      totalActiveProjects: projectsSummary.length,
      projectsNeedingAttention: projectsSummary.filter((p) => p.urgencyScore >= 30).length,
      upcomingSessionsCount: projectsSummary.filter((p) => p.nextSessionDate != null).length,
      pendingAgreementsCount: projectsSummary.filter((p) => p.agreementStatus !== "active").length,
    },
  };
}

export async function dismissIntervention(
  d: ServiceDeps,
  input: { relationId: string; category: MentorIntervention["category"]; interventionId?: string },
): Promise<void> {
  const now = d.now();
  const rel = await d.repo.mentorshipRelations.get(input.relationId);
  if (!rel) throw notFound("Relación no encontrada.");

  // Guardar como descartada en el repo
  const intervention: MentorIntervention = {
    id: input.interventionId || d.newId("int"),
    mentorId: d.actor.id,
    relationId: input.relationId,
    projectId: rel.projectId,
    projectName: "",
    urgency: "low",
    category: input.category,
    title: "Intervención descartada",
    explanation: { whatHappened: "", whyItMatters: "", supportingData: "", suggestedAction: "" },
    status: "dismissed",
    createdAt: now,
    updatedAt: now,
  };

  await d.repo.mentorInterventions.insert(intervention);
  await sysRepo(d).auditEvents.insert({
    id: d.newId("audit"),
    actorId: d.actor.id,
    action: "intervention.dismissed",
    targetId: intervention.id,
    meta: { relationId: input.relationId, category: input.category },
    createdAt: now,
  });
}
