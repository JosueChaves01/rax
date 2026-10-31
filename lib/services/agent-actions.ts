import type {
  AgreementFrequency,
  DiagnosisCategory,
  EvidenceKind,
  GoalKind,
  GoalPriority,
  GoalStatus,
  Hypothesis,
  MentorDecision,
  MentorSessionKind,
  MentorshipRelation,
  ResultOutcome,
  SessionNoteKind,
  TaskStatus,
} from "@/types/domain";
import type { AiProposalItem } from "@/lib/n8n/contracts";
import { parseStepParams, type StepActionParams } from "@/lib/ai/step-actions";
import { notFound, validation } from "@/lib/errors";
import { guard, type ServiceDeps } from "./base";
import { addItem, changeItem, confirmSummary, editSummary } from "./diagnosis";
import { addNote, completeFirstReview, completeSecondReview, completeSession, requestReview, scheduleSession } from "./mentoring";
import {
  confirmMentorshipAgreement,
  createMentorshipGoal,
  initiateMentorshipRelation,
  saveMentorshipAgreement,
} from "./mentorship-relation";
import { recordCycleEvaluation } from "./evaluation";
import {
  addEvidence,
  approveHypothesis,
  createExperiment,
  createTask,
  discardHypothesis,
  markExperimentReady,
  proposeHypothesis,
  recordResult,
  returnHypothesis,
  setTaskStatus,
  startExperiment,
  submitHypothesis,
} from "./validation";

export interface AppliedProposal {
  ok: true;
  type: AiProposalItem["type"];
  id?: string;
  title: string;
  /** Texto breve de lo que pasó, para mostrar en la tarjeta. */
  notice?: string;
}

const meta = (item: AiProposalItem) => (item.metadata ?? {}) as Record<string, unknown>;
const str = (v: unknown, fallback = "") => (typeof v === "string" && v.trim() ? v.trim() : fallback);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

const PAST_APPROVAL: Hypothesis["status"][] = ["approved", "testing", "inconclusive", "supported", "weakened"];

/**
 * Aplica una propuesta del agente con los servicios de dominio. Es el único camino por el que una
 * tarjeta del chat cambia el proyecto, y cada servicio vuelve a verificar el permiso de quien aplica.
 */
export async function applyAgentProposal(d: ServiceDeps, projectId: string, item: AiProposalItem): Promise<AppliedProposal> {
  switch (item.type) {
    case "task": {
      const task = await createTask(d, projectId, {
        title: item.title,
        dueDate: /^\d{4}-\d{2}-\d{2}/.test(item.dueDateSuggestion ?? "") ? item.dueDateSuggestion!.slice(0, 10) : undefined,
        actionType: item.actionType || "operational_task",
        experimentId: str(meta(item).experimentId) || undefined,
      });
      return { ok: true, type: "task", id: task.id, title: task.title };
    }

    case "hypothesis": {
      const m = meta(item);
      const hyp = await proposeHypothesis(d, projectId, {
        statement: item.title,
        segment: str(m.segment, "Por definir con el mentor"),
        whyItMatters: str(m.whyItMatters, item.description || "Supuesto clave del proyecto"),
        currentEvidence: str(m.currentEvidence, "Por verificar"),
        costOfBeingWrong: str(m.costOfBeingWrong, "Dedicar tiempo y recursos a un supuesto no comprobado"),
        evaluationCriterion: str(m.evaluationCriterion, str(m.successCriterion, "Por definir antes de probarla")),
        uncertainty: oneOf(m.uncertainty, ["low", "medium", "high", "unknown"] as const, "high"),
        relatedItemId: str(m.relatedItemId) || undefined,
      });
      return { ok: true, type: "hypothesis", id: hyp.id, title: hyp.statement, notice: "Hipótesis guardada en borrador. Cuando esté lista, enviala a aprobación del mentor." };
    }

    case "experiment":
      return applyExperiment(d, projectId, item);

    case "diagnosis_item": {
      const diag = await addItem(d, projectId, {
        category: (item.category as DiagnosisCategory) || "context",
        title: item.title,
        content: item.description || item.title,
        uncertainty: "medium",
      });
      // Una síntesis de contexto alimenta el resumen mientras no esté confirmado (paso a «Orientar»).
      let notice: string | undefined;
      if ((item.category === "context" || /s[ií]ntesis|resumen|contexto/i.test(item.title)) && item.description && item.description.length >= 10) {
        const [dx] = await d.repo.diagnoses.list({ projectId });
        if (dx && !dx.summaryConfirmedAt && (await canDo(d, projectId, "diagnosis.confirm_summary"))) {
          await editSummary(d, projectId, item.description.slice(0, 3000));
          notice = "También quedó como resumen del diagnóstico, listo para confirmar.";
        }
      }
      return { ok: true, type: "diagnosis_item", id: diag.id, title: diag.title, notice };
    }

    case "agenda_topic": {
      // El mentor lo guarda como pregunta en su próxima sesión; el emprendedor, como tarea para llevar a la sesión.
      if (d.actor.role === "mentor") {
        const next = await openSession(d, projectId);
        if (!next) throw validation("Programa una sesión para guardar este tema en su agenda.");
        await guard(d, projectId, "mentor.note");
        // Se inserta sin addNote para no marcar como iniciada una sesión que todavía no ocurrió.
        const note = await d.repo.sessionNotes.insert({
          id: d.newId("note"),
          sessionId: next.id,
          projectId,
          authorId: d.actor.id,
          kind: "question",
          body: [item.title, item.description].filter(Boolean).join("\n").slice(0, 2000),
          isPrivate: false,
          createdAt: d.now(),
        });
        return { ok: true, type: "agenda_topic", id: note.id, title: item.title };
      }
      const task = await createTask(d, projectId, { title: `Llevar a la sesión: ${item.title}`.slice(0, 300), dueDate: undefined, actionType: "research" });
      return { ok: true, type: "agenda_topic", id: task.id, title: task.title };
    }

    case "goal": {
      const m = meta(item);
      const rel = await ensureRelation(d, projectId);
      const goal = await createMentorshipGoal(d, rel.id, {
        title: item.title,
        description: item.description ?? "",
        whyItMatters: str(m.whyItMatters),
        kind: oneOf<GoalKind>(m.kind, ["metric", "qualitative", "capability", "strategic"], "qualitative"),
        baseline: str(m.baseline, "Punto de partida por registrar"),
        targetResult: str(m.targetResult, item.successCriteria || item.description || item.title),
        metricIndicator: str(m.metricIndicator) || undefined,
        targetDate: /^\d{4}-\d{2}-\d{2}/.test(str(m.targetDate)) ? str(m.targetDate).slice(0, 10) : undefined,
        priority: oneOf<GoalPriority>(m.priority, ["high", "medium", "low"], "medium"),
      });
      return { ok: true, type: "goal", id: goal.id, title: goal.title };
    }

    case "flow_action": {
      const params = parseStepParams(meta(item));
      if (!params) throw validation("La acción propuesta no es válida.");
      return runStepAction(d, projectId, params, item.title);
    }

    default:
      // Recomendaciones e intervenciones son orientativas: no cambian el proyecto.
      return { ok: true, type: item.type, title: item.title };
  }
}

async function canDo(d: ServiceDeps, projectId: string, action: Parameters<typeof guard>[2]) {
  try {
    await guard(d, projectId, action);
    return true;
  } catch {
    return false;
  }
}

async function openSession(d: ServiceDeps, projectId: string, kind?: MentorSessionKind) {
  const sessions = await d.repo.mentorSessions.list({ projectId });
  return sessions
    .filter((s) => s.mentorId === d.actor.id && s.status !== "completed" && (!kind || s.kind === kind))
    .sort((a, b) => (a.scheduledAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.createdAt))[0];
}

/** La relación de mentoría se abre sola la primera vez que se acuerda algo con el mentor asignado. */
async function ensureRelation(d: ServiceDeps, projectId: string): Promise<MentorshipRelation> {
  const relations = await d.repo.mentorshipRelations.list({ projectId });
  const open = relations.find((r) => r.stage !== "closed");
  if (open) return open;
  const [project, [assignment]] = await Promise.all([
    d.repo.projects.get(projectId),
    d.repo.mentorAssignments.list({ projectId, status: "active" }),
  ]);
  if (!project) throw notFound();
  if (!assignment) throw validation("Los objetivos y el acuerdo se definen con el mentor: todavía no hay uno asignado.");
  return initiateMentorshipRelation(d, projectId, project.ownerId, assignment.mentorId);
}

async function applyExperiment(d: ServiceDeps, projectId: string, item: AiProposalItem): Promise<AppliedProposal> {
  const m = meta(item);
  const hyps = await d.repo.hypotheses.list({ projectId });
  const target = str(m.hypothesisId)
    ? hyps.find((h) => h.id === str(m.hypothesisId))
    : hyps.filter((h) => PAST_APPROVAL.includes(h.status)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!target) throw validation("El experimento se diseña sobre una hipótesis aprobada por el mentor. Primero enviá la hipótesis a aprobación.");
  // Propuestas viejas traían los criterios dentro de la descripción.
  const fromDesc = (label: string) => item.description?.match(new RegExp(`${label}:\\s*([^.]+)`, "i"))?.[1]?.trim() ?? "";
  const activities = Array.isArray(m.activities) ? m.activities.filter((a): a is string => typeof a === "string") : [];
  const exp = await createExperiment(d, target.id, {
    question: str(m.question, item.title.replace(/^Experimento:\s*/i, "")),
    method: str(m.method, fromDesc("Método")),
    participants: str(m.participants),
    activities,
    resources: str(m.resources),
    budget: typeof m.budget === "number" ? m.budget : null,
    durationDays: typeof m.durationDays === "number" ? m.durationDays : null,
    metric: str(m.metric, fromDesc("Métrica")),
    successCriterion: str(m.successCriterion, fromDesc("Criterio de Éxito")),
    rejectionCriterion: str(m.rejectionCriterion, fromDesc("Criterio de Descarte")),
    risks: str(m.risks),
    evidencePlan: str(m.evidencePlan),
  });
  return { ok: true, type: "experiment", id: exp.id, title: exp.question, notice: "Experimento en diseño. Cuando esté completo, inicialo para bloquear los criterios." };
}

/** Ejecuta un paso del recorrido. Cada rama delega en el servicio que también usa la pantalla. */
async function runStepAction(d: ServiceDeps, projectId: string, p: StepActionParams, title: string): Promise<AppliedProposal> {
  const done = (id: string | undefined, notice: string): AppliedProposal => ({ ok: true, type: "flow_action", id, title, notice });

  switch (p.action) {
    case "set_summary": {
      if (!p.text) throw validation("Falta el texto del resumen.");
      await editSummary(d, projectId, p.text);
      return done(undefined, "Resumen guardado. Falta confirmarlo.");
    }
    case "confirm_summary": {
      await confirmSummary(d, projectId);
      return done(undefined, "Resumen confirmado. El siguiente paso es pedir la primera revisión.");
    }
    case "review_item": {
      const it = p.targetId ? await d.repo.diagnosisItems.get(p.targetId) : undefined;
      if (!it || it.projectId !== projectId) throw notFound("Ese hallazgo no pertenece a este proyecto.");
      const updated = await changeItem(d, it.id, p.decision === "reject" ? { kind: "reject", reason: p.text ?? "Descartado desde el chat" } : { kind: "confirm" }, it.version);
      return done(updated.id, p.decision === "reject" ? "Hallazgo descartado." : "Hallazgo confirmado.");
    }
    case "request_review": {
      const kind: MentorSessionKind = p.kind === "second_review" ? "second_review" : "first_review";
      const s = await requestReview(d, projectId, kind);
      return done(s.id, "Pedido enviado al mentor.");
    }
    case "add_session_note": {
      const s = (p.targetId && (await d.repo.mentorSessions.get(p.targetId))) || (await openSession(d, projectId));
      if (!s || s.projectId !== projectId) throw validation("No hay una sesión abierta para esta nota.");
      const kind = oneOf<SessionNoteKind>(p.kind, ["observation", "question", "suggestion", "commitment", "blocker"], "observation");
      const note = await addNote(d, s.id, kind, p.text ?? title);
      return done(note.id, "Nota guardada en la sesión.");
    }
    case "complete_first_review": {
      const s = await openSession(d, projectId, "first_review");
      if (!s) throw validation("No hay una primera revisión pendiente a tu nombre.");
      await completeFirstReview(d, s.id, p.text ?? "");
      return done(s.id, "Primera revisión cerrada con el acuerdo registrado.");
    }
    case "prioritize_problem": {
      const it = p.targetId ? await d.repo.diagnosisItems.get(p.targetId) : undefined;
      if (!it || it.projectId !== projectId) throw notFound("Ese problema no pertenece a este proyecto.");
      const updated = await changeItem(d, it.id, { kind: "prioritize", rank: Math.max(1, Math.round(p.rank ?? 1)), rationale: p.text ?? "" }, it.version);
      return done(updated.id, "Problema priorizado.");
    }
    case "save_agreement": {
      const rel = await ensureRelation(d, projectId);
      const agr = await saveMentorshipAgreement(d, rel.id, {
        frequency: oneOf<AgreementFrequency>(p.frequency, ["weekly", "biweekly", "monthly", "on_demand"], "biweekly"),
        sessionDurationMinutes: Math.round(p.sessionDurationMinutes ?? 60),
        authorizedChannels: ["plataforma"],
        scope: p.scope ?? p.text ?? "",
        mentorCommitments: p.mentorCommitments ?? "",
        entrepreneurCommitments: p.entrepreneurCommitments ?? "",
        confidentialityTerms: "Lo conversado queda entre las partes y dentro de RAX.",
        expectedDurationWeeks: Math.round(p.expectedDurationWeeks ?? 12),
      });
      return done(agr.id, "Acuerdo guardado en borrador. Lo tienen que confirmar ambas partes.");
    }
    case "confirm_agreement": {
      const rel = await ensureRelation(d, projectId);
      const agreements = await d.repo.mentorshipAgreements.list({ relationId: rel.id });
      const agr = p.targetId ? agreements.find((a) => a.id === p.targetId) : agreements.filter((a) => a.status !== "active").sort((a, b) => b.version - a.version)[0];
      if (!agr) throw validation("No hay un acuerdo pendiente de confirmar.");
      const updated = await confirmMentorshipAgreement(d, agr.id);
      return done(updated.id, updated.status === "active" ? "Acuerdo activo: lo confirmaron ambas partes." : "Confirmaste el acuerdo. Falta la otra parte.");
    }
    case "submit_hypothesis": {
      const h = await pickHypothesis(d, projectId, p.targetId, ["draft"]);
      await submitHypothesis(d, h.id);
      return done(h.id, "Hipótesis enviada a aprobación del mentor.");
    }
    case "decide_hypothesis": {
      const h = await pickHypothesis(d, projectId, p.targetId, ["pending_approval"]);
      const fn = p.decision === "discard" ? discardHypothesis : p.decision === "return" ? returnHypothesis : approveHypothesis;
      await fn(d, h.id);
      return done(h.id, p.decision === "discard" ? "Hipótesis descartada." : p.decision === "return" ? "Hipótesis devuelta al borrador." : "Hipótesis aprobada: ya se puede diseñar el experimento.");
    }
    case "start_experiment": {
      const e = await pickExperiment(d, projectId, p.targetId, ["design", "ready"]);
      if (e.status === "design") await markExperimentReady(d, e.id);
      await startExperiment(d, e.id);
      return done(e.id, "Experimento iniciado: los criterios quedaron bloqueados.");
    }
    case "add_evidence": {
      const kind: EvidenceKind = p.url ? "link" : "note";
      const ev = await addEvidence(d, projectId, { kind, title: p.title ?? title, description: p.text ?? "", url: p.url });
      return done(ev.id, "Evidencia registrada.");
    }
    case "set_task_status": {
      const t = p.targetId ? await d.repo.tasks.get(p.targetId) : undefined;
      if (!t || t.projectId !== projectId) throw notFound("Esa tarea no pertenece a este proyecto.");
      await setTaskStatus(d, t.id, oneOf<TaskStatus>(p.status, ["todo", "doing", "done", "blocked"], "done"));
      return done(t.id, "Tarea actualizada.");
    }
    case "record_result": {
      const e = await pickExperiment(d, projectId, p.targetId, ["running"]);
      const evidence = await d.repo.evidence.list({ projectId });
      const res = await recordResult(d, e.id, {
        outcome: oneOf<ResultOutcome>(p.outcome, ["positive", "negative", "mixed", "inconclusive"], "inconclusive"),
        observed: p.text ?? "",
        metricValue: p.metricValue ?? "",
        learnings: p.learnings ?? "",
        limitations: p.limitations ?? "",
        // La evidencia cargada mientras corría el experimento queda asociada al resultado.
        evidenceIds: evidence.filter((ev) => ev.createdAt >= (e.criteriaLockedAt ?? e.createdAt)).map((ev) => ev.id),
      });
      return done(res.id, "Resultado registrado. El siguiente paso es pedir la segunda revisión.");
    }
    case "mentor_decision": {
      const s = await openSession(d, projectId, "second_review");
      if (!s) throw validation("No hay una segunda revisión pendiente a tu nombre.");
      const h = await pickHypothesis(d, projectId, p.targetId, ["supported", "weakened", "inconclusive", "testing"]);
      const decision = oneOf<MentorDecision>(p.decision, ["continue", "reformulate", "deepen", "pause", "discard"], "continue");
      await completeSecondReview(d, s.id, decision, p.text ?? "", h.id);
      return done(s.id, "Decisión registrada: el ciclo quedó cerrado.");
    }
    case "schedule_session": {
      const at = p.scheduledAt && !Number.isNaN(Date.parse(p.scheduledAt)) ? new Date(p.scheduledAt).toISOString() : undefined;
      const rel = (await d.repo.mentorshipRelations.list({ projectId })).find((r) => r.stage !== "closed");
      const s = await scheduleSession(d, projectId, { kind: "follow_up" as MentorSessionKind, scheduledAt: at, relationId: rel?.id });
      return done(s.id, "Sesión agendada.");
    }
    case "complete_session": {
      const s = (p.targetId && (await d.repo.mentorSessions.get(p.targetId))) || (await openSession(d, projectId));
      if (!s || s.projectId !== projectId) throw validation("No hay una sesión abierta para cerrar.");
      if (s.kind === "first_review") {
        await completeFirstReview(d, s.id, p.text ?? "");
      } else {
        await completeSession(d, s.id, p.text);
      }
      return done(s.id, "Sesión cerrada.");
    }
    case "evaluate_cycle": {
      const rel = await ensureRelation(d, projectId);
      const goals = await d.repo.mentorshipGoals.list({ relationId: rel.id });
      if (!goals.length) throw validation("Para evaluar el ciclo primero definan al menos un objetivo.");
      const previous = await d.repo.cycleEvaluations.list({ relationId: rel.id });
      const isMentor = d.actor.id === rel.mentorId;
      const feedback = p.text ?? "";
      await recordCycleEvaluation(d, {
        relationId: rel.id,
        cycleNumber: previous.length + 1,
        goalEvaluations: goals.slice(0, 20).map((g) => ({
          goalId: g.id,
          goalTitle: g.title.slice(0, 200),
          baseline: g.baseline.slice(0, 2000),
          targetResult: g.targetResult.slice(0, 2000),
          actualResult: (p.learnings ?? feedback).slice(0, 2000),
          status: g.status as GoalStatus,
          evidenceNotes: "",
        })),
        autonomyAssessment: { rating: oneOf(p.autonomy, ["nascent", "developing", "autonomous"] as const, "developing"), observations: feedback.slice(0, 2000) },
        mentorFeedback: isMentor ? feedback.slice(0, 4000) : "",
        entrepreneurFeedback: isMentor ? undefined : feedback.slice(0, 4000),
        decision: oneOf(p.decision, ["renew", "close", "new_stage"] as const, "renew"),
        nextCycleFocus: p.nextCycleFocus?.slice(0, 2000),
      });
      return done(rel.id, "Evaluación del ciclo registrada.");
    }
  }
}

async function pickHypothesis(d: ServiceDeps, projectId: string, id: string | undefined, statuses: Hypothesis["status"][]) {
  if (id) {
    const h = await d.repo.hypotheses.get(id);
    if (!h || h.projectId !== projectId) throw notFound("Esa hipótesis no pertenece a este proyecto.");
    return h;
  }
  const h = (await d.repo.hypotheses.list({ projectId }))
    .filter((x) => statuses.includes(x.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!h) throw validation("No encontré una hipótesis en el estado que necesita este paso.");
  return h;
}

async function pickExperiment(d: ServiceDeps, projectId: string, id: string | undefined, statuses: string[]) {
  if (id) {
    const e = await d.repo.experiments.get(id);
    if (!e || e.projectId !== projectId) throw notFound("Ese experimento no pertenece a este proyecto.");
    return e;
  }
  const e = (await d.repo.experiments.list({ projectId }))
    .filter((x) => statuses.includes(x.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!e) throw validation("No encontré un experimento en el estado que necesita este paso.");
  return e;
}
