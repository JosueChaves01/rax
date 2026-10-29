import { forbidden, notFound } from "@/lib/errors";
import { MentorResourceInput, parse } from "@/lib/validation/inputs";
import type { MentorResource, ResourceCategory } from "@/types/domain";
import { guard, type ServiceDeps } from "./base";

export interface ResourceFilter {
  category?: ResourceCategory;
  query?: string;
  tag?: string;
}

export interface SuggestedResource {
  resource: MentorResource;
  relevanceScore: number;
  whyItHelpsNow: string;
}

export async function listResources(
  d: ServiceDeps,
  filter?: ResourceFilter,
): Promise<MentorResource[]> {
  const all = await d.repo.mentorResources.list();
  const visible = all.filter((r) => r.isPublic || (d.actor.id && r.authorMentorId === d.actor.id));

  let result = visible;
  if (filter?.category) {
    result = result.filter((r) => r.category === filter.category);
  }
  if (filter?.tag) {
    const t = filter.tag.toLowerCase();
    result = result.filter((r) => r.tags.some((tag) => tag.toLowerCase().includes(t)));
  }
  if (filter?.query) {
    const q = filter.query.toLowerCase().trim();
    result = result.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  return result.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getResource(d: ServiceDeps, id: string): Promise<MentorResource> {
  const r = await d.repo.mentorResources.get(id);
  if (!r) throw notFound("El recurso solicitado no existe.");
  if (!r.isPublic && r.authorMentorId !== d.actor.id && d.actor.role !== "admin") {
    throw forbidden("No tienes permiso para ver este recurso privado.");
  }
  return r;
}

export async function createResource(d: ServiceDeps, raw: unknown): Promise<MentorResource> {
  if (d.actor.role !== "mentor" && d.actor.role !== "admin") {
    throw forbidden("Solo mentores o administradores pueden agregar recursos a la biblioteca.");
  }
  const parsed = parse(MentorResourceInput, raw);
  const now = d.now();
  const resource: MentorResource = {
    id: d.newId("res"),
    title: parsed.title,
    category: parsed.category,
    description: parsed.description,
    content: parsed.content,
    tags: parsed.tags,
    authorMentorId: d.actor.id,
    isPublic: parsed.isPublic,
    createdAt: now,
    updatedAt: now,
  };

  const created = await d.repo.mentorResources.insert(resource);
  await d.repo.auditEvents.insert({
    id: d.newId("audit"),
    actorId: d.actor.id,
    action: "resource.created",
    targetId: created.id,
    meta: { title: created.title, category: created.category, isPublic: created.isPublic },
    createdAt: now,
  });
  return created;
}

/**
 * Motor contextual de sugerencia de recursos:
 * Analiza el estado actual del proyecto (bloqueos, diagnósticos de demora, objetivos prioritarios)
 * y selecciona los 1-2 recursos más pertinentes con justificación pedagógica.
 */
export async function suggestContextualResources(
  d: ServiceDeps,
  projectId: string,
): Promise<SuggestedResource[]> {
  await guard(d, projectId, "project.read");
  const [tasks, resources, goals] = await Promise.all([
    d.repo.tasks.list({ projectId }),
    d.repo.mentorResources.list(),
  d.repo.mentorshipGoals.list(),
  ]);

  const activeGoals = goals.filter((g) => g.status === "active");
  const blockedTasks = tasks.filter((t) => t.status === "blocked");
  const delayedTasks = tasks.filter((t) => t.delayHypothesis != null);

  const suggestions: SuggestedResource[] = [];

  for (const res of resources) {
    if (!res.isPublic && res.authorMentorId !== d.actor.id) continue;
    let score = 0;
    let reason = "";

    // 1. Si hay tareas bloqueadas o con hipótesis de retraso, sugerir protocolo de retrasos
    if ((blockedTasks.length > 0 || delayedTasks.length > 0) && res.id === "res-diagnostico-retraso-05") {
      score += 50;
      reason = `Hay ${blockedTasks.length} tarea(s) bloqueada(s) y ${delayedTasks.length} demora(s) diagnosticada(s). Este protocolo ayuda a desarmar el obstáculo sin generar frustración.`;
    }

    // 2. Si hay muchas tareas activas (> 5) o dudas de priorización, sugerir matriz ICE
    if (tasks.filter((t) => t.status !== "done").length >= 4 && res.id === "res-matriz-ice-03") {
      score += 40;
      reason = "Hay múltiples iniciativas en curso. La Matriz ICE permite desempatar prioridades y concentrar el foco en las 2 acciones clave.";
    }

    // 3. Si hay objetivos con palabras clave financieras o de costos
    const hasFinancialGoal = activeGoals.some(
      (g) => g.title.toLowerCase().includes("costo") || g.title.toLowerCase().includes("financier") || g.title.toLowerCase().includes("margen") || g.title.toLowerCase().includes("precio"),
    );
    if (hasFinancialGoal && res.id === "res-costos-unitarios-04") {
      score += 45;
      reason = "El proyecto tiene objetivos vinculados a rentabilidad o estructura de costos. Esta plantilla define el margen de contribución unitario.";
    }

    // 4. Si hay objetivos de validación de clientes o entrevistas
    const hasCustomerGoal = activeGoals.some(
      (g) => g.title.toLowerCase().includes("cliente") || g.title.toLowerCase().includes("entrevista") || g.title.toLowerCase().includes("mercado") || g.title.toLowerCase().includes("validar"),
    );
    if (hasCustomerGoal && res.id === "res-mom-test-02") {
      score += 35;
      reason = "Detectamos foco en validación de clientes. Este cuestionario evita preguntas sesgadas y revela comportamiento de compra real.";
    }

    // 5. Si hay experimentos o tareas de tipo 'experiment'
    const hasExperiments = tasks.some((t) => t.actionType === "experiment");
    if (hasExperiments && res.id === "res-smoke-test-06") {
      score += 30;
      reason = "Hay experimentos activos en la hoja de ruta. Este patrón permite testear demanda real antes de construir.";
    }

    // Canvas Lean como base
    if (res.id === "res-canvas-lean-01" && activeGoals.length <= 2) {
      score += 20;
      reason = "Estructura integral para clarificar la propuesta de valor y los supuestos del modelo de negocio.";
    }

    if (score > 0) {
      suggestions.push({
        resource: res,
        relevanceScore: score,
        whyItHelpsNow: reason,
      });
    }
  }

  return suggestions
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3);
}
