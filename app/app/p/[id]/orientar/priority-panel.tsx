"use client";

import { useState } from "react";
import { changeItemAction } from "@/app/actions";
import { Button, Field, Notice, Tag, cx, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

type Problem = { id: string; title: string; content: string; version: number; priority?: { rank: number; rationale: string; setByName: string } };

/** Priorizar el problema a investigar primero: cierra la etapa Orientar, después del acuerdo con el mentor. */
export function PriorityPanel({ projectId, problems, canPrioritize }: { projectId: string; problems: Problem[]; canPrioritize: boolean }) {
  const sorted = [...problems].sort((a, b) => (a.priority?.rank ?? 99) - (b.priority?.rank ?? 99));
  return (
    <section aria-labelledby="prio-title" className="rounded-2xl border border-line bg-panel p-5">
      <h3 id="prio-title" className="eyebrow">
        Priorizar el problema
      </h3>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        La prioridad es una decisión contextual y revisable, no un puntaje objetivo. Considerá impacto, frecuencia, evidencia disponible y costo de
        investigarlo. El problema #1 es el que se convierte en hipótesis.
      </p>
      {sorted.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Todavía no hay problemas en el diagnóstico. Aparecen cuando la conversación los identifica.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {sorted.map((p) => (
            <ProblemRow key={`${p.id}-${p.version}`} projectId={projectId} problem={p} canPrioritize={canPrioritize} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ProblemRow({ projectId, problem: p, canPrioritize }: { projectId: string; problem: Problem; canPrioritize: boolean }) {
  const [open, setOpen] = useState(false);
  const [rank, setRank] = useState(p.priority?.rank ?? 1);
  const [reason, setReason] = useState(p.priority?.rationale ?? "");
  const { run, pending, error, code, reload } = useAction();
  const fid = (s: string) => `${p.id}-prio-${s}`;

  return (
    <li className={cx("rounded-xl border bg-bg p-4", p.priority?.rank === 1 ? "border-accent/50" : "border-line")}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {p.priority && <Tag color="var(--color-accent)">Prioridad #{p.priority.rank}</Tag>}
            <p className="font-semibold">{p.title}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{p.content}</p>
          {p.priority && (
            <p className="mt-1 text-[0.6875rem] text-faint">
              {p.priority.rationale} ({p.priority.setByName})
            </p>
          )}
        </div>
        {canPrioritize && (
          <Button size="sm" variant={p.priority ? "ghost" : "secondary"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {p.priority ? "Cambiar" : "Priorizar"}
          </Button>
        )}
      </div>
      {open && (
        <form
          className="mt-3 space-y-3 border-t border-line pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => changeItemAction(projectId, p.id, { kind: "prioritize", rank, rationale: reason }, p.version), () => setOpen(false));
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
            <Field id={fid("rank")} label="Orden">
              <input id={fid("rank")} type="number" min={1} max={50} className={inputClass} value={rank} onChange={(e) => setRank(Number(e.target.value))} />
            </Field>
            <Field id={fid("rat")} label="Justificación">
              <input id={fid("rat")} className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />
            </Field>
          </div>
          <Button size="sm" variant="primary" disabled={pending} type="submit">
            Guardar prioridad
          </Button>
        </form>
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="error">
            {error}{" "}
            {code === "conflict" && (
              <button type="button" className="font-semibold underline" onClick={reload}>
                Cargar la versión actual
              </button>
            )}
          </Notice>
        </div>
      )}
    </li>
  );
}
