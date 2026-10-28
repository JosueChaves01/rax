import type { Comment, DiagnosisCategory, DiagnosisItem, InfoType, Uncertainty } from "@/types/domain";
import { applyHumanChange, type ItemChange } from "@/features/diagnosis/rules";
import { notFound, validation } from "@/lib/errors";
import type { Action } from "@/lib/authz";
import { audit, guard, recordHistory, type ServiceDeps } from "./base";
import { touch } from "./projects";

const ACTION_FOR: Record<ItemChange["kind"], Action> = {
  edit: "diagnosis.edit",
  confirm: "diagnosis.edit",
  reject: "diagnosis.edit",
  mark_unknown: "diagnosis.edit",
  attach_evidence: "evidence.add",
  request_clarification: "diagnosis.request_clarification",
  prioritize: "diagnosis.prioritize",
};

/**
 * Cambio humano sobre un elemento. `expectedVersion` es obligatorio: si otra persona lo modificó
 * entretanto, se rechaza con un conflicto en lugar de pisar el cambio (escenario H).
 */
export async function changeItem(d: ServiceDeps, itemId: string, change: ItemChange, expectedVersion: number): Promise<DiagnosisItem> {
  const before = await d.repo.diagnosisItems.get(itemId);
  if (!before) throw notFound();
  await guard(d, before.projectId, ACTION_FOR[change.kind]);
  if (change.kind === "attach_evidence") {
    const ev = await d.repo.evidence.get(change.evidenceId);
    if (!ev || ev.projectId !== before.projectId) throw notFound("La evidencia no pertenece a este proyecto.");
  }
  const { patch, historyKind, reason } = applyHumanChange(before, change, d.actor.id, d.now());
  const after = await d.repo.diagnosisItems.update(itemId, patch, expectedVersion);
  await recordHistory(d, before, after, historyKind, d.actor.id, reason);
  await audit(d, "diagnosis.item_changed", { projectId: before.projectId, targetId: itemId, meta: { change: historyKind } });
  await touch(d, before.projectId);
  return after;
}

/** Elemento agregado a mano por una persona (no pasa por la IA). */
export async function addItem(
  d: ServiceDeps,
  projectId: string,
  input: { category: DiagnosisCategory; title: string; content: string; uncertainty: Uncertainty; infoType?: InfoType },
): Promise<DiagnosisItem> {
  const { rel } = await guard(d, projectId, "diagnosis.edit");
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) throw validation("Completá título y contenido.");
  const allowed: InfoType[] = ["entrepreneur_statement", "documented_observation", "hypothesis", "unknown"];
  const infoType = input.infoType && allowed.includes(input.infoType) ? input.infoType : "entrepreneur_statement";
  const now = d.now();
  const item: DiagnosisItem = {
    id: d.newId("item"),
    projectId,
    category: input.category,
    title: title.slice(0, 120),
    content: content.slice(0, 2000),
    infoType,
    // Lo que la persona escribe ya está revisado por ella misma.
    reviewStatus: "confirmed",
    uncertainty: infoType === "unknown" ? "unknown" : input.uncertainty,
    source: { kind: rel.isOwner || rel.isCollaborator ? "entrepreneur_edit" : "mentor" },
    authorId: d.actor.id,
    relatedItemIds: [],
    evidenceIds: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await d.repo.diagnosisItems.insert(item);
  await recordHistory(d, null, item, "created", d.actor.id);
  await audit(d, "diagnosis.item_changed", { projectId, targetId: item.id, meta: { change: "created" } });
  await touch(d, projectId);
  return item;
}

export async function editSummary(d: ServiceDeps, projectId: string, summary: string) {
  await guard(d, projectId, "diagnosis.confirm_summary");
  const text = summary.trim();
  if (text.length < 10) throw validation("El resumen es demasiado corto.");
  const [dx] = await d.repo.diagnoses.list({ projectId });
  // Editar invalida una confirmación previa: el resumen vigente debe volver a confirmarse.
  await d.repo.diagnoses.update(dx.id, { summary: text.slice(0, 3000), summaryConfirmedAt: undefined, summaryConfirmedBy: undefined, updatedAt: d.now() });
}

/** «¿Esto representa lo que querés hacer?» — solo la persona dueña del proyecto lo confirma. */
export async function confirmSummary(d: ServiceDeps, projectId: string) {
  await guard(d, projectId, "diagnosis.confirm_summary");
  const [dx] = await d.repo.diagnoses.list({ projectId });
  if (!dx.summary) throw validation("Todavía no hay un resumen para confirmar.");
  await d.repo.diagnoses.update(dx.id, { summaryConfirmedAt: d.now(), summaryConfirmedBy: d.actor.id, updatedAt: d.now() });
  await audit(d, "diagnosis.summary_confirmed", { projectId });
  await touch(d, projectId);
}

export async function addComment(d: ServiceDeps, projectId: string, targetType: Comment["targetType"], targetId: string, body: string) {
  await guard(d, projectId, "diagnosis.comment");
  const text = body.trim();
  if (!text) throw validation("El comentario está vacío.");
  const comment: Comment = { id: d.newId("cmt"), projectId, targetType, targetId, authorId: d.actor.id, body: text.slice(0, 2000), createdAt: d.now() };
  await d.repo.comments.insert(comment);
  return comment;
}
