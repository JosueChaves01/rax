"use client";

import { useMemo, useState } from "react";
import type {
  ActionType,
  DelayCauseCategory,
  MentorshipGoal,
  MilestoneStatus,
  RoadmapMilestone,
  Task,
  TaskStatus,
} from "@/types/domain";
import {
  createMilestoneAction,
  createTasksBatchAction,
  createTaskAction,
  deleteMilestoneAction,
  diagnoseTaskDelayAction,
  setTaskStatusAction,
  suggestExperimentTasksAction,
  updateMilestoneStatusAction,
} from "@/app/actions";
import {
  ACTION_TYPE_LABEL,
  DELAY_CAUSE_LABEL,
  MILESTONE_STATUS_LABEL,
  TASK_STATUS_LABEL,
} from "@/features/labels";
import {
  Button,
  Card,
  Empty,
  Field,
  Meter,
  Notice,
  Tag,
  formatDate,
  inputClass,
} from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import type { SuggestedTask } from "@/lib/ai/schema";
import { AgentFieldAssist } from "@/shared/ui/agent-field-assist";

const COLUMNS: TaskStatus[] = ["todo", "doing", "blocked", "done"];

const ACTION_TYPE_COLOR: Record<ActionType, string> = {
  operational_task: "#94a3b8",
  skill_learning: "#818cf8",
  business_decision: "#f59e0b",
  conversation_third_party: "#38bdf8",
  financial_review: "#34d399",
  mentor_intervention: "#c084fc",
  experiment: "#22d3ee",
  research: "#2dd4bf",
  expert_referral: "#fb7185",
};

const MILESTONE_STATUS_COLOR: Record<MilestoneStatus, string> = {
  pending: "#94a3b8",
  in_progress: "#38bdf8",
  achieved: "#34d399",
  deferred: "#f59e0b",
};

export function TaskBoard({
  projectId,
  tasks,
  milestones = [],
  goals = [],
  experiments = [],
  people,
  canManage,
  canManageRoadmap = false,
  canDiagnoseDelay = false,
}: {
  projectId: string;
  tasks: Task[];
  milestones?: RoadmapMilestone[];
  goals?: MentorshipGoal[];
  experiments?: Array<{ id: string; question: string }>;
  people: Record<string, { name: string }>;
  canManage: boolean;
  canManageRoadmap?: boolean;
  canDiagnoseDelay?: boolean;
}) {
  // Formulario de nueva tarea / acción multimodal
  const [title, setTitle] = useState("");
  const [actionType, setActionType] = useState<ActionType>("operational_task");
  const [milestoneId, setMilestoneId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [exp, setExp] = useState("");
  const [due, setDue] = useState("");

  // Filtros de visualización
  const [filterMilestone, setFilterMilestone] = useState<string>("all");
  const [filterActionType, setFilterActionType] = useState<string>("all");

  // Formulario de nuevo hito
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDescription, setMilestoneDescription] = useState("");
  const [milestoneTargetDate, setMilestoneTargetDate] = useState("");
  const [milestoneGoalId, setMilestoneGoalId] = useState("");

  // Modal de diagnóstico no punitivo de demoras
  const [diagnoseTask, setDiagnoseTask] = useState<Task | null>(null);
  const [causeCategory, setCauseCategory] = useState<DelayCauseCategory>("clarity");
  const [causeDetail, setCauseDetail] = useState("");

  // Asistente IA para experimentos
  const [isAiTasksLoading, setIsAiTasksLoading] = useState(false);
  const [aiTasksError, setAiTasksError] = useState<string | null>(null);
  const [suggestedTasks, setSuggestedTasks] = useState<SuggestedTask[] | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [tasksRationale, setTasksRationale] = useState<string | null>(null);

  const { run, pending, error } = useAction();

  // Filtrado de tareas
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterMilestone !== "all" && t.milestoneId !== filterMilestone) return false;
      if (filterActionType !== "all" && (t.actionType ?? "operational_task") !== filterActionType) return false;
      return true;
    });
  }, [tasks, filterMilestone, filterActionType]);

  // Conteo de tareas por hito
  const milestoneProgress = useMemo(() => {
    const map: Record<string, { total: number; done: number }> = {};
    for (const m of milestones) {
      map[m.id] = { total: 0, done: 0 };
    }
    for (const t of tasks) {
      if (t.milestoneId && map[t.milestoneId]) {
        map[t.milestoneId].total += 1;
        if (t.status === "done") map[t.milestoneId].done += 1;
      }
    }
    return map;
  }, [milestones, tasks]);

  // Handlers de Hitos
  const handleCreateMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () =>
        createMilestoneAction(projectId, {
          title: milestoneTitle,
          description: milestoneDescription || undefined,
          targetDate: milestoneTargetDate || undefined,
          goalId: milestoneGoalId || undefined,
        }),
      () => {
        setShowMilestoneForm(false);
        setMilestoneTitle("");
        setMilestoneDescription("");
        setMilestoneTargetDate("");
        setMilestoneGoalId("");
      },
    );
  };

  const handleUpdateMilestoneStatus = (id: string, status: MilestoneStatus) => {
    run(() => updateMilestoneStatusAction(projectId, id, status));
  };

  const handleDeleteMilestone = (id: string) => {
    if (confirm("¿Seguro de que querés eliminar este hito? Las tareas asociadas se conservarán.")) {
      run(() => deleteMilestoneAction(projectId, id));
    }
  };

  // Handlers de Tareas
  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () =>
        createTaskAction(projectId, {
          title,
          actionType,
          milestoneId: milestoneId || undefined,
          goalId: goalId || undefined,
          experimentId: actionType === "experiment" ? exp || undefined : undefined,
          dueDate: due || undefined,
        }),
      () => {
        setTitle("");
        setDue("");
      },
    );
  };

  // Handler de Diagnóstico de Demoras (no punitivo)
  const handleSubmitDelayDiagnosis = (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagnoseTask) return;
    run(
      () =>
        diagnoseTaskDelayAction(projectId, diagnoseTask.id, {
          causeCategory,
          detail: causeDetail,
        }),
      () => {
        setDiagnoseTask(null);
        setCauseDetail("");
      },
    );
  };

  // Handler de IA para experimentos
  const handleSuggestTasks = async () => {
    if (!exp) return;
    setIsAiTasksLoading(true);
    setAiTasksError(null);
    try {
      const res = await suggestExperimentTasksAction(projectId, exp);
      if (res.ok && res.data) {
        setSuggestedTasks(res.data.tasks);
        setSelectedIndices(new Set(res.data.tasks.map((_, i) => i)));
        setTasksRationale(res.data.rationale ?? null);
      } else if (!res.ok) {
        setAiTasksError(res.error);
      }
    } catch {
      setAiTasksError("No se pudo conectar con el asistente de IA para tareas.");
    } finally {
      setIsAiTasksLoading(false);
    }
  };

  const handleAddSelectedTasks = () => {
    if (!suggestedTasks || !exp) return;
    const items = suggestedTasks
      .filter((_, idx) => selectedIndices.has(idx))
      .map((t) => ({
        title: t.title,
        actionType: "experiment" as ActionType,
        experimentId: exp,
        milestoneId: milestoneId || undefined,
        goalId: goalId || undefined,
      }));
    if (items.length === 0) return;
    run(
      () => createTasksBatchAction(projectId, items),
      () => {
        setSuggestedTasks(null);
        setSelectedIndices(new Set());
      },
    );
  };

  return (
    <div className="space-y-8">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* 1. SECCIÓN DE HITOS ESTRATÉGICOS (HOJA DE RUTA)              */}
      {/* ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="roadmap-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
          <div>
            <h3 id="roadmap-heading" className="text-lg font-semibold text-ink">
              Hitos de la hoja de ruta
            </h3>
            <p className="text-xs text-muted">
              Puntos de control verificables que ordenan las acciones del proyecto y dan trazabilidad al progreso.
            </p>
          </div>
          {canManageRoadmap && (
            <Button
              size="sm"
              variant={showMilestoneForm ? "ghost" : "secondary"}
              onClick={() => setShowMilestoneForm((v) => !v)}
            >
              {showMilestoneForm ? "Cancelar nuevo hito" : "+ Nuevo hito"}
            </Button>
          )}
        </div>

        {/* Formulario para crear nuevo hito */}
        {showMilestoneForm && (
          <Card className="p-4">
            <form onSubmit={handleCreateMilestone} className="space-y-4">
              <h4 className="text-sm font-semibold text-ink">Crear nuevo hito estratégico</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="ms-title" label="Título del hito">
                  <input
                    id="ms-title"
                    className={inputClass}
                    placeholder="Ej. Validación de problema con 10 clientes potenciales"
                    value={milestoneTitle}
                    onChange={(e) => setMilestoneTitle(e.target.value)}
                    required
                    minLength={3}
                    maxLength={200}
                  />
                </Field>
                <Field id="ms-due" label="Fecha estimada (opcional)">
                  <input
                    id="ms-due"
                    type="date"
                    className={inputClass}
                    value={milestoneTargetDate}
                    onChange={(e) => setMilestoneTargetDate(e.target.value)}
                  />
                </Field>
              </div>

              {goals.length > 0 && (
                <Field id="ms-goal" label="Vincular a objetivo de mentoría (opcional)">
                  <select
                    id="ms-goal"
                    className={inputClass}
                    value={milestoneGoalId}
                    onChange={(e) => setMilestoneGoalId(e.target.value)}
                  >
                    <option value="">Sin objetivo vinculado</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field id="ms-desc" label="Criterio de cumplimiento / Descripción (opcional)">
                <textarea
                  id="ms-desc"
                  rows={2}
                  className={inputClass}
                  placeholder="¿Qué evidencia concreta o hecho observable demostrará que este hito está cumplido?"
                  value={milestoneDescription}
                  onChange={(e) => setMilestoneDescription(e.target.value)}
                  maxLength={2000}
                />
              </Field>

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" type="button" onClick={() => setShowMilestoneForm(false)}>
                  Cancelar
                </Button>
                <Button size="sm" variant="primary" type="submit" disabled={pending || milestoneTitle.trim().length < 3}>
                  {pending ? "Guardando..." : "Guardar hito"}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Lista de hitos existentes */}
        {milestones.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">
            Todavía no hay hitos estratégicos definidos. Los hitos permiten agrupar tareas operativas, decisiones y experimentos en etapas claras.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {milestones.map((m) => {
              const prog = milestoneProgress[m.id] ?? { total: 0, done: 0 };
              const linkedGoal = goals.find((g) => g.id === m.goalId);
              return (
                <div
                  key={m.id}
                  className="flex flex-col justify-between rounded-xl border border-line bg-panel p-4 text-sm transition-colors"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Tag color={MILESTONE_STATUS_COLOR[m.status]}>
                        {MILESTONE_STATUS_LABEL[m.status]}
                      </Tag>
                      {m.targetDate && (
                        <span className="text-[0.6875rem] text-faint">
                          Vence: {formatDate(m.targetDate)}
                        </span>
                      )}
                    </div>
                    <h4 className="font-medium text-ink leading-snug">{m.title}</h4>
                    {m.description && (
                      <p className="text-xs text-muted line-clamp-2">{m.description}</p>
                    )}
                    {linkedGoal && (
                      <div className="text-[0.6875rem] text-muted">
                        <span className="font-semibold text-faint">Objetivo:</span> {linkedGoal.title}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 space-y-2 pt-2 border-t border-line/60">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>Progreso de acciones</span>
                      <span className="font-mono">{prog.done}/{prog.total}</span>
                    </div>
                    <Meter value={prog.done} total={prog.total || 1} label={`Progreso de ${m.title}`} />

                    {canManageRoadmap && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <select
                          className={`${inputClass} py-0.5 text-[0.6875rem]`}
                          value={m.status}
                          disabled={pending}
                          onChange={(e) => handleUpdateMilestoneStatus(m.id, e.target.value as MilestoneStatus)}
                        >
                          <option value="pending">Pendiente</option>
                          <option value="in_progress">En curso</option>
                          <option value="achieved">Alcanzado</option>
                          <option value="deferred">Postergado</option>
                        </select>
                        <button
                          type="button"
                          className="text-[0.6875rem] text-faint hover:text-red-500"
                          onClick={() => handleDeleteMilestone(m.id)}
                          title="Eliminar hito"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 2. CREACIÓN DE ACCIONES MULTIMODALES                          */}
      {/* ───────────────────────────────────────────────────────────── */}
      {canManage && (
        <section aria-labelledby="new-action-heading" className="space-y-3">
          <form
            className="grid gap-3 rounded-2xl border border-line bg-panel p-4 md:grid-cols-[1.5fr_1fr_1fr_auto]"
            onSubmit={handleCreateTask}
          >
            <div className="md:col-span-4">
              <h3 id="new-action-heading" className="text-sm font-semibold text-ink">
                Registrar acción o tarea multimodal
              </h3>
              <p className="text-xs text-muted">
                Principio RAX 2.3: No todo problema necesita un experimento. Podés crear tareas operativas, decisiones estratégicas, aprendizajes o derivaciones.
              </p>
            </div>

            <Field id="t-title" label="Título de la acción">
              <input
                id="t-title"
                className={inputClass}
                placeholder="Ej. Revisar estructura de costos fijos o Entrevistar a 3 proveedores"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                required
              />
              <AgentFieldAssist projectId={projectId} flowId="RAX-08" stage="prioritizing" section="Plan de acción" fieldPath="task.title" fieldSchema={{ type: "string", label: "Título de la acción", required: true, maxLength: 200 }} currentValue={title} onApply={setTitle} />
            </Field>

            <Field id="t-type" label="Tipo de acción">
              <select
                id="t-type"
                className={inputClass}
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ActionType)}
              >
                {(Object.keys(ACTION_TYPE_LABEL) as ActionType[]).map((type) => (
                  <option key={type} value={type}>
                    {ACTION_TYPE_LABEL[type]}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="t-milestone" label="Hito asociado (opcional)">
              <select
                id="t-milestone"
                className={inputClass}
                value={milestoneId}
                onChange={(e) => setMilestoneId(e.target.value)}
              >
                <option value="">Sin hito específico</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex items-end">
              <Button variant="primary" type="submit" disabled={pending} className="w-full">
                Agregar acción
              </Button>
            </div>

            {/* Fila secundaria de relaciones */}
            <div className="grid gap-3 md:col-span-4 sm:grid-cols-3">
              {goals.length > 0 && (
                <Field id="t-goal" label="Objetivo de mentoría">
                  <select
                    id="t-goal"
                    className={inputClass}
                    value={goalId}
                    onChange={(e) => setGoalId(e.target.value)}
                  >
                    <option value="">Sin objetivo vinculado</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {actionType === "experiment" && experiments.length > 0 && (
                <Field id="t-exp" label="Experimento empírico">
                  <select
                    id="t-exp"
                    className={inputClass}
                    value={exp}
                    onChange={(e) => {
                      setExp(e.target.value);
                      setSuggestedTasks(null);
                    }}
                  >
                    <option value="">Seleccionar experimento</option>
                    {experiments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.question.slice(0, 60)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <Field id="t-due" label="Fecha límite (opcional)">
                <input
                  id="t-due"
                  type="date"
                  className={inputClass}
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
              </Field>
            </div>

            {error && (
              <div className="md:col-span-4">
                <Notice tone="error">{error}</Notice>
              </div>
            )}
          </form>
        </section>
      )}

      {/* Asistente IA para sugerir tareas cuando se selecciona un experimento */}
      {canManage && exp && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-panel/60 p-4">
          <div>
            <p className="text-sm font-medium">Asistente metodológico de tareas para el experimento</p>
            <p className="text-xs text-muted">
              Generá tareas operativas secuenciales a partir del método, participantes y actividades definidas en la tarjeta de prueba.
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            type="button"
            disabled={isAiTasksLoading || pending}
            onClick={handleSuggestTasks}
          >
            {isAiTasksLoading ? "✨ Generando tareas..." : "✨ Generar tareas con IA para este experimento"}
          </Button>
        </div>
      )}

      {suggestedTasks && (
        <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cyan">
              ✨ Tareas sugeridas para el experimento seleccionado ({selectedIndices.size}/{suggestedTasks.length})
            </p>
            <button
              type="button"
              className="text-xs text-faint hover:text-ink"
              onClick={() => setSuggestedTasks(null)}
            >
              Descartar
            </button>
          </div>
          {tasksRationale && <p className="text-xs text-muted">{tasksRationale}</p>}
          <ul className="space-y-2">
            {suggestedTasks.map((st, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  id={`tb-st-${idx}`}
                  className="mt-1 accent-[var(--color-accent)]"
                  checked={selectedIndices.has(idx)}
                  onChange={(ev) => {
                    const next = new Set(selectedIndices);
                    if (ev.target.checked) next.add(idx);
                    else next.delete(idx);
                    setSelectedIndices(next);
                  }}
                />
                <label htmlFor={`tb-st-${idx}`} className="flex-1 cursor-pointer">
                  {st.title}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-line">
            <Button
              size="sm"
              variant="primary"
              type="button"
              disabled={selectedIndices.size === 0 || pending}
              onClick={handleAddSelectedTasks}
            >
              {pending ? "Agregando..." : `Agregar ${selectedIndices.size} ${selectedIndices.size === 1 ? "tarea" : "tareas"}`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                if (selectedIndices.size === suggestedTasks.length) {
                  setSelectedIndices(new Set());
                } else {
                  setSelectedIndices(new Set(suggestedTasks.map((_, i) => i)));
                }
              }}
            >
              {selectedIndices.size === suggestedTasks.length ? "Deseleccionar todas" : "Seleccionar todas"}
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setSuggestedTasks(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {aiTasksError && <Notice tone="error">{aiTasksError}</Notice>}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 3. TABLERO DE EJECUCIÓN (KANBAN / LISTADO)                   */}
      {/* ───────────────────────────────────────────────────────────── */}
      <section aria-labelledby="kanban-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="kanban-heading" className="text-lg font-semibold text-ink">
            Tablero de ejecución ({filteredTasks.length} {filteredTasks.length === 1 ? "acción" : "acciones"})
          </h3>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {milestones.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-muted">Hito:</span>
                <select
                  className={`${inputClass} py-1 text-xs`}
                  value={filterMilestone}
                  onChange={(e) => setFilterMilestone(e.target.value)}
                >
                  <option value="all">Todos los hitos</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-1">
              <span className="text-muted">Tipo:</span>
              <select
                className={`${inputClass} py-1 text-xs`}
                value={filterActionType}
                onChange={(e) => setFilterActionType(e.target.value)}
              >
                <option value="all">Todas las modalidades</option>
                {(Object.keys(ACTION_TYPE_LABEL) as ActionType[]).map((t) => (
                  <option key={t} value={t}>
                    {ACTION_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {tasks.length === 0 ? (
          <Empty title="Sin acciones ni tareas">
            Las acciones multimodales guían la ejecución entre sesiones de mentoría. Creá la primera para comenzar a avanzar hacia los hitos acordados.
          </Empty>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-xl border border-line bg-panel/40 p-8 text-center text-sm text-muted">
            No hay acciones que coincidan con los filtros seleccionados.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((c) => {
              const colTasks = filteredTasks.filter((t) => t.status === c);
              return (
                <section key={c} aria-labelledby={`col-${c}`} className="rounded-2xl border border-line bg-panel/60 p-3 flex flex-col">
                  <h3 id={`col-${c}`} className="eyebrow mb-3 px-1 flex items-center justify-between">
                    <span>{TASK_STATUS_LABEL[c]}</span>
                    <span className="font-mono text-faint">{colTasks.length}</span>
                  </h3>

                  <ul className="space-y-3 flex-1">
                    {colTasks.map((t) => {
                      const effectiveType = t.actionType ?? (t.experimentId ? "experiment" : "operational_task");
                      const milestone = milestones.find((m) => m.id === t.milestoneId);
                      const goal = goals.find((g) => g.id === t.goalId);

                      return (
                        <li key={t.id} className="rounded-xl border border-line bg-bg p-3 text-sm space-y-2">
                          {/* Etiquetas de tipo y contexto */}
                          <div className="flex flex-wrap items-center gap-1">
                            <Tag color={ACTION_TYPE_COLOR[effectiveType]}>
                              {ACTION_TYPE_LABEL[effectiveType]}
                            </Tag>
                            {milestone && (
                              <span className="text-[0.625rem] text-faint bg-panel px-1.5 py-0.5 rounded border border-line">
                                📍 {milestone.title.slice(0, 20)}
                              </span>
                            )}
                          </div>

                          {/* Título */}
                          <p className={`font-medium leading-snug ${t.status === "done" ? "text-muted line-through" : "text-ink"}`}>
                            {t.title}
                          </p>

                          {/* Metadatos */}
                          <p className="text-[0.6875rem] text-faint">
                            {people[t.assigneeId]?.name ?? "Sin asignar"}
                            {t.dueDate && ` · vence ${formatDate(t.dueDate)}`}
                            {goal && ` · ${goal.title.slice(0, 24)}...`}
                          </p>

                          {/* Motivo de bloqueo si existe */}
                          {t.blockedReason && (
                            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-600 dark:text-amber-400">
                              <span className="font-semibold">Bloqueo informado:</span> {t.blockedReason}
                            </div>
                          )}

                          {/* Diagnóstico no punitivo de causa de demora */}
                          {t.delayHypothesis && (
                            <div className="rounded-lg border border-cyan/20 bg-cyan/5 p-2 text-xs text-cyan">
                              <p className="font-semibold text-[0.6875rem] uppercase tracking-wider">
                                Hipótesis explicativa de demora
                              </p>
                              <p className="mt-0.5 text-muted">
                                <strong>{DELAY_CAUSE_LABEL[t.delayHypothesis.causeCategory]}:</strong> {t.delayHypothesis.detail}
                              </p>
                            </div>
                          )}

                          {/* Acciones y control de estado */}
                          <div className="pt-2 border-t border-line/60 flex flex-wrap items-center justify-between gap-2">
                            {canManage && (
                              <select
                                id={`ts-${t.id}`}
                                className={`${inputClass} py-0.5 text-xs max-w-[120px]`}
                                value={t.status}
                                disabled={pending}
                                onChange={(e) => run(() => setTaskStatusAction(projectId, t.id, e.target.value as TaskStatus))}
                              >
                                {COLUMNS.map((s) => (
                                  <option key={s} value={s}>
                                    {TASK_STATUS_LABEL[s]}
                                  </option>
                                ))}
                              </select>
                            )}

                            {(canDiagnoseDelay || canManage) && (
                              <button
                                type="button"
                                className="text-[0.6875rem] text-faint hover:text-cyan underline underline-offset-2"
                                onClick={() => {
                                  setDiagnoseTask(t);
                                  setCauseCategory(t.delayHypothesis?.causeCategory ?? "clarity");
                                  setCauseDetail(t.delayHypothesis?.detail ?? "");
                                }}
                              >
                                {t.delayHypothesis ? "Editar causa" : "Diagnosticar causa"}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </section>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 4. MODAL DE DIAGNÓSTICO NO PUNITIVO DE DEMORAS               */}
      {/* ───────────────────────────────────────────────────────────── */}
      {diagnoseTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 space-y-4">
            <div className="border-b border-line pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan">
                Accountability constructivo RAX
              </span>
              <h3 className="display text-xl text-ink">Diagnosticar causa de demora</h3>
              <p className="mt-1 text-xs text-muted">
                Un retraso no es una falla personal ni una oportunidad de sanción. Es una hipótesis sobre dificultades reales (claridad, tiempo, recursos, terceros) para que mentor y emprendedor acuerden el apoyo necesario.
              </p>
            </div>

            <div className="rounded-xl border border-line bg-panel p-3 text-sm">
              <span className="text-xs text-faint block">Tarea / Acción:</span>
              <p className="font-medium text-ink">{diagnoseTask.title}</p>
            </div>

            <form onSubmit={handleSubmitDelayDiagnosis} className="space-y-4">
              <Field id="diag-category" label="Categoría de causa explicativa">
                <select
                  id="diag-category"
                  className={inputClass}
                  value={causeCategory}
                  onChange={(e) => setCauseCategory(e.target.value as DelayCauseCategory)}
                >
                  {(Object.keys(DELAY_CAUSE_LABEL) as DelayCauseCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {DELAY_CAUSE_LABEL[cat]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                id="diag-detail"
                label="Detalle y necesidad de apoyo"
                hint="Describí qué factor impidió avanzar o qué intervención se necesita (recursos, aclaración, destrabe)."
              >
                <textarea
                  id="diag-detail"
                  rows={3}
                  className={inputClass}
                  placeholder="Ej. El proveedor no respondió a tiempo; se requiere que el mentor intervenga o buscar un sustituto."
                  value={causeDetail}
                  onChange={(e) => setCauseDetail(e.target.value)}
                  required
                  minLength={3}
                  maxLength={2000}
                />
              </Field>

              <div className="flex justify-end gap-2 pt-2 border-t border-line">
                <Button size="sm" variant="ghost" type="button" onClick={() => setDiagnoseTask(null)}>
                  Cancelar
                </Button>
                <Button size="sm" variant="primary" type="submit" disabled={pending || causeDetail.trim().length < 3}>
                  {pending ? "Guardando..." : "Registrar diagnóstico"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
