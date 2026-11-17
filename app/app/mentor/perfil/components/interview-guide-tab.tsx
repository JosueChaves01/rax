"use client";

import { useState, useTransition } from "react";
import type { IntakeQuestion } from "@/types/b2b";
import { saveMentorProfileAction } from "@/app/actions/mentor";
import { Button, Card, Empty, Field, Notice, inputClass } from "@/shared/ui/primitives";
import { DEFAULT_RECOMMENDED_QUESTIONS } from "../constants";

interface InterviewGuideTabProps {
  initial: IntakeQuestion[];
  onGuideUpdated?: (questions: IntakeQuestion[]) => void;
}

type DraftQuestion = IntakeQuestion & { key: string };

const TMP = "tmp_";
let tmpCounter = 0;
const newKey = () => `${TMP}${++tmpCounter}_${Date.now()}`;

export function InterviewGuideTab({ initial, onGuideUpdated }: InterviewGuideTabProps) {
  const [questions, setQuestions] = useState<DraftQuestion[]>(() =>
    initial.map((q) => ({ ...q, key: q.id || newKey() }))
  );
  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const patch = (key: string, change: Partial<IntakeQuestion>) => {
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...change } : q)));
  };

  const move = (index: number, delta: number) => {
    setQuestions((qs) => {
      const target = index + delta;
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const add = () => {
    const key = newKey();
    setQuestions((qs) => [
      ...qs,
      { key, id: key, topic: "", question: "", why: "", required: false },
    ]);
  };

  const remove = (key: string) => {
    setQuestions((qs) => qs.filter((q) => q.key !== key));
  };

  const loadDefaults = () => {
    const defaults: DraftQuestion[] = DEFAULT_RECOMMENDED_QUESTIONS.map((q) => {
      const k = newKey();
      return {
        ...q,
        id: k,
        key: k,
      };
    });
    setQuestions(defaults);
    setFlash({
      tone: "success",
      text: "Se cargó la plantilla estándar de RAX. Recuerda hacer clic en «Guardar Guía de Entrevista».",
    });
  };

  const save = () => {
    setFlash(null);

    // Validación básica
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.topic.trim()) {
        setFlash({ tone: "error", text: `La pregunta #${i + 1} requiere un tema.` });
        return;
      }
      if (!q.question.trim()) {
        setFlash({ tone: "error", text: `La pregunta #${i + 1} no tiene texto de pregunta.` });
        return;
      }
    }

    startTransition(async () => {
      const res = await saveMentorProfileAction({
        interviewGuide: questions.map((q) => ({
          id: q.id.startsWith(TMP) ? "" : q.id,
          topic: q.topic.trim(),
          question: q.question.trim(),
          why: q.why.trim(),
          required: q.required,
        })),
      });

      if (res.ok && res.data) {
        const saved = res.data.interviewGuide.map((q) => ({ ...q, key: q.id }));
        setQuestions(saved);
        setFlash({ tone: "success", text: "Guía de entrevista guardada correctamente." });
        onGuideUpdated?.(res.data.interviewGuide);
      } else {
        setFlash({ tone: "error", text: res.ok ? "Error al guardar." : res.error });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Explicación didáctica del flujo de Intake */}
      <div className="rounded-2xl border border-blue-200/80 bg-blue-50/50 p-5 sm:p-6 text-slate-800 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                ?
              </span>
              <h2 className="text-base font-bold text-slate-900">¿Cómo funciona la Guía de Entrevista?</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-2xl">
              Cuando invitas a un cliente a un proyecto en RAX, tu Agente IA conduce una entrevista previa basada en estas preguntas.
              Al finalizar, el agente genera un informe diagnóstico consolidado para que comiences la Sesión 1 con la información clave ya recolectada.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={loadDefaults}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 bg-white px-3.5 py-2 text-xs font-semibold text-blue-700 shadow-2xs hover:bg-blue-50 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Cargar plantilla recomendada RAX
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Preguntas */}
      <Card className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Preguntas de la Entrevista ({questions.length})</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Arrastra o usa las flechas para ordenar las preguntas. Marca como obligatorias las indispensables para tu diagnóstico.
            </p>
          </div>

          <Button size="sm" variant="primary" onClick={add}>
            + Agregar Pregunta
          </Button>
        </div>

        {questions.length === 0 ? (
          <div className="py-10">
            <Empty title="Aún no has configurado preguntas">
              Puedes empezar desde cero agregando una pregunta o cargar nuestra plantilla recomendada para acelerar tu configuración.
            </Empty>
            <div className="mt-4 flex justify-center">
              <Button size="sm" onClick={loadDefaults}>
                Cargar plantilla recomendada
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {questions.map((q, idx) => (
              <div
                key={q.key}
                className="group relative rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs transition hover:border-slate-300"
              >
                {/* Cabecera de la tarjeta de pregunta */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 font-mono text-xs font-bold text-white">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-sm text-slate-800">
                      {q.topic ? q.topic : `Pregunta ${idx + 1}`}
                    </span>
                    {q.required ? (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                        Obligatoria
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        Opcional
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Botones de orden */}
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => move(idx, -1)}
                      title="Subir posición"
                      className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      disabled={idx === questions.length - 1}
                      onClick={() => move(idx, 1)}
                      title="Bajar posición"
                      className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      onClick={() => remove(q.key)}
                      title="Eliminar pregunta"
                      className="cursor-pointer rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Campos de la pregunta */}
                <div className="mt-4 space-y-3.5">
                  <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                    <Field label="Tema / Dimensión" id={`q-topic-${q.key}`} hint="Categoría breve (ej: Problema, Mercado, Finanzas)">
                      <input
                        id={`q-topic-${q.key}`}
                        className={inputClass}
                        maxLength={120}
                        placeholder="Ej: Tracción comercial"
                        value={q.topic}
                        onChange={(e) => patch(q.key, { topic: e.target.value })}
                      />
                    </Field>

                    <Field label="Texto de la Pregunta" id={`q-text-${q.key}`} hint="La pregunta exacta que el asistente formulará">
                      <input
                        id={`q-text-${q.key}`}
                        className={inputClass}
                        maxLength={500}
                        placeholder="Ej: ¿Cuáles han sido tus ingresos en los últimos 3 meses?"
                        value={q.question}
                        onChange={(e) => patch(q.key, { question: e.target.value })}
                      />
                    </Field>
                  </div>

                  <Field
                    label="Propósito / Para qué te sirve (Guía de repregunta)"
                    id={`q-why-${q.key}`}
                    hint="Instrucción interna: si el cliente responde muy vago o corto, el asistente usa esta guía para repreguntar con precisión."
                  >
                    <input
                      id={`q-why-${q.key}`}
                      className={inputClass}
                      maxLength={500}
                      placeholder="Ej: Necesitamos distinguir ventas recurrentes de proyectos puntuales para evaluar previsibilidad."
                      value={q.why}
                      onChange={(e) => patch(q.key, { why: e.target.value })}
                    />
                  </Field>

                  <div className="pt-1 flex items-center justify-between">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) => patch(q.key, { required: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      Esta pregunta es obligatoria para cerrar la entrevista
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Notificaciones y Botón Guardar */}
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}

      <div className="sticky bottom-4 z-10 flex justify-end rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-lg backdrop-blur-md">
        <Button variant="primary" onClick={save} disabled={pending} className="min-w-44">
          {pending ? "Guardando guía…" : "Guardar Guía de Entrevista"}
        </Button>
      </div>
    </div>
  );
}
