import type {
  AgreementFrequency,
  AgreementStatus,
  CompatibilityStatus,
  GoalKind,
  GoalPriority,
  GoalStatus,
  Id,
  MentorshipAgreement,
  MentorshipGoal,
  MentorshipRelation,
  MentorshipStage,
} from "@/types/domain";
import { notFound, validation } from "@/lib/errors";
import { audit, guard, type ServiceDeps } from "./base";
import { touch } from "./projects";
import { assertCanDecideCompatibility, assertMentorshipStageTransition } from "@/features/mentoring/relations";
import { isCurrent } from "@/features/diagnosis/rules";
import type { GoalsSuggestionContext, GoalsSuggestionResult } from "@/lib/ai/provider";
import { dispatchEventToN8n } from "@/lib/n8n/dispatcher";

/* ───────────── Relación de Mentoría ───────────── */

export async function initiateMentorshipRelation(
  d: ServiceDeps,
  projectId: Id,
  entrepreneurId: Id,
  mentorId: Id,
): Promise<MentorshipRelation> {
  await guard(d, projectId, "mentorship.manage");

  const [project, entrepreneur, mentor, existing] = await Promise.all([
    d.repo.projects.get(projectId),
    d.repo.profiles.get(entrepreneurId),
    d.repo.profiles.get(mentorId),
    d.repo.mentorshipRelations.list({ projectId, mentorId, entrepreneurId }),
  ]);

  if (!project) throw notFound("El proyecto no existe.");
  if (!entrepreneur) throw notFound("El emprendedor no existe.");
  if (!mentor || mentor.role !== "mentor" || mentor.mentorStatus !== "approved") {
    throw validation("El usuario seleccionado no es un mentor aprobado.");
  }

  // Si ya existe una relación abierta, la reutilizamos o informamos
  const active = existing.find((r) => r.stage !== "closed");
  if (active) return active;

  const now = d.now();
  const relation: MentorshipRelation = {
    id: d.newId("rel"),
    projectId,
    entrepreneurId,
    mentorId,
    stage: "exploration",
    compatibilityStatus: "pending",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  await d.repo.mentorshipRelations.insert(relation);
  await audit(d, "mentorship.relation_created", {
    projectId,
    targetId: relation.id,
    meta: { mentorId, entrepreneurId },
  });
  await touch(d, projectId);
  return relation;
}

export async function decideCompatibility(
  d: ServiceDeps,
  relationId: Id,
  status: CompatibilityStatus,
  rationale?: string,
): Promise<MentorshipRelation> {
  const rel = await d.repo.mentorshipRelations.get(relationId);
  if (!rel) throw notFound("La relación de mentoría no existe.");
  await guard(d, rel.projectId, "mentorship.manage");

  assertCanDecideCompatibility(rel.compatibilityStatus, status);

  const now = d.now();
  const nextStage: MentorshipStage =
    status === "proceed" && rel.stage === "exploration"
      ? "diagnosis"
      : status === "declined" && rel.stage === "exploration"
        ? "closed"
        : rel.stage;

  const updated = await d.repo.mentorshipRelations.update(
    relationId,
    {
      compatibilityStatus: status,
      compatibilityRationale: rationale?.trim().slice(0, 2000),
      compatibilityDecidedAt: now,
      stage: nextStage,
      updatedAt: now,
    },
    rel.version,
  );

  await audit(d, "mentorship.compatibility_decided", {
    projectId: rel.projectId,
    targetId: relationId,
    meta: { status, nextStage },
  });
  await touch(d, rel.projectId);

  dispatchEventToN8n({
    eventId: d.newId("evt"),
    eventType: "mentorship.compatibility_decided",
    occurredAt: now,
    schemaVersion: "1.0.0",
    correlationId: `comp_${relationId}`,
    actor: { id: d.actor.id, role: d.actor.role, verified: true },
    relationshipId: relationId,
    projectId: rel.projectId,
    entityType: "mentorship_relation",
    entityId: relationId,
    payload: { status, nextStage, rationale: rationale?.trim() },
  });

  return updated;
}

export async function transitionMentorshipStage(
  d: ServiceDeps,
  relationId: Id,
  toStage: MentorshipStage,
): Promise<MentorshipRelation> {
  const rel = await d.repo.mentorshipRelations.get(relationId);
  if (!rel) throw notFound("La relación de mentoría no existe.");
  await guard(d, rel.projectId, "mentorship.manage");

  assertMentorshipStageTransition(rel.stage, toStage);

  const now = d.now();
  const updated = await d.repo.mentorshipRelations.update(
    relationId,
    {
      stage: toStage,
      updatedAt: now,
    },
    rel.version,
  );

  await audit(d, "mentorship.stage_changed", {
    projectId: rel.projectId,
    targetId: relationId,
    meta: { from: rel.stage, to: toStage },
  });
  await touch(d, rel.projectId);
  return updated;
}

/* ───────────── Acuerdos de Mentoría ───────────── */

export interface MentorshipAgreementInput {
  frequency: AgreementFrequency;
  sessionDurationMinutes: number;
  authorizedChannels: string[];
  scope: string;
  mentorCommitments: string;
  entrepreneurCommitments: string;
  confidentialityTerms: string;
  expectedDurationWeeks: number;
}

export async function saveMentorshipAgreement(
  d: ServiceDeps,
  relationId: Id,
  input: MentorshipAgreementInput,
): Promise<MentorshipAgreement> {
  const rel = await d.repo.mentorshipRelations.get(relationId);
  if (!rel) throw notFound("La relación de mentoría no existe.");
  await guard(d, rel.projectId, "agreement.edit");

  if (input.sessionDurationMinutes < 15 || input.sessionDurationMinutes > 240) {
    throw validation("La duración de la sesión debe ser de entre 15 y 240 minutos.");
  }
  if (input.expectedDurationWeeks < 1 || input.expectedDurationWeeks > 104) {
    throw validation("La duración estimada debe ser de entre 1 y 104 semanas.");
  }

  const existing = await d.repo.mentorshipAgreements.list({ relationId });
  const draft = existing.find((a) => a.status === "draft" || a.status === "confirmed_by_mentor" || a.status === "confirmed_by_entrepreneur");

  const now = d.now();
  if (draft) {
    const updated = await d.repo.mentorshipAgreements.update(
      draft.id,
      {
        frequency: input.frequency,
        sessionDurationMinutes: input.sessionDurationMinutes,
        authorizedChannels: input.authorizedChannels,
        scope: input.scope.trim().slice(0, 4000),
        mentorCommitments: input.mentorCommitments.trim().slice(0, 4000),
        entrepreneurCommitments: input.entrepreneurCommitments.trim().slice(0, 4000),
        confidentialityTerms: input.confidentialityTerms.trim().slice(0, 4000),
        expectedDurationWeeks: input.expectedDurationWeeks,
        status: "draft",
      },
      draft.version,
    );
    await audit(d, "mentorship.agreement_updated", { projectId: rel.projectId, targetId: updated.id });
    dispatchEventToN8n({
      eventId: d.newId("evt"),
      eventType: "agreement.proposed",
      occurredAt: now,
      schemaVersion: "1.0.0",
      correlationId: `agr_${updated.id}`,
      actor: { id: d.actor.id, role: d.actor.role, verified: true },
      relationshipId: rel.id,
      projectId: rel.projectId,
      entityType: "mentorship_agreement",
      entityId: updated.id,
      payload: { scope: input.scope, frequency: input.frequency },
    });
    return updated;
  }

  const newAgreement: MentorshipAgreement = {
    id: d.newId("agr"),
    relationId,
    version: existing.length + 1,
    frequency: input.frequency,
    sessionDurationMinutes: input.sessionDurationMinutes,
    authorizedChannels: input.authorizedChannels,
    scope: input.scope.trim().slice(0, 4000),
    mentorCommitments: input.mentorCommitments.trim().slice(0, 4000),
    entrepreneurCommitments: input.entrepreneurCommitments.trim().slice(0, 4000),
    confidentialityTerms: input.confidentialityTerms.trim().slice(0, 4000),
    expectedDurationWeeks: input.expectedDurationWeeks,
    status: "draft",
    createdAt: now,
  };

  await d.repo.mentorshipAgreements.insert(newAgreement);
  await audit(d, "mentorship.agreement_updated", { projectId: rel.projectId, targetId: newAgreement.id });
  dispatchEventToN8n({
    eventId: d.newId("evt"),
    eventType: "agreement.proposed",
    occurredAt: now,
    schemaVersion: "1.0.0",
    correlationId: `agr_${newAgreement.id}`,
    actor: { id: d.actor.id, role: d.actor.role, verified: true },
    relationshipId: rel.id,
    projectId: rel.projectId,
    entityType: "mentorship_agreement",
    entityId: newAgreement.id,
    payload: { scope: input.scope, frequency: input.frequency },
  });
  return newAgreement;
}

export async function confirmMentorshipAgreement(
  d: ServiceDeps,
  agreementId: Id,
): Promise<MentorshipAgreement> {
  const agreement = await d.repo.mentorshipAgreements.get(agreementId);
  if (!agreement) throw notFound("El acuerdo de mentoría no existe.");
  const rel = await d.repo.mentorshipRelations.get(agreement.relationId);
  if (!rel) throw notFound("La relación de mentoría no existe.");

  await guard(d, rel.projectId, "agreement.confirm");

  const isMentor = d.actor.id === rel.mentorId;
  const isEntrepreneur = d.actor.id === rel.entrepreneurId;

  let nextStatus: AgreementStatus = agreement.status;
  if (isMentor) {
    if (agreement.status === "confirmed_by_entrepreneur") nextStatus = "active";
    else nextStatus = "confirmed_by_mentor";
  } else if (isEntrepreneur) {
    if (agreement.status === "confirmed_by_mentor") nextStatus = "active";
    else nextStatus = "confirmed_by_entrepreneur";
  }

  const now = d.now();
  const updated = await d.repo.mentorshipAgreements.update(
    agreementId,
    {
      status: nextStatus,
      confirmedAt: nextStatus === "active" ? now : agreement.confirmedAt,
    },
    agreement.version,
  );

  // Si el acuerdo queda activo, avanzamos la etapa de la relación a 'active_mentoring' si estaba en 'agreement'
  if (nextStatus === "active" && rel.stage === "agreement") {
    await d.repo.mentorshipRelations.update(
      rel.id,
      { stage: "active_mentoring", updatedAt: now },
      rel.version,
    );
  }

  await audit(d, "mentorship.agreement_confirmed", {
    projectId: rel.projectId,
    targetId: agreementId,
    meta: { status: nextStatus, by: d.actor.id },
  });

  dispatchEventToN8n({
    eventId: d.newId("evt"),
    eventType: "agreement.confirmed",
    occurredAt: now,
    schemaVersion: "1.0.0",
    correlationId: `agr_conf_${agreementId}`,
    actor: { id: d.actor.id, role: d.actor.role, verified: true },
    relationshipId: rel.id,
    projectId: rel.projectId,
    entityType: "mentorship_agreement",
    entityId: agreementId,
    payload: { status: nextStatus, by: d.actor.id },
  });

  return updated;
}

/* ───────────── Objetivos de Mentoría ───────────── */

export interface MentorshipGoalInput {
  title: string;
  description: string;
  whyItMatters: string;
  kind: GoalKind;
  baseline: string;
  targetResult: string;
  metricIndicator?: string;
  targetDate?: string;
  priority: GoalPriority;
  relatedDiagnosisItemIds?: Id[];
}

export async function createMentorshipGoal(
  d: ServiceDeps,
  relationId: Id,
  input: MentorshipGoalInput,
): Promise<MentorshipGoal> {
  const rel = await d.repo.mentorshipRelations.get(relationId);
  if (!rel) throw notFound("La relación de mentoría no existe.");
  await guard(d, rel.projectId, "goal.manage");

  const title = input.title.trim();
  const targetResult = input.targetResult.trim();
  if (title.length < 3) throw validation("El título del objetivo debe tener al menos 3 caracteres.");
  if (targetResult.length < 3) throw validation("El resultado esperado debe tener al menos 3 caracteres.");

  const now = d.now();
  const goal: MentorshipGoal = {
    id: d.newId("gol"),
    relationId,
    title: title.slice(0, 200),
    description: input.description.trim().slice(0, 2000),
    whyItMatters: input.whyItMatters.trim().slice(0, 2000),
    kind: input.kind,
    baseline: input.baseline.trim().slice(0, 2000),
    targetResult: targetResult.slice(0, 2000),
    metricIndicator: input.metricIndicator?.trim().slice(0, 500),
    targetDate: input.targetDate,
    priority: input.priority,
    relatedDiagnosisItemIds: input.relatedDiagnosisItemIds ?? [],
    status: "active",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  await d.repo.mentorshipGoals.insert(goal);
  await audit(d, "mentorship.goal_created", {
    projectId: rel.projectId,
    targetId: goal.id,
    meta: { kind: goal.kind, priority: goal.priority },
  });
  await touch(d, rel.projectId);
  return goal;
}

export async function updateMentorshipGoalStatus(
  d: ServiceDeps,
  goalId: Id,
  status: GoalStatus,
): Promise<MentorshipGoal> {
  const goal = await d.repo.mentorshipGoals.get(goalId);
  if (!goal) throw notFound("El objetivo no existe.");
  const rel = await d.repo.mentorshipRelations.get(goal.relationId);
  if (!rel) throw notFound("La relación de mentoría no existe.");
  await guard(d, rel.projectId, "goal.manage");

  const now = d.now();
  const updated = await d.repo.mentorshipGoals.update(
    goalId,
    {
      status,
      updatedAt: now,
    },
    goal.version,
  );

  await audit(d, "mentorship.goal_status_changed", {
    projectId: rel.projectId,
    targetId: goalId,
    meta: { from: goal.status, to: status },
  });
  await touch(d, rel.projectId);
  return updated;
}

/* ───────────── Sugerencia Asistida por IA ───────────── */

export async function suggestGoalsAndAgreement(
  d: ServiceDeps,
  projectId: Id,
  relationId: Id,
): Promise<GoalsSuggestionResult> {
  await guard(d, projectId, "goal.manage");
  const rel = await d.repo.mentorshipRelations.get(relationId);
  if (!rel) throw notFound("La relación de mentoría no existe.");
  const project = await d.repo.projects.get(projectId);
  if (!project) throw notFound("El proyecto no existe.");

  const [items, notes, existingGoals, agreements, entrepreneurProfile] = await Promise.all([
    d.repo.diagnosisItems.list({ projectId }),
    d.repo.sessionNotes.list({ projectId }),
    d.repo.mentorshipGoals.list({ relationId }),
    d.repo.mentorshipAgreements.list({ relationId }),
    d.repo.profiles.get(rel.entrepreneurId),
  ]);

  const confirmedDiagnosis = items
    .filter((i) => isCurrent(i) && i.reviewStatus === "confirmed")
    .map((i) => ({
      id: i.id,
      category: i.category,
      title: i.title,
      content: i.content,
      infoType: i.infoType,
      reviewStatus: i.reviewStatus,
    }));

  const prioritizedProblems = items
    .filter((i) => isCurrent(i) && i.category === "problem" && i.priority)
    .map((i) => ({
      id: i.id,
      title: i.title,
      content: i.content,
      rank: i.priority?.rank,
      justification: i.priority?.rationale,
    }));

  const latestAgreement = agreements.sort((a, b) => b.version - a.version)[0];

  const ctx: GoalsSuggestionContext = {
    projectName: project.name,
    projectNature: project.nature,
    projectSummary: project.description,
    founderContext:
      entrepreneurProfile?.onboarding?.intent === "entrepreneur"
        ? {
            stage: entrepreneurProfile.onboarding.stage,
            sector: entrepreneurProfile.onboarding.sector,
            goals: entrepreneurProfile.onboarding.goals,
            weeklyHours: entrepreneurProfile.onboarding.weeklyHours,
          }
        : undefined,
    confirmedDiagnosis,
    prioritizedProblems,
    // Los emprendedores pueden gestionar objetivos; eso no les concede acceso a notas privadas.
    mentorNotes: notes.filter((n) => !n.isPrivate).map((n) => n.body),
    existingGoals: existingGoals.map((g) => ({
      title: g.title,
      baseline: g.baseline,
      targetResult: g.targetResult,
      priority: g.priority,
      status: g.status,
    })),
    currentAgreement: latestAgreement
      ? {
          frequency: latestAgreement.frequency,
          sessionDurationMinutes: latestAgreement.sessionDurationMinutes,
          authorizedChannels: latestAgreement.authorizedChannels,
          scope: latestAgreement.scope,
        }
      : undefined,
  };

  const result = await d.ai.suggestGoalsAndAgreement(ctx);
  await audit(d, "ai.invoked", {
    projectId,
    targetId: relationId,
    meta: { kind: "goals_and_agreement", provider: result.provider },
  });
  return result;
}
