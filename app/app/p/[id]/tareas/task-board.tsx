"use client";

import { useState } from "react";
import type { Task, TaskStatus } from "@/types/domain";
import { createTaskAction, setTaskStatusAction } from "@/app/actions";
import { TASK_STATUS_LABEL } from "@/features/labels";
import { Button, Empty, Field, Notice, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

const COLUMNS: TaskStatus[] = ["todo", "doing", "blocked", "done"];

export function TaskBoard({ projectId, tasks, experiments, people, canManage }: { projectId: string; tasks: Task[]; experiments: Array<{ id: string; question: string }>; people: Record<string, { name: string }>; canManage: boolean }) {
  const [title, setTitle] = useState("");
  const [exp, setExp] = useState("");
  const [due, setDue] = useState("");
  const { run, pending, error } = useAction();

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
            <select id="t-exp" className={inputClass} value={exp} onChange={(e) => setExp(e.target.value)}>
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
