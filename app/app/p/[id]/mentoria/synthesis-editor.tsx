"use client";

import { useState, useTransition } from "react";
import type { ActionType, PostSessionSynthesis } from "@/types/domain";
import { updatePostSessionSynthesisAction } from "@/app/actions";
import { ACTION_TYPE_LABEL } from "@/features/labels";
import { Button, Notice, inputClass } from "@/shared/ui/primitives";

type Commitment = { title: string; actionType?: ActionType; dueDate?: string };

function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-600">{label}</p>
      {items.map((v, i) => (
        <div key={i} className="flex gap-2">
          <input className={inputClass} value={v} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button size="sm" variant="ghost" type="button" aria-label="Quitar" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</Button>
        </div>
      ))}
      <button type="button" className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline" onClick={() => onChange([...items, ""])}>+ Agregar</button>
    </div>
  );
}

/** Editor de la síntesis pos-sesión: corregir lo que propuso la IA o agregar lo que faltó. */
export function SynthesisEditor({
  projectId,
  sessionId,
  initial,
  onSaved,
  onCancel,
}: {
  projectId: string;
  sessionId: string;
  initial?: PostSessionSynthesis;
  onSaved: (s: PostSessionSynthesis) => void;
  onCancel: () => void;
}) {
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [decisions, setDecisions] = useState<string[]>(initial?.agreedDecisions ?? []);
  const [entrepreneur, setEntrepreneur] = useState<Commitment[]>(initial?.entrepreneurCommitments ?? []);
  const [mentor, setMentor] = useState<string[]>((initial?.mentorCommitments ?? []).map((c) => c.title));
  const [nextSteps, setNextSteps] = useState(initial?.nextSteps ?? "");
  const [days, setDays] = useState(initial?.suggestedNextSessionInDays ? String(initial.suggestedNextSessionInDays) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const n = Number(days);
      const res = await updatePostSessionSynthesisAction(projectId, sessionId, {
        summary,
        agreedDecisions: decisions,
        entrepreneurCommitments: entrepreneur.map((c) => ({ title: c.title, actionType: c.actionType, dueDate: c.dueDate })),
        mentorCommitments: mentor.map((title) => ({ title })),
        nextSteps: nextSteps || undefined,
        suggestedNextSessionInDays: days && Number.isInteger(n) && n >= 1 && n <= 90 ? n : undefined,
      });
      if (res.ok && res.data) onSaved(res.data);
      else if (!res.ok) setError(res.error);
    });

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="space-y-1.5">
        <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-600">Resumen</p>
        <textarea className={inputClass} rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Qué se habló y qué se concluyó en la sesión." />
      </div>

      <ListEditor label="Decisiones y acuerdos" items={decisions} onChange={setDecisions} placeholder="Ej.: Enfocarse primero en oficinas" />

      <div className="space-y-1.5">
        <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-600">Compromisos del emprendedor (se pueden adoptar como tareas)</p>
        {entrepreneur.map((c, i) => (
          <div key={i} className="flex flex-col gap-2 sm:flex-row">
            <input
              className={inputClass}
              value={c.title}
              placeholder="Ej.: Entrevistar a 10 oficinas antes del viernes"
              onChange={(e) => setEntrepreneur(entrepreneur.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
            />
            <select
              className={`${inputClass} sm:w-48`}
              value={c.actionType ?? "operational_task"}
              onChange={(e) => setEntrepreneur(entrepreneur.map((x, j) => (j === i ? { ...x, actionType: e.target.value as ActionType } : x)))}
            >
              {Object.entries(ACTION_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <Button size="sm" variant="ghost" type="button" aria-label="Quitar" onClick={() => setEntrepreneur(entrepreneur.filter((_, j) => j !== i))}>✕</Button>
          </div>
        ))}
        <button type="button" className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline" onClick={() => setEntrepreneur([...entrepreneur, { title: "", actionType: "operational_task" }])}>
          + Agregar
        </button>
      </div>

      <ListEditor label="Compromisos del mentor" items={mentor} onChange={setMentor} placeholder="Ej.: Enviar contactos de cafeterías" />

      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div className="space-y-1.5">
          <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-600">Próximos pasos</p>
          <textarea className={inputClass} rows={3} value={nextSteps} onChange={(e) => setNextSteps(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-slate-600">Próximo encuentro (días)</p>
          <input className={inputClass} type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" type="button" disabled={pending || !summary.trim()} onClick={save}>
          {pending ? "Guardando…" : "Guardar síntesis"}
        </Button>
        <Button size="sm" type="button" disabled={pending} onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}
