"use client";

import { useState } from "react";
import type { Task, TaskStatus } from "@/types/domain";
import { createTasksBatchAction, createTaskAction, setTaskStatusAction, suggestExperimentTasksAction } from "@/app/actions";
import { TASK_STATUS_LABEL } from "@/features/labels";
import { Button, Empty, Field, Notice, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import type { SuggestedTask } from "@/lib/ai/schema";

const COLUMNS: TaskStatus[] = ["todo", "doing", "blocked", "done"];

export function TaskBoard({
  projectId,
  tasks,
  experiments,
  people,
  canManage,
}: {
  projectId: string;
  tasks: Task[];
  experiments: Array<{ id: string; question: string }>;
  people: Record<string, { name: string }>;
  canManage: boolean;
}) {
  const [title, setTitle] = useState("");
  const [exp, setExp] = useState("");
  const [due, setDue] = useState("");

  const [isAiTasksLoading, setIsAiTasksLoading] = useState(false);
  const [aiTasksError, setAiTasksError] = useState<string | null>(null);
  const [suggestedTasks, setSuggestedTasks] = useState<SuggestedTask[] | null>(null);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [tasksRationale, setTasksRationale] = useState<string | null>(null);

  const { run, pending, error } = useAction();

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
      .map((t) => ({ title: t.title, experimentId: exp }));
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
    <div className="space-y-5">
      {canManage && (
        <form
          className="grid gap-3 rounded-2xl border border-line bg-panel p-4 md:grid-cols-[1fr_260px_160px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createTaskAction(projectId, { title, experimentId: exp || undefined, dueDate: due || undefined }), () => setTitle(""));
          }}
        >
          <Field id="t-title" label="Nueva tarea">
            <input id="t-title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
          </Field>
          <Field id="t-exp" label="Experimento (opcional)">
            <select id="t-exp" className={inputClass} value={exp} onChange={(e) => { setExp(e.target.value); setSuggestedTasks(null); }}>
              <option value="">Ninguno</option>
              {experiments.map((e) => (
                <option key={e.id} value={e.id}>{e.question.slice(0, 60)}</option>
              ))}
            </select>
          </Field>
          <Field id="t-due" label="Fecha">
            <input id="t-due" type="date" className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button variant="primary" type="submit" disabled={pending} className="w-full">Agregar</Button>
          </div>
          {error && <div className="md:col-span-4"><Notice tone="error">{error}</Notice></div>}
        </form>
      )}

      {canManage && exp && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-panel/60 p-4">
          <div>
            <p className="text-sm font-medium">Asistente de tareas para el experimento</p>
            <p className="text-xs text-muted">Generá tareas operativas secuenciales a partir del método, participantes y actividades definidas.</p>
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
        <Notice tone="error">{aiTasksError}</Notice>
      )}

      {tasks.length === 0 ? (
        <Empty title="Sin tareas">Las tareas ayudan a ejecutar los experimentos. Creá la primera cuando tengas uno en preparación.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((c) => (
            <section key={c} aria-labelledby={`col-${c}`} className="rounded-2xl border border-line bg-panel/60 p-3">
              <h3 id={`col-${c}`} className="eyebrow mb-3 px-1">{TASK_STATUS_LABEL[c]} <span className="font-mono text-faint">{tasks.filter((t) => t.status === c).length}</span></h3>
              <ul className="space-y-2">
                {tasks.filter((t) => t.status === c).map((t) => (
                  <li key={t.id} className="rounded-xl border border-line bg-bg p-3 text-sm">
                    <p className={t.status === "done" ? "text-muted line-through" : ""}>{t.title}</p>
                    <p className="mt-1 text-[0.6875rem] text-faint">
                      {people[t.assigneeId]?.name}
                      {t.dueDate && ` · vence ${t.dueDate}`}
                      {t.experimentId && " · experimento"}
                    </p>
                    {canManage && (
                      <>
                        <label htmlFor={`ts-${t.id}`} className="sr-only">Estado de {t.title}</label>
                        <select id={`ts-${t.id}`} className={`${inputClass} mt-2 py-1 text-xs`} value={t.status} disabled={pending} onChange={(e) => run(() => setTaskStatusAction(projectId, t.id, e.target.value as TaskStatus))}>
                          {COLUMNS.map((s) => (
                            <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
