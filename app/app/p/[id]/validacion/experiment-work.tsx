"use client";

import { useState } from "react";
import type { Experiment, Task, TaskStatus } from "@/types/domain";
import { createTasksBatchAction, createTaskAction, setTaskStatusAction, suggestExperimentTasksAction } from "@/app/actions";
import { TASK_STATUS_LABEL } from "@/features/labels";
import { Button, Notice, cx, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import { EvidenceForm } from "../historial/evidence-form";
import type { SuggestedTask } from "@/lib/ai/schema";

const STATUSES: TaskStatus[] = ["todo", "doing", "blocked", "done"];

/**
 * Tareas y evidencia dentro de la tarjeta del experimento, para no salir a otras secciones
 * mientras se ejecuta. La evidencia nueva queda disponible para adjuntarla al registrar el resultado.
 */
export function ExperimentWork({
  projectId,
  e,
  tasks,
  attached,
  projectEvidence,
  canManageTasks,
  canAddEvidence,
}: {
  projectId: string;
  e: Experiment;
  tasks: Task[];
  attached: Array<{ id: string; title: string }>;
  projectEvidence: number;
  canManageTasks: boolean;
  canAddEvidence: boolean;
}) {
  const [title, setTitle] = useState("");
  const [addingEvidence, setAddingEvidence] = useState(false);
  const [isAiTasksLoading, setIsAiTasksLoading] = useState(false);
  const [aiTasksError, setAiTasksError] = useState<string | null>(null);
  const [suggestedTasks, setSuggestedTasks] = useState<SuggestedTask[] | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [tasksRationale, setTasksRationale] = useState<string | null>(null);

  const { run, pending, error } = useAction();
  const done = tasks.filter((t) => t.status === "done").length;
  const fid = (s: string) => `${e.id}-w-${s}`;

  const handleSuggestTasks = async () => {
    setIsAiTasksLoading(true);
    setAiTasksError(null);
    try {
      const res = await suggestExperimentTasksAction(projectId, e.id);
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
    if (!suggestedTasks) return;
    const items = suggestedTasks
      .filter((_, idx) => selectedIndices.has(idx))
      .map((t) => ({ title: t.title, experimentId: e.id }));
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
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <section aria-labelledby={fid("tasks")} className="min-w-0 rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h4 id={fid("tasks")} className="eyebrow flex items-center gap-2">
                        Tareas
                        <span className="font-mono text-faint normal-case tracking-normal">
                          {done}/{tasks.length}
                        </span>
                      </h4>
                      {canManageTasks && e.status !== "reviewed" && !suggestedTasks && (
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          disabled={isAiTasksLoading || pending}
                          onClick={handleSuggestTasks}
                        >
                          {isAiTasksLoading ? "✨ Generando..." : "✨ Generar con IA"}
                        </Button>
                      )}
                    </div>

                    {tasks.length === 0 && !suggestedTasks && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-muted">Sin tareas todavía. Partí las actividades en pasos concretos.</p>
                        {canManageTasks && e.status !== "reviewed" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            type="button"
                            disabled={isAiTasksLoading || pending}
                            onClick={handleSuggestTasks}
                          >
                            {isAiTasksLoading ? "✨ Generando tareas..." : "✨ Generar tareas para este experimento con IA"}
                          </Button>
                        )}
                      </div>
                    )}

                    {suggestedTasks && (
                      <div className="mt-3 rounded-lg border border-line bg-panel p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-cyan">
                            ✨ Tareas sugeridas ({selectedIndices.size}/{suggestedTasks.length})
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
                        <ul className="space-y-1.5">
                          {suggestedTasks.map((st, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-xs">
                              <input
                                type="checkbox"
                                id={`${fid("st")}-${idx}`}
                                className="mt-0.5 accent-[var(--color-accent)]"
                                checked={selectedIndices.has(idx)}
                                onChange={(ev) => {
                                  const next = new Set(selectedIndices);
                                  if (ev.target.checked) next.add(idx);
                                  else next.delete(idx);
                                  setSelectedIndices(next);
                                }}
                              />
                              <label htmlFor={`${fid("st")}-${idx}`} className="flex-1 text-ink cursor-pointer leading-tight">
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
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => setSuggestedTasks(null)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {aiTasksError && (
            <div className="mt-2">
              <Notice tone="error">{aiTasksError}</Notice>
            </div>
          )}

          {tasks.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className={cx("min-w-0 flex-1", t.status === "done" && "text-muted line-through")}>
                    {t.title}
                    {t.dueDate && <span className="ml-1 text-[0.6875rem] text-faint">· vence {t.dueDate}</span>}
                  </span>
                  {canManageTasks ? (
                    <>
                      <label htmlFor={fid(t.id)} className="sr-only">
                        Estado de {t.title}
                      </label>
                      <select
                        id={fid(t.id)}
                        className="shrink-0 rounded-lg border border-line-strong bg-bg px-2 py-1 text-xs text-ink focus:border-highlight focus:outline-none"
                        value={t.status}
                        disabled={pending}
                        onChange={(x) => run(() => setTaskStatusAction(projectId, t.id, x.target.value as TaskStatus))}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {TASK_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <span className="text-[0.6875rem] text-faint">{TASK_STATUS_LABEL[t.status]}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManageTasks && e.status !== "reviewed" && (
            <form
              className="mt-3 flex gap-2"
              onSubmit={(x) => {
                x.preventDefault();
                run(() => createTaskAction(projectId, { title, experimentId: e.id }), () => setTitle(""));
              }}
            >
              <label htmlFor={fid("new")} className="sr-only">
                Nueva tarea
              </label>
              <input id={fid("new")} className={inputClass} placeholder="Nueva tarea" value={title} onChange={(x) => setTitle(x.target.value)} maxLength={200} required />
              <Button size="sm" type="submit" disabled={pending}>
                Agregar
              </Button>
            </form>
          )}
          {error && (
            <div className="mt-2">
              <Notice tone="error">{error}</Notice>
            </div>
          )}
      </section>

      <section aria-labelledby={fid("ev")} className="min-w-0 rounded-lg border border-line p-3">
        <h4 id={fid("ev")} className="eyebrow">
          Evidencia
        </h4>
        {attached.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm">
            {attached.map((x) => (
              <li key={x.id}>{x.title}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted">
            {e.status === "running"
              ? `Guardá registros, capturas o enlaces mientras ejecutás. Se adjuntan al registrar el resultado${projectEvidence ? ` (hay ${projectEvidence} en el proyecto)` : ""}.`
              : "La evidencia se adjunta al registrar el resultado."}
          </p>
        )}
        {canAddEvidence && e.status === "running" && (
          <div className="mt-3">
            <Button size="sm" variant="ghost" aria-expanded={addingEvidence} onClick={() => setAddingEvidence((v) => !v)}>
              + Agregar evidencia
            </Button>
            {addingEvidence && (
              <div className="mt-2">
                <EvidenceForm projectId={projectId} idPrefix={fid("evf")} onSaved={() => setAddingEvidence(false)} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
