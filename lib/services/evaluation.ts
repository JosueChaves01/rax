import { notFound } from "@/lib/errors";
import { CycleEvaluationInput, parse } from "@/lib/validation/inputs";
import type { CycleEvaluation } from "@/types/domain";
import { guard, type ServiceDeps } from "./base";

export async function recordCycleEvaluation(
  d: ServiceDeps,
  raw: unknown,
): Promise<CycleEvaluation> {
  const parsed = parse(CycleEvaluationInput, raw);
  const rel = await d.repo.mentorshipRelations.get(parsed.relationId);
  if (!rel) throw notFound("La relación de mentoría no existe.");

  // Verificar permisos en el servidor
  await guard(d, rel.projectId, "cycle.evaluate");

  const now = d.now();

  // 1. Actualizar el estado de cada objetivo evaluado si cambió
  for (const ge of parsed.goalEvaluations) {
    const goal = await d.repo.mentorshipGoals.get(ge.goalId);
    if (goal && goal.status !== ge.status) {
      await d.repo.mentorshipGoals.update(goal.id, {
        status: ge.status,
        updatedAt: now,
      });
      await d.repo.auditEvents.insert({
        id: d.newId("audit"),
        projectId: rel.projectId,
        actorId: d.actor.id,
        action: "mentorship.goal_status_changed",
        targetId: goal.id,
        meta: { previousStatus: goal.status, newStatus: ge.status, cycle: parsed.cycleNumber },
        createdAt: now,
      });
    }
  }

  // 2. Crear el registro inmutable de la evaluación de ciclo
  const evaluation: CycleEvaluation = {
    id: d.newId("eval"),
    relationId: rel.id,
    projectId: rel.projectId,
    cycleNumber: parsed.cycleNumber,
    evaluatedAt: now,
    evaluatedBy: d.actor.id,
    goalEvaluations: parsed.goalEvaluations,
    autonomyAssessment: parsed.autonomyAssessment,
    mentorFeedback: parsed.mentorFeedback,
    entrepreneurFeedback: parsed.entrepreneurFeedback,
    decision: parsed.decision,
    nextCycleFocus: parsed.nextCycleFocus,
    version: 1,
    createdAt: now,
  };

  const saved = await d.repo.cycleEvaluations.insert(evaluation);

  // 3. Transicionar la etapa de la relación según la decisión acordada
  let nextStage = rel.stage;
  let decisionAction: "mentorship.renewed" | "mentorship.closed" | undefined;

  if (parsed.decision === "renew") {
    nextStage = "renewed";
    decisionAction = "mentorship.renewed";
  } else if (parsed.decision === "close") {
    nextStage = "closed";
    decisionAction = "mentorship.closed";
  } else if (parsed.decision === "new_stage") {
    nextStage = "active_mentoring";
  }

  if (nextStage !== rel.stage) {
    await d.repo.mentorshipRelations.update(rel.id, {
      stage: nextStage,
      updatedAt: now,
    });
    await d.repo.auditEvents.insert({
      id: d.newId("audit"),
      projectId: rel.projectId,
      actorId: d.actor.id,
      action: "mentorship.stage_changed",
      targetId: rel.id,
      meta: { previousStage: rel.stage, newStage: nextStage },
      createdAt: now,
    });
  }

  if (decisionAction) {
    await d.repo.auditEvents.insert({
      id: d.newId("audit"),
      projectId: rel.projectId,
      actorId: d.actor.id,
      action: decisionAction,
      targetId: rel.id,
      meta: { cycleNumber: parsed.cycleNumber },
      createdAt: now,
    });
  }

  await d.repo.auditEvents.insert({
    id: d.newId("audit"),
    projectId: rel.projectId,
    actorId: d.actor.id,
    action: "mentorship.cycle_evaluated",
    targetId: saved.id,
    meta: {
      cycleNumber: parsed.cycleNumber,
      decision: parsed.decision,
      autonomyRating: parsed.autonomyAssessment.rating,
      goalsEvaluated: parsed.goalEvaluations.length,
    },
    createdAt: now,
  });

  return saved;
}

export async function listCycleEvaluations(
  d: ServiceDeps,
  relationId: string,
): Promise<CycleEvaluation[]> {
  const rel = await d.repo.mentorshipRelations.get(relationId);
  if (!rel) throw notFound("La relación de mentoría no existe.");
  await guard(d, rel.projectId, "project.read");

  const list = await d.repo.cycleEvaluations.list({ relationId });
  return list.sort((a, b) => a.cycleNumber - b.cycleNumber);
}

export async function getCycleEvaluation(
  d: ServiceDeps,
  evaluationId: string,
): Promise<CycleEvaluation> {
  const ev = await d.repo.cycleEvaluations.get(evaluationId);
  if (!ev) throw notFound("Evaluación de ciclo no encontrada.");
  await guard(d, ev.projectId, "project.read");
  return ev;
}
