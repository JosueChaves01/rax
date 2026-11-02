"use client";

import { useState, useTransition } from "react";
import type { Workspace } from "@/lib/services/projects";
import type {
  AutonomyRating,
  CycleDecision,
  GoalStatus,
} from "@/types/domain";
import {
  AUTONOMY_RATING_LABEL,
  CYCLE_DECISION_LABEL,
  GOAL_KIND_LABEL,
  GOAL_STATUS_LABEL,
} from "@/features/labels";
import { recordCycleEvaluationAction } from "@/app/actions";
import {
  Button,
  Card,
  Empty,
  Field,
  Notice,
  Tag,
  formatDate,
  inputClass,
} from "@/shared/ui/primitives";

interface Props {
  projectId: string;
  workspace: Workspace;
}

export function CycleEvaluationView({ projectId, workspace }: Props) {
  const { mentorshipRelation, mentorshipGoals, cycleEvaluations, permissions } = workspace;
  const canEvaluate = permissions["cycle.evaluate"];

  const activeGoals = mentorshipGoals.filter((g) => g.status !== "discarded");
  const nextCycleNumber = (cycleEvaluations?.length ?? 0) + 1;

  // Estado del formulario de evaluación
  const [goalResults, setGoalResults] = useState<
    Record<
      string,
      {
        actualResult: string;
        status: GoalStatus;
        evidenceNotes: string;
      }
    >
  >(() => {
    const init: Record<string, { actualResult: string; status: GoalStatus; evidenceNotes: string }> = {};
    for (const g of activeGoals) {
      init[g.id] = {
        actualResult: g.status === "achieved" ? g.targetResult : "",
        status: g.status,
        evidenceNotes: "",
      };
    }
    return init;
  });

  const [autonomyRating, setAutonomyRating] = useState<AutonomyRating>("developing");
  const [autonomyObs, setAutonomyObs] = useState("");
  const [mentorFeedback, setMentorFeedback] = useState("");
  const [entrepreneurFeedback, setEntrepreneurFeedback] = useState("");
  const [decision, setDecision] = useState<CycleDecision>("renew");
  const [nextCycleFocus, setNextCycleFocus] = useState("");

  const [isPending, startTransition] = useTransition();
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  if (!mentorshipRelation) {
    return (
      <Empty title="Todavía no hay ciclo para cerrar">
        El cierre del ciclo se hace con un mentor asignado, después de la segunda revisión.
      </Empty>
    );
  }

  const handleSubmitEvaluation = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeGoals.length === 0) {
      setErrorNotice("Debe haber al menos un objetivo de mentoría para registrar una evaluación formal.");
      return;
    }
    if (!mentorFeedback.trim() || !autonomyObs.trim()) {
      setErrorNotice("Por favor completá las observaciones de autonomía y la retroalimentación del mentor.");
      return;
    }

    setErrorNotice(null);
    setStatusNotice(null);

    const goalEvaluations = activeGoals.map((g) => ({
      goalId: g.id,
      goalTitle: g.title,
      baseline: g.baseline,
      targetResult: g.targetResult,
      actualResult: goalResults[g.id]?.actualResult.trim() || "Sin resultado documentado",
      status: goalResults[g.id]?.status || g.status,
      evidenceNotes: goalResults[g.id]?.evidenceNotes.trim() || "",
    }));

    startTransition(async () => {
      const res = await recordCycleEvaluationAction(projectId, {
        relationId: mentorshipRelation.id,
        cycleNumber: nextCycleNumber,
        goalEvaluations,
        autonomyAssessment: {
          rating: autonomyRating,
          observations: autonomyObs.trim(),
        },
        mentorFeedback: mentorFeedback.trim(),
        entrepreneurFeedback: entrepreneurFeedback.trim() || undefined,
        decision,
        nextCycleFocus: nextCycleFocus.trim() || undefined,
      });

      if (res && !res.ok) {
        setErrorNotice(res.error);
      } else {
        setStatusNotice("Listo: el cierre del ciclo quedó registrado.");
      }
    });
  };

  return (
    <div>
      <div>
        <p className="eyebrow">Etapa 4 · Decidir</p>
        <h2 className="display mt-2 text-4xl">
          Cierre <span className="text-highlight">del ciclo.</span>
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          {canEvaluate
            ? "Compará cada objetivo con su línea base, valorá la autonomía y decidí si el acompañamiento se renueva con un nuevo ciclo o se cierra."
            : "Al final del ciclo tu mentor compara cada objetivo con su línea base y decide con vos si se renueva o se cierra. Acá queda el historial."}
        </p>
      </div>

      {statusNotice && (
        <div className="mt-6">
          <Notice tone="success">{statusNotice}</Notice>
        </div>
      )}
      {errorNotice && (
        <div className="mt-6">
          <Notice tone="error">{errorNotice}</Notice>
        </div>
      )}

      {/* Formulario de Evaluación Formal del Ciclo */}
      {canEvaluate && mentorshipRelation.stage !== "closed" && (
        <section aria-label="Formulario de evaluación" className="mt-10">
          <Card className="p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="display text-2xl">Consolidar evaluación del Ciclo #{nextCycleNumber}</h2>
                <p className="text-xs text-muted">
                  Compara cada objetivo contra su línea base original documentada al inicio.
                </p>
              </div>
              <span className="rounded-full bg-accent/10 px-3 py-1 font-mono text-xs text-accent">
                Ciclo #{nextCycleNumber}
              </span>
            </div>

            <form onSubmit={handleSubmitEvaluation} className="mt-8 space-y-8">
              {/* Lista de objetivos y comparativa */}
              <div className="space-y-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  1. Comparativa de Objetivos (Línea Base vs. Resultado Observado)
                </h3>

                {activeGoals.length === 0 ? (
                  <p className="text-sm text-muted">No hay objetivos definidos en este ciclo.</p>
                ) : (
                  activeGoals.map((g) => (
                    <div key={g.id} className="rounded-xl border border-slate-300 bg-slate-50 p-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-900">{g.title}</span>
                        <Tag>{GOAL_KIND_LABEL[g.kind]}</Tag>
                      </div>

                      {/* Línea Base vs Resultado Esperado */}
                      <div className="grid gap-4 sm:grid-cols-2 text-xs">
                        <div className="rounded-lg bg-white p-3 border border-slate-200">
                          <span className="block font-semibold text-muted uppercase tracking-wider text-[0.6875rem]">
                            Línea Base Inicial (Inmutable)
                          </span>
                          <p className="mt-1 text-slate-900">{g.baseline}</p>
                        </div>
                        <div className="rounded-lg bg-white p-3 border border-slate-200">
                          <span className="block font-semibold text-blue-700 uppercase tracking-wider text-[0.6875rem]">
                            Resultado Esperado
                          </span>
                          <p className="mt-1 text-slate-900">{g.targetResult}</p>
                        </div>
                      </div>

                      {/* Entradas del resultado observado */}
                      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1">
                            Resultado comprobado o alcanzado en la realidad:
                          </label>
                          <input
                            type="text"
                            className={inputClass}
                            placeholder="Ej. Costo cerrado a $0.75 por unidad con proveedor local"
                            value={goalResults[g.id]?.actualResult ?? ""}
                            onChange={(e) =>
                              setGoalResults((prev) => ({
                                ...prev,
                                [g.id]: {
                                  actualResult: e.target.value,
                                  status: prev[g.id]?.status ?? g.status,
                                  evidenceNotes: prev[g.id]?.evidenceNotes ?? "",
                                },
                              }))
                            }
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-muted mb-1">
                            Calificación del objetivo:
                          </label>
                          <select
                            className={inputClass}
                            value={goalResults[g.id]?.status ?? g.status}
                            onChange={(e) =>
                              setGoalResults((prev) => ({
                                ...prev,
                                [g.id]: {
                                  actualResult: prev[g.id]?.actualResult ?? "",
                                  status: e.target.value as GoalStatus,
                                  evidenceNotes: prev[g.id]?.evidenceNotes ?? "",
                                },
                              }))
                            }
                          >
                            <option value="achieved">{GOAL_STATUS_LABEL.achieved}</option>
                            <option value="partially_achieved">{GOAL_STATUS_LABEL.partially_achieved}</option>
                            <option value="deferred">{GOAL_STATUS_LABEL.deferred}</option>
                            <option value="active">{GOAL_STATUS_LABEL.active}</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-faint mb-1">
                          Evidencias o notas de respaldo:
                        </label>
                        <input
                          type="text"
                          className={inputClass}
                          placeholder="Notas o vínculos de respaldo que demuestran el resultado"
                          value={goalResults[g.id]?.evidenceNotes ?? ""}
                          onChange={(e) =>
                            setGoalResults((prev) => ({
                              ...prev,
                              [g.id]: {
                                actualResult: prev[g.id]?.actualResult ?? "",
                                status: prev[g.id]?.status ?? g.status,
                                evidenceNotes: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Evaluación de Crecimiento en Autonomía */}
              <div className="space-y-4 pt-6 border-t border-slate-200">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  2. Evaluación de Autonomía y Aprendizaje
                </h3>

                <Field id="autonomy-rating" label="Nivel de autonomía alcanzado por el emprendedor">
                  <select
                    id="autonomy-rating"
                    className={inputClass}
                    value={autonomyRating}
                    onChange={(e) => setAutonomyRating(e.target.value as AutonomyRating)}
                  >
                    {(Object.keys(AUTONOMY_RATING_LABEL) as AutonomyRating[]).map((r) => (
                      <option key={r} value={r}>
                        {AUTONOMY_RATING_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  id="autonomy-obs"
                  label="Observaciones sobre toma de decisiones y resolución de problemas"
                >
                  <textarea
                    id="autonomy-obs"
                    rows={3}
                    className={inputClass}
                    placeholder="¿Cómo evolucionó la capacidad del emprendedor para resolver problemas por sí mismo sin depender del mentor?"
                    value={autonomyObs}
                    onChange={(e) => setAutonomyObs(e.target.value)}
                    required
                  />
                </Field>
              </div>

              {/* Retroalimentación cualitativa */}
              <div className="space-y-4 pt-6 border-t border-slate-200">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  3. Retroalimentación Cualitativa y Síntesis
                </h3>

                <Field id="mentor-feedback" label="Feedback del Mentor">
                  <textarea
                    id="mentor-feedback"
                    rows={4}
                    className={inputClass}
                    placeholder="Fortalezas demostradas, áreas de desarrollo y recomendaciones para el futuro del negocio..."
                    value={mentorFeedback}
                    onChange={(e) => setMentorFeedback(e.target.value)}
                    required
                  />
                </Field>

                <Field id="ent-feedback" label="Comentarios o feedback del Emprendedor (Opcional)">
                  <textarea
                    id="ent-feedback"
                    rows={2}
                    className={inputClass}
                    placeholder="Percepción del emprendedor sobre el valor del acompañamiento..."
                    value={entrepreneurFeedback}
                    onChange={(e) => setEntrepreneurFeedback(e.target.value)}
                  />
                </Field>
              </div>

              {/* Decisión de ciclo */}
              <div className="space-y-4 pt-6 border-t border-slate-200">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  4. Decisión del Ciclo (Continuidad o Cierre)
                </h3>

                <Field id="cycle-decision" label="Acuerdo sobre el siguiente paso">
                  <select
                    id="cycle-decision"
                    className={inputClass}
                    value={decision}
                    onChange={(e) => setDecision(e.target.value as CycleDecision)}
                  >
                    {(Object.keys(CYCLE_DECISION_LABEL) as CycleDecision[]).map((d) => (
                      <option key={d} value={d}>
                        {CYCLE_DECISION_LABEL[d]}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id="cycle-focus" label="Foco del nuevo ciclo o reflexión de cierre">
                  <input
                    id="cycle-focus"
                    className={inputClass}
                    placeholder="Ej. Foco Ciclo 2: Apertura de canal comercial mayorista y acuerdos de distribución"
                    value={nextCycleFocus}
                    onChange={(e) => setNextCycleFocus(e.target.value)}
                  />
                </Field>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <Button type="submit" variant="primary" size="md" disabled={isPending}>
                  {isPending ? "Consolidando..." : "Consolidar evaluación formal del ciclo"}
                </Button>
              </div>
            </form>
          </Card>
        </section>
      )}

      {/* Historial Inmutable de Ciclos Evaluados */}
      <section aria-label="Historial de evaluaciones" className="mt-14">
        <h2 className="display text-2xl">Ciclos anteriores</h2>
        <p className="text-sm text-muted">
          Registro permanente de evaluaciones anteriores. Ningún dato ni decisión acordada se elimina.
        </p>

        {(!cycleEvaluations || cycleEvaluations.length === 0) ? (
          <div className="mt-6">
            <Empty title="Sin evaluaciones previas">
              Todavía no se ha registrado ninguna evaluación formal de ciclo para este proyecto.
            </Empty>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {cycleEvaluations.map((ev) => (
              <Card key={ev.id} className="p-6 space-y-6 border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-lg text-slate-900">Ciclo #{ev.cycleNumber}</span>
                    <Tag color="var(--color-cyan)">{CYCLE_DECISION_LABEL[ev.decision]}</Tag>
                  </div>
                  <span className="font-mono text-xs text-faint">
                    Evaluado el {formatDate(ev.evaluatedAt)}
                  </span>
                </div>

                {/* Resumen de objetivos */}
                <div>
                  <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                    Objetivos Evaluados:
                  </h4>
                  <div className="space-y-3">
                    {ev.goalEvaluations.map((ge, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">{ge.goalTitle}</span>
                          <Tag>{GOAL_STATUS_LABEL[ge.status]}</Tag>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 text-faint">
                          <div>
                            <span className="font-semibold text-muted">Línea base: </span>
                            {ge.baseline}
                          </div>
                          <div>
                            <span className="font-semibold text-blue-700">Resultado esperado: </span>
                            {ge.targetResult}
                          </div>
                        </div>
                        <div className="pt-1 text-slate-900">
                          <span className="font-semibold text-ok">Resultado comprobado: </span>
                          {ge.actualResult}
                        </div>
                        {ge.evidenceNotes && (
                          <div className="text-faint text-[0.6875rem]">
                            <span className="font-semibold">Evidencia: </span>
                            {ge.evidenceNotes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Autonomía y Feedback */}
                <div className="grid gap-4 sm:grid-cols-2 text-xs">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <span className="font-semibold text-muted uppercase text-[0.6875rem]">
                      Nivel de Autonomía
                    </span>
                    <p className="mt-1 font-semibold text-slate-900">
                      {AUTONOMY_RATING_LABEL[ev.autonomyAssessment.rating]}
                    </p>
                    <p className="mt-2 text-muted">{ev.autonomyAssessment.observations}</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <span className="font-semibold text-muted uppercase text-[0.6875rem]">
                      Feedback del Mentor
                    </span>
                    <p className="mt-2 text-slate-900 whitespace-pre-wrap">{ev.mentorFeedback}</p>
                    {ev.entrepreneurFeedback && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <span className="font-semibold text-muted uppercase text-[0.6875rem]">
                          Feedback del Emprendedor
                        </span>
                        <p className="mt-1 text-muted">{ev.entrepreneurFeedback}</p>
                      </div>
                    )}
                  </div>
                </div>

                {ev.nextCycleFocus && (
                  <div className="rounded-xl bg-accent/5 border border-accent/20 p-3 text-xs">
                    <span className="font-semibold text-accent">Foco acordado: </span>
                    <span className="text-slate-900">{ev.nextCycleFocus}</span>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
