"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Assessment, AssessmentAnswer, AssessmentQuestion, AssessmentSubmission } from "@/types/b2b";
import { closeAssessmentAction, createAssessmentAction, publishAssessmentAction, reviewSubmissionAction, updateAssessmentAction } from "@/app/actions/cycle";
import { submitAssessmentAction } from "@/app/actions/client";
import { Button, Notice, cx, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

/** Formularios de evaluaciones: el mentor crea, edita, publica, cierra y revisa; la persona cliente responde. */

const SCALE = [1, 2, 3, 4, 5];

export const QUESTION_KIND_LABEL: Record<AssessmentQuestion["kind"], string> = {
  open: "Respuesta abierta",
  single_choice: "Una opción",
  multi_choice: "Varias opciones",
  scale: "Escala del 1 al 5",
};

type DraftQuestion = { id: string; kind: AssessmentQuestion["kind"]; prompt: string; options: string; points: string };

const toDraft = (q: AssessmentQuestion): DraftQuestion => ({ id: q.id, kind: q.kind, prompt: q.prompt, options: (q.options ?? []).join("\n"), points: q.points === undefined ? "" : String(q.points) });
const emptyQuestion = (): DraftQuestion => ({ id: "", kind: "open", prompt: "", options: "", points: "" });

/* ───────────── Mentor: crear y editar ───────────── */

export function AssessmentEditor({
  projectId,
  sessions,
  assessment,
  defaultSessionId,
}: {
  projectId: string;
  sessions: Array<{ id: string; label: string }>;
  assessment?: Assessment;
  defaultSessionId?: string;
}) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [title, setTitle] = useState(assessment?.title ?? "");
  const [instructions, setInstructions] = useState(assessment?.instructions ?? "");
  const [sessionId, setSessionId] = useState(assessment?.sessionId ?? defaultSessionId ?? "");
  const [dueAt, setDueAt] = useState(assessment?.dueAt?.slice(0, 10) ?? "");
  const [questions, setQuestions] = useState<DraftQuestion[]>(assessment?.questions.length ? assessment.questions.map(toDraft) : [emptyQuestion()]);
  const set = (i: number, patch: Partial<DraftQuestion>) => setQuestions(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const submit = () => {
    const input = {
      title,
      instructions,
      ...(sessionId ? { sessionId } : {}),
      ...(dueAt ? { dueAt } : {}),
      questions: questions.map((q) => ({
        id: q.id,
        kind: q.kind,
        prompt: q.prompt,
        ...(q.kind === "open" ? {} : { options: q.options.split("\n").map((o) => o.trim()).filter(Boolean) }),
        ...(q.points.trim() ? { points: Number(q.points) } : {}),
      })) as AssessmentQuestion[],
    };
    if (assessment) run(() => updateAssessmentAction(projectId, assessment.id, input));
    else run(() => createAssessmentAction(projectId, input), (r) => r.ok && r.data && router.push(`/app/p/${projectId}/evaluaciones/${r.data.id}`));
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="block text-xs font-semibold text-slate-600">Título</span>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="¿Qué aprendiste de tus números?" />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="block text-xs font-semibold text-slate-600">Instrucciones (opcional)</span>
          <textarea className={cx(inputClass, "min-h-20")} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={8000} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold text-slate-600">Sesión (opcional)</span>
          <select className={inputClass} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">Sin sesión</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold text-slate-600">Fecha límite (opcional)</span>
          <input type="date" className={inputClass} value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>
      </div>

      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={i} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-500">Pregunta {i + 1}</span>
              <div className="flex items-center gap-2">
                <select aria-label={`Tipo de la pregunta ${i + 1}`} className={cx(inputClass, "h-8 w-auto py-0 text-xs")} value={q.kind} onChange={(e) => set(i, { kind: e.target.value as DraftQuestion["kind"] })}>
                  {(Object.keys(QUESTION_KIND_LABEL) as Array<AssessmentQuestion["kind"]>).map((k) => (
                    <option key={k} value={k}>
                      {QUESTION_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                {questions.length > 1 && (
                  <button type="button" className="text-xs text-slate-400 hover:text-rose-600" onClick={() => setQuestions(questions.filter((_, j) => j !== i))}>
                    Quitar
                  </button>
                )}
              </div>
            </div>
            <input className={inputClass} aria-label={`Enunciado de la pregunta ${i + 1}`} placeholder="Enunciado" value={q.prompt} onChange={(e) => set(i, { prompt: e.target.value })} maxLength={1000} />
            {(q.kind === "single_choice" || q.kind === "multi_choice") && (
              <textarea
                className={cx(inputClass, "min-h-20")}
                aria-label={`Opciones de la pregunta ${i + 1}`}
                placeholder="Una opción por línea (mínimo dos)"
                value={q.options}
                onChange={(e) => set(i, { options: e.target.value })}
              />
            )}
            {q.kind === "scale" && (
              <textarea
                className={cx(inputClass, "min-h-14")}
                aria-label={`Etiquetas de la escala ${i + 1}`}
                placeholder={"Etiqueta del 1 (opcional)\nEtiqueta del 5 (opcional)"}
                value={q.options}
                onChange={(e) => set(i, { options: e.target.value })}
              />
            )}
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Puntos (opcional)
              <input type="number" min={0} max={100} className={cx(inputClass, "h-8 w-24 py-0")} value={q.points} onChange={(e) => set(i, { points: e.target.value })} />
            </label>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => setQuestions([...questions, emptyQuestion()])} disabled={questions.length >= 30}>
          Agregar pregunta
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending || !title.trim()}>
          {pending ? "Guardando…" : assessment ? "Guardar cambios" : "Crear borrador"}
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );
}

/** Publicar (borrador) o cerrar (publicada). */
export function AssessmentStatusButton({ projectId, assessmentId, status }: { projectId: string; assessmentId: string; status: Assessment["status"] }) {
  const { run, pending, error } = useAction();
  if (status === "closed") return null;
  return (
    <div className="space-y-2">
      {status === "draft" ? (
        <Button variant="primary" size="sm" disabled={pending} onClick={() => run(() => publishAssessmentAction(projectId, assessmentId))}>
          {pending ? "Publicando…" : "Publicar al cliente"}
        </Button>
      ) : (
        <Button size="sm" disabled={pending} onClick={() => window.confirm("¿Cerrar la evaluación? Ya no recibirá entregas.") && run(() => closeAssessmentAction(projectId, assessmentId))}>
          {pending ? "Cerrando…" : "Cerrar evaluación"}
        </Button>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/* ───────────── Mentor: revisar una entrega ───────────── */

export function ReviewForm({ projectId, submission }: { projectId: string; submission: AssessmentSubmission }) {
  const { run, pending, error } = useAction();
  const [score, setScore] = useState(submission.score === undefined ? "" : String(submission.score));
  const [feedback, setFeedback] = useState(submission.mentorFeedback ?? "");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => reviewSubmissionAction(projectId, submission.id, { feedback, ...(score.trim() ? { score: Number(score) } : {}) }));
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
        <label className="space-y-1">
          <span className="block text-xs font-semibold text-slate-600">Puntaje</span>
          <input type="number" min={0} max={1000} step="0.5" className={inputClass} value={score} onChange={(e) => setScore(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-semibold text-slate-600">Comentario para la persona</span>
          <textarea className={cx(inputClass, "min-h-16")} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={8000} />
        </label>
      </div>
      <Button type="submit" variant="primary" size="sm" disabled={pending || (!feedback.trim() && !score.trim())}>
        {pending ? "Guardando…" : submission.status === "reviewed" ? "Actualizar revisión" : "Enviar revisión"}
      </Button>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );
}

/* ───────────── Cliente: responder ───────────── */

type Value = AssessmentAnswer["value"];

export function AnswerForm({ projectId, assessment, initial }: { projectId: string; assessment: Assessment; initial: AssessmentAnswer[] }) {
  const { run, pending, error } = useAction();
  const [values, setValues] = useState<Record<string, Value>>(Object.fromEntries(initial.map((a) => [a.questionId, a.value])));
  const [saved, setSaved] = useState(false);
  const set = (id: string, v: Value) => {
    setSaved(false);
    setValues({ ...values, [id]: v });
  };
  const answers = (): AssessmentAnswer[] => Object.entries(values).map(([questionId, value]) => ({ questionId, value }));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (window.confirm("¿Enviar tus respuestas? Después ya no podrás cambiarlas.")) run(() => submitAssessmentAction(projectId, assessment.id, answers()));
      }}
    >
      <ol className="space-y-4">
        {assessment.questions.map((q, i) => (
          <li key={q.id} className="space-y-2">
            <p className="text-sm font-semibold text-slate-800">
              {i + 1}. {q.prompt}
              {q.points !== undefined && <span className="ml-2 text-xs font-normal text-slate-500">({q.points} pts)</span>}
            </p>
            <QuestionInput q={q} value={values[q.id]} onChange={(v) => set(q.id, v)} />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => run(() => submitAssessmentAction(projectId, assessment.id, answers(), true), () => setSaved(true))}>
          Guardar borrador
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Enviando…" : "Enviar respuestas"}
        </Button>
        {saved && <span className="text-xs text-emerald-700">Borrador guardado.</span>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );
}

function QuestionInput({ q, value, onChange }: { q: AssessmentQuestion; value: Value | undefined; onChange: (v: Value) => void }) {
  const name = `q-${q.id}`;
  if (q.kind === "open") {
    return <textarea aria-label={q.prompt} className={cx(inputClass, "min-h-24")} maxLength={5000} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />;
  }
  if (q.kind === "single_choice") {
    return (
      <div className="space-y-1.5">
        {(q.options ?? []).map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="radio" name={name} checked={value === o} onChange={() => onChange(o)} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  if (q.kind === "multi_choice") {
    const picked = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-1.5">
        {(q.options ?? []).map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={picked.includes(o)} onChange={(e) => onChange(e.target.checked ? [...picked, o] : picked.filter((x) => x !== o))} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={q.prompt}>
        {SCALE.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={cx("h-9 w-9 rounded-full border text-sm font-semibold", value === n ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-700 hover:border-blue-400")}
          >
            {n}
          </button>
        ))}
      </div>
      {q.options?.length ? (
        <p className="text-xs text-slate-500">
          1 = {q.options[0]}
          {q.options[1] ? ` · 5 = ${q.options[1]}` : ""}
        </p>
      ) : null}
    </div>
  );
}
