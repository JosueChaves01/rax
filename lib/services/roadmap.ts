import type {
  ActionType,
  DelayCauseCategory,
  Id,
  MilestoneStatus,
  RoadmapMilestone,
  Task,
} from "@/types/domain";
import { notFound, validation } from "@/lib/errors";
import { audit, guard, type ServiceDeps } from "./base";
import { touch } from "./projects";

/* ───────────── Hitos de la Hoja de Ruta ───────────── */

export interface MilestoneInput {
  title: string;
  description?: string;
  targetDate?: string;
  goalId?: string;
  relationId?: string;
}

export async function createMilestone(
  d: ServiceDeps,
  projectId: Id,
  input: MilestoneInput,
): Promise<RoadmapMilestone> {
  await guard(d, projectId, "roadmap.manage");
  const title = input.title.trim();
  if (title.length < 3) throw validation("El título del hito debe tener al menos 3 caracteres.");

  const existing = await d.repo.roadmapMilestones.list({ projectId });
  const now = d.now();
  const milestone: RoadmapMilestone = {
    id: d.newId("mls"),
    projectId,
    relationId: input.relationId,
    goalId: input.goalId,
    title: title.slice(0, 200),
    description: input.description?.trim().slice(0, 2000),
    targetDate: input.targetDate,
    status: "pending",
    orderIndex: existing.length,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  await d.repo.roadmapMilestones.insert(milestone);
  await audit(d, "roadmap.milestone_created", {
    projectId,
    targetId: milestone.id,
    meta: { title: milestone.title },
  });
  await touch(d, projectId);
  return milestone;
}

export async function updateMilestone(
  d: ServiceDeps,
  milestoneId: Id,
  patch: Partial<MilestoneInput>,
): Promise<RoadmapMilestone> {
  const ms = await d.repo.roadmapMilestones.get(milestoneId);
  if (!ms) throw notFound("El hito no existe.");
  await guard(d, ms.projectId, "roadmap.manage");

  const now = d.now();
  const updated = await d.repo.roadmapMilestones.update(
    milestoneId,
    {
      ...(patch.title ? { title: patch.title.trim().slice(0, 200) } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim().slice(0, 2000) } : {}),
      ...(patch.targetDate !== undefined ? { targetDate: patch.targetDate } : {}),
      ...(patch.goalId !== undefined ? { goalId: patch.goalId } : {}),
      updatedAt: now,
    },
    ms.version,
  );

  await audit(d, "roadmap.milestone_updated", {
    projectId: ms.projectId,
    targetId: milestoneId,
  });
  await touch(d, ms.projectId);
  return updated;
}

export async function updateMilestoneStatus(
  d: ServiceDeps,
  milestoneId: Id,
  status: MilestoneStatus,
): Promise<RoadmapMilestone> {
  const ms = await d.repo.roadmapMilestones.get(milestoneId);
  if (!ms) throw notFound("El hito no existe.");
  await guard(d, ms.projectId, "roadmap.manage");

  const now = d.now();
  const updated = await d.repo.roadmapMilestones.update(
    milestoneId,
    {
      status,
      updatedAt: now,
    },
    ms.version,
  );

  await audit(d, "roadmap.milestone_status_changed", {
    projectId: ms.projectId,
    targetId: milestoneId,
    meta: { from: ms.status, to: status },
  });
  await touch(d, ms.projectId);
  return updated;
}

export async function deleteMilestone(
  d: ServiceDeps,
  milestoneId: Id,
): Promise<void> {
  const ms = await d.repo.roadmapMilestones.get(milestoneId);
  if (!ms) throw notFound("El hito no existe.");
  await guard(d, ms.projectId, "roadmap.manage");

  await d.repo.roadmapMilestones.delete(milestoneId);
  await touch(d, ms.projectId);
}

/* ───────────── Accountability no punitivo: Diagnóstico de causas ───────────── */

export interface DelayDiagnosisInput {
  causeCategory: DelayCauseCategory;
  detail: string;
}

/**
 * Registra una hipótesis explicativa sobre la causa de un retraso o bloqueo
 * (tiempo, recursos, factores externos, cambio de prioridad, dificultad)
 * sin formular juicios de valor moral ni convertir la mentoría en un control punitivo.
 */
export async function diagnoseTaskDelay(
  d: ServiceDeps,
  taskId: Id,
  input: DelayDiagnosisInput,
): Promise<Task> {
  const task = await d.repo.tasks.get(taskId);
  if (!task) throw notFound("La tarea no existe.");
  await guard(d, task.projectId, "task.diagnose_delay");

  const detail = input.detail.trim();
  if (detail.length < 3) throw validation("El detalle del diagnóstico debe tener al menos 3 caracteres.");

  const now = d.now();
  const updated = await d.repo.tasks.update(taskId, {
    delayHypothesis: {
      causeCategory: input.causeCategory,
      detail: detail.slice(0, 2000),
      identifiedAt: now,
    },
    updatedAt: now,
  });

  await audit(d, "task.delay_diagnosed", {
    projectId: task.projectId,
    targetId: taskId,
    meta: { causeCategory: input.causeCategory },
  });
  await touch(d, task.projectId);
  return updated;
}

export async function setTaskBlocked(
  d: ServiceDeps,
  taskId: Id,
  blockedReason: string,
): Promise<Task> {
  const task = await d.repo.tasks.get(taskId);
  if (!task) throw notFound("La tarea no existe.");
  await guard(d, task.projectId, "task.manage");

  const now = d.now();
  const updated = await d.repo.tasks.update(taskId, {
    status: "blocked",
    blockedReason: blockedReason.trim().slice(0, 2000),
    updatedAt: now,
  });

  await touch(d, task.projectId);
  return updated;
}

export async function attachEvidenceToTask(
  d: ServiceDeps,
  taskId: Id,
  evidenceId: Id,
): Promise<Task> {
  const [task, ev] = await Promise.all([
    d.repo.tasks.get(taskId),
    d.repo.evidence.get(evidenceId),
  ]);
  if (!task) throw notFound("La tarea no existe.");
  if (!ev || ev.projectId !== task.projectId) throw notFound("La evidencia no existe o pertenece a otro proyecto.");
  await guard(d, task.projectId, "task.manage");

  const currentIds = task.evidenceIds ?? [];
  if (currentIds.includes(evidenceId)) return task;

  const now = d.now();
  const updated = await d.repo.tasks.update(taskId, {
    evidenceIds: [...currentIds, evidenceId],
    updatedAt: now,
  });

  await touch(d, task.projectId);
  return updated;
}
