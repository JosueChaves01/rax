"use client";

import { useState } from "react";
import type { Experiment, Task, TaskStatus } from "@/types/domain";
import { createTaskAction, setTaskStatusAction } from "@/app/actions";
import { TASK_STATUS_LABEL } from "@/features/labels";
import { Button, Notice, cx, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import { EvidenceForm } from "../historial/evidence-form";

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
  const { run, pending, error } = useAction();
  const done = tasks.filter((t) => t.status === "done").length;
  const fid = (s: string) => `${e.id}-w-${s}`;

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <section aria-labelledby={fid("tasks")} className="min-w-0 rounded-lg border border-line p-3">
        <h4 id={fid("tasks")} className="eyebrow flex items-center gap-2">
          Tareas
          <span className="font-mono text-faint normal-case tracking-normal">
            {done}/{tasks.length}
          </span>
        </h4>
        {tasks.length === 0 && <p className="mt-2 text-xs text-muted">Sin tareas todavía. Partí las actividades en pasos concretos.</p>}
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
