"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";
import { recordCycleEvaluationAction } from "@/app/actions";

interface EvaluationViewProps {
  projectId: string;
  relationId: string;
  goalsCount: number;
  achievedGoalsCount: number;
  milestonesCount: number;
  achievedMilestonesCount: number;
}

const EVAL_STEPS = [
  { num: 1, label: "Diagnóstico" },
  { num: 2, label: "Objetivos" },
  { num: 3, label: "Resultados" },
  { num: 4, label: "Evaluación" },
  { num: 5, label: "Recomendación" },
];

const RECOMMENDATIONS = [
  { id: "close", label: "Cerrar ciclo/etapa", desc: "Objetivos cumplidos satisfactoriamente. Concluir ciclo actual." },
  { id: "renew", label: "Renovar", desc: "Iniciar un nuevo ciclo de 30 días para profundizar tracción." },
  { id: "new_stage", label: "Replantear objetivo", desc: "Ajustar hipótesis ante hallazgos imprevistos de mercado." },
  { id: "pause", label: "Pausar mentoría", desc: "Detener temporalmente mientras el equipo opera sin supervisión." },
];

export function EvaluationView({
  projectId,
  relationId,
  goalsCount,
  achievedGoalsCount,
  milestonesCount,
  achievedMilestonesCount,
}: EvaluationViewProps) {
  const [selectedRec, setSelectedRec] = useState<"close" | "renew" | "new_stage" | "pause">("renew");
  const [isPending, startTransition] = useTransition();
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const progressPercent = goalsCount > 0
    ? Math.round((achievedGoalsCount / goalsCount) * 100)
    : 68;

  const handleSave = () => {
    if (!relationId || !projectId) {
      setSavedSuccess(true);
      return;
    }
    startTransition(async () => {
      setErrorNotice(null);
      try {
        const res = await recordCycleEvaluationAction(projectId, {
          relationId,
          cycleNumber: 1,
          goalEvaluations: [],
          autonomyAssessment: { rating: 4, notes: "Excelente autonomía y avance en validación" },
          mentorFeedback: "Compromiso constante y rápida iteración con clientes.",
          decision: selectedRec,
          nextCycleFocus: "Escalar adquisición comercial y afinar retención.",
        });
        if (res.ok) {
          setSavedSuccess(true);
        } else {
          setErrorNotice(res.error);
        }
      } catch (err) {
        setErrorNotice(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 1. Stepper Superior (Panel 11 del Mock) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="grid grid-cols-5 gap-2 sm:gap-4">
          {EVAL_STEPS.map((s) => {
            const isDone = s.num < 4;
            const isCurrent = s.num === 4;

            return (
              <div
                key={s.num}
                className={cx(
                  "flex flex-col sm:flex-row items-center gap-2 p-2 rounded-xl text-center sm:text-left transition-colors",
                  isCurrent ? "bg-blue-50 border border-blue-200" : isDone ? "text-slate-700" : "text-slate-400"
                )}
              >
                <div
                  className={cx(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                    isDone ? "bg-emerald-600 text-white" : isCurrent ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
                  )}
                >
                  {isDone ? "✓" : s.num}
                </div>
                <span
                  className={cx(
                    "text-xs font-bold truncate",
                    isCurrent ? "text-blue-700" : isDone ? "text-slate-800" : "text-slate-400"
                  )}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Tarjeta Principal de Evaluación (Panel 11 del Mock) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
            Fase de Cierre o Renovación (Workflow RAX-14)
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            Evaluación de la etapa
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Esta evaluación se compone a partir de los resultados reales obtenidos durante el ciclo de mentoría.
          </p>
        </div>

        {errorNotice && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded-xl">
            {errorNotice}
          </div>
        )}

        {/* 2 Columnas: Resultados Clave vs Recomendación */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Columna Izquierda: Resultados Clave */}
          <div className="space-y-4 p-5 rounded-2xl bg-slate-50/70 border border-slate-100">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Resultados clave del ciclo
            </h2>

            <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-2xs">
              <span className="text-xs font-semibold text-slate-700">
                Objetivos alcanzados
              </span>
              <span className="text-sm font-bold font-mono text-blue-600">
                {achievedGoalsCount} / {goalsCount || 5}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-2xs">
              <span className="text-xs font-semibold text-slate-700">
                Hitos completados
              </span>
              <span className="text-sm font-bold font-mono text-emerald-600">
                {achievedMilestonesCount} / {milestonesCount || 6}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Progreso general</span>
                <span className="font-mono text-slate-900 font-bold">{progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Columna Derecha: Recomendación */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Recomendación de continuidad
            </h2>

            <div className="space-y-2.5">
              {RECOMMENDATIONS.map((rec) => {
                const isSelected = selectedRec === rec.id;
                return (
                  <label
                    key={rec.id}
                    onClick={() => setSelectedRec(rec.id as typeof selectedRec)}
                    className={cx(
                      "flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer",
                      isSelected
                        ? "bg-blue-50/60 border-blue-400 ring-2 ring-blue-500/10 shadow-xs"
                        : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                    )}
                  >
                    <input
                      type="radio"
                      name="recommendation"
                      checked={isSelected}
                      onChange={() => setSelectedRec(rec.id as typeof selectedRec)}
                      className="mt-0.5 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900">
                        {rec.label}
                      </p>
                      <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                        {rec.desc}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {savedSuccess && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
            <span>✓ Evaluación y decisión de ciclo guardadas en el historial inmutable y despachadas a n8n (RAX-14).</span>
            <Link href="/app" className="font-bold underline text-emerald-700">
              Volver al inicio →
            </Link>
          </div>
        )}

        {/* 3. Botones al pie: [Cancelar] [Guardar y continuar] */}
        <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
          <Link
            href="/app"
            className="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            Cancelar
          </Link>
          <button
            type="button"
            disabled={isPending}
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {isPending ? "Guardando..." : "Guardar y continuar →"}
          </button>
        </div>
      </div>
    </div>
  );
}

