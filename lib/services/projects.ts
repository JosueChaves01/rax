import type { Diagnosis, InitiativeNature, MentorOnboarding, MentorshipAgreement, MentorshipGoal, Project, ProjectStatus } from "@/types/domain";
import { can } from "@/lib/authz";
import { validation } from "@/lib/errors";
import { derivePhase } from "@/features/projects/phase";
import { deriveDiagnosisStatus, isCurrent } from "@/features/diagnosis/rules";
import { DIMENSION_QUESTION } from "@/features/conversation/interview";
import { audit, guard, relationOf, sysRepo, type ServiceDeps } from "./base";

export async function listMyProjects(d: ServiceDeps): Promise<Project[]> {
  const owned = await d.repo.projects.list({ ownerId: d.actor.id });
  const memberships = await d.repo.projectMembers.list({ profileId: d.actor.id });
  const assigned = await d.repo.mentorAssignments.list({ mentorId: d.actor.id, status: "active" });
  const ids = new Set([...owned.map((p) => p.id), ...memberships.map((m) => m.projectId), ...assigned.map((a) => a.projectId)]);
  const projects = await Promise.all([...ids].map((id) => d.repo.projects.get(id)));
  return projects.filter((p): p is Project => !!p).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createProject(
  d: ServiceDeps,
  input: { name: string; description: string; nature: InitiativeNature },
): Promise<Project> {
  if (d.actor.role !== "entrepreneur") throw validation("Solo las personas emprendedoras crean proyectos.");
  if (!d.actor.onboardedAt) throw validation("Completá la bienvenida antes de crear un proyecto.");
  if (d.actor.onboarding?.intent === "mentor") throw validation("Tu cuenta está registrada para mentoría.");
  const name = input.name.trim();
  if (name.length < 2) throw validation("Poné al menos un nombre provisional (2 caracteres o más).");
  if (name.length > 80) throw validation("El nombre es demasiado largo (máximo 80 caracteres).");
  const now = d.now();
  const project: Project = {
    id: d.newId("prj"),
    ownerId: d.actor.id,
    name,
    description: input.description.trim().slice(0, 1000),
    nature: input.nature,
    status: "active",
    shareConversationWithMentor: false,
    createdAt: now,
    updatedAt: now,
  };
  await d.repo.projects.insert(project);
  // Armado inicial: lo hace el sistema una vez creado el proyecto por su dueño.
  const sys = sysRepo(d);
  await sys.projectMembers.insert({ id: `${project.id}:${d.actor.id}`, projectId: project.id, profileId: d.actor.id, role: "owner", createdAt: now });
  const conv = await sys.conversations.insert({ id: d.newId("conv"), projectId: project.id, createdAt: now });
  await sys.diagnoses.insert({ id: d.newId("dx"), projectId: project.id, status: "exploring", updatedAt: now });
  // Primera pregunta de la guía. Es texto fijo de la plataforma, no generado por un modelo.
  await sys.messages.insert({
    id: d.newId("msg"),
    conversationId: conv.id,
    projectId: project.id,
    author: "assistant",
    content: `Hola. Vamos a ordenar juntos lo que sabés de «${name}». No necesitás tener todo claro: lo que no sepas también es información útil. ${DIMENSION_QUESTION.nature}`,
    dimension: "nature",
    createdAt: now,
  });
  await audit(d, "project.created", { projectId: project.id, targetId: project.id });
  return project;
}

export async function setProjectStatus(d: ServiceDeps, projectId: string, status: ProjectStatus) {
  const { project } = await guard(d, projectId, "project.update");
  await d.repo.projects.update(projectId, { status, updatedAt: d.now() });
  await audit(d, "project.status_changed", { projectId, meta: { from: project.status, to: status } });
}

export async function setConversationSharing(d: ServiceDeps, projectId: string, share: boolean) {
  await guard(d, projectId, "project.update");
  await d.repo.projects.update(projectId, { shareConversationWithMentor: share, updatedAt: d.now() });
  await audit(d, "project.status_changed", { projectId, meta: { shareConversationWithMentor: share } });
}

/** Marca actividad reciente. La hace el sistema: también la provocan mentores, que no editan el proyecto. */
export async function touch(d: ServiceDeps, projectId: string) {
  await sysRepo(d).projects.update(projectId, { updatedAt: d.now() });
}

/** Crea el diagnóstico vacío que le falta a un proyecto. Si no se puede guardar, devuelve uno en memoria. */
async function ensureDiagnosis(d: ServiceDeps, projectId: string, fallbackDate: string): Promise<Diagnosis> {
  const empty: Diagnosis = { id: d.newId("dx"), projectId, status: "exploring", updatedAt: fallbackDate };
  try {
    return await sysRepo(d).diagnoses.insert({ ...empty, updatedAt: d.now() });
  } catch (e) {
    console.warn("[rax] proyecto sin diagnóstico y no se pudo crear:", projectId, e instanceof Error ? e.message : e);
    return empty;
  }
}

/** Vista agregada del espacio de trabajo. Los permisos se calculan aquí, en el servidor. */
export async function getWorkspace(d: ServiceDeps, projectId: string) {
  const { project, rel } = await guard(d, projectId, "project.read");
  const r = d.repo;
  const where = { projectId };
  const [diagnoses, items, history, comments, messages, sessions, notes, hypotheses, experiments, results, tasks, evidence, assignments, auditEvents, mentorshipRelations, roadmapMilestones, cycleEvaluations] =
    await Promise.all([
      r.diagnoses.list(where),
      r.diagnosisItems.list(where),
      r.diagnosisItemHistory.list(where),
      r.comments.list(where),
      r.messages.list(where),
      r.mentorSessions.list(where),
      r.sessionNotes.list(where),
      r.hypotheses.list(where),
      r.experiments.list(where),
      r.experimentResults.list(where),
      r.tasks.list(where),
      r.evidence.list(where),
      r.mentorAssignments.list({ projectId, status: "active" }),
      r.auditEvents.list(where),
      r.mentorshipRelations.list(where),
      r.roadmapMilestones.list(where),
      r.cycleEvaluations.list(where),
    ]);
  // Un proyecto cuyo armado inicial quedó a medias puede no tener diagnóstico: se repara en vez de romper la vista.
  const diagnosis = diagnoses[0] ?? (await ensureDiagnosis(d, project.id, project.updatedAt));
  const status = deriveDiagnosisStatus(diagnosis, items, sessions, hypotheses);
  const phase = derivePhase({
    messages,
    diagnosis,
    sessions,
    hypotheses,
    experiments,
    hasPrioritizedProblem: items.some((i) => isCurrent(i) && i.category === "problem" && !!i.priority),
  });

  const activeMentorshipRelation =
    mentorshipRelations.find((mr) => mr.stage !== "closed") ??
    mentorshipRelations[0] ??
    null;

  let mentorshipAgreements: MentorshipAgreement[] = [];
  let mentorshipGoals: MentorshipGoal[] = [];

  if (activeMentorshipRelation) {
    const [agrs, goals] = await Promise.all([
      r.mentorshipAgreements.list({ relationId: activeMentorshipRelation.id }),
      r.mentorshipGoals.list({ relationId: activeMentorshipRelation.id }),
    ]);
    mentorshipAgreements = agrs;
    mentorshipGoals = goals;
  }

  const isMentorView = rel.isAssignedMentor && !rel.isOwner && !rel.isCollaborator;
  const canSeeConversation = !isMentorView || project.shareConversationWithMentor;

  const peopleIds = new Set<string>([project.ownerId, ...assignments.map((a) => a.mentorId)]);
  const people = (await Promise.all([...peopleIds].map((id) => r.profiles.get(id)))).filter(Boolean);
  const ownerProfile = people.find((p) => p!.id === project.ownerId);

  const permissions = Object.fromEntries(
    (
      [
        "project.update",
        "conversation.write",
        "diagnosis.edit",
        "diagnosis.confirm_summary",
        "diagnosis.comment",
        "diagnosis.request_clarification",
        "diagnosis.prioritize",
        "mentor.request_review",
        "mentor.note",
        "mentor.decide",
        "hypothesis.propose",
        "hypothesis.approve",
        "experiment.design",
        "experiment.start",
        "experiment.record_result",
        "evidence.add",
        "task.manage",
        "mentorship.manage",
        "agreement.edit",
        "agreement.confirm",
        "goal.manage",
        "roadmap.manage",
        "task.diagnose_delay",
        "cycle.evaluate",
        "resource.manage",
      ] as const
    ).map((a) => [a, can(d.actor, a, rel)]),
  ) as Record<string, boolean>;

  const byTime = <T extends { createdAt: string }>(xs: T[]) => xs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    project,
    relation: rel,
    isMentorView,
    diagnosis: { ...diagnosis, status },
    phase,
    items: byTime(items),
    history: byTime(history),
    comments: byTime(comments),
    messages: canSeeConversation ? byTime(messages) : [],
    conversationHidden: !canSeeConversation,
    sessions: byTime(sessions),
    notes: byTime(notes.filter((n) => !n.isPrivate || n.authorId === d.actor.id)),
    hypotheses: byTime(hypotheses),
    experiments: byTime(experiments),
    results: byTime(results),
    tasks: byTime(tasks),
    cycleEvaluations: byTime(cycleEvaluations),
    mentorshipRelation: activeMentorshipRelation,
    mentorshipRelations: byTime(mentorshipRelations),
    mentorshipAgreements: byTime(mentorshipAgreements),
    mentorshipGoals: byTime(mentorshipGoals),
    roadmapMilestones: byTime(roadmapMilestones).sort((a, b) => a.orderIndex - b.orderIndex),
    evidence: byTime(evidence),
    mentors: assignments.map((a) => a.mentorId),
    people: Object.fromEntries(people.map((p) => [p!.id, { id: p!.id, name: p!.name, role: p!.role }])),
    /** Lo que el emprendedor contó en su bienvenida: orienta al mentor desde la primera revisión. */
    founderContext: ownerProfile?.onboarding?.intent === "entrepreneur" ? ownerProfile.onboarding : undefined,
    /** Experiencia de los mentores asignados, para que el emprendedor sepa quién lo acompaña. */
    mentorContext: Object.fromEntries(
      people.filter((p) => p!.onboarding?.intent === "mentor").map((p) => [p!.id, p!.onboarding as MentorOnboarding]),
    ),
    audit: isMentorView ? [] : byTime(auditEvents).slice(-50),
    permissions,
    ai: { id: d.ai.id, label: d.ai.label },
  };
}

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;

export async function myRelation(d: ServiceDeps, projectId: string) {
  return relationOf(d, projectId);
}
