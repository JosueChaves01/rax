"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";

interface SuggestionItem {
  id: string;
  title: string;
  subtitle: string;
  targetRole: "mentor" | "entrepreneur" | "all";
  recommendation: string;
  whyPoints: string[];
  ctaLabel: string;
  ctaHref: string;
}

const SUGGESTIONS: SuggestionItem[] = [
  {
    id: "learning",
    title: "Recomendar material de aprendizaje",
    subtitle: "Para fortalecer la habilidad de comunicación comercial",
    targetRole: "all",
    recommendation:
      "Te recomiendo asignar el método PREP, ya que ayudará a estructurar respuestas claras y contundentes ante clientes y prospectos indecisos.",
    whyPoints: [
      "Tuviste una tasa de conversión comercial reciente del 40%.",
      "Se detectó fricción en la comunicación del diferencial de valor.",
      "Está alineado directamente con tu objetivo de captar nuevos clientes.",
    ],
    ctaLabel: "Asignar material PREP",
    ctaHref: "/app/aprendizaje",
  },
  {
    id: "session-prep",
    title: "Preparar próxima sesión",
    subtitle: "Basado en la última sesión y tareas pendientes",
    targetRole: "mentor",
    recommendation:
      "Generar agenda tentativa de 60 minutos enfocada en destrabar el cuello de botella en captación comercial.",
    whyPoints: [
      "Hay 2 compromisos de la reunión pasada que siguen sin validar.",
      "Faltan 4 días para el próximo encuentro pactado.",
      "El emprendedor cargó una nueva duda en el chat contextual.",
    ],
    ctaLabel: "Ver y preparar agenda",
    ctaHref: "/app/sesiones",
  },
  {
    id: "progress-report",
    title: "Generar informe de progreso",
    subtitle: "Con datos consolidados de objetivos y tareas completadas",
    targetRole: "all",
    recommendation:
      "Sintetizar el avance del 68% de la etapa para compartir con socios e inversionistas en un reporte ejecutivo trazable.",
    whyPoints: [
      "Se han cumplido 3 de los 5 objetivos principales.",
      "Se acumulan 4 evidencias validadas con clientes.",
      "Permite comparar con la línea base inicial de diagnóstico.",
    ],
    ctaLabel: "Generar informe",
    ctaHref: "/app/reportes",
  },
  {
    id: "detect-blockers",
    title: "Detectar posibles bloqueos",
    subtitle: "Se identificaron 2 tareas con retraso en el cronograma",
    targetRole: "entrepreneur",
    recommendation:
      "Revisar dependencias operativas que impiden el envío de la propuesta comercial.",
    whyPoints: [
      "La tarea superó la fecha límite establecida por 48 horas.",
      "El mentor ofreció una plantilla de soporte no abierta aún.",
      "Desbloquearla habilita la validación del siguiente hito.",
    ],
    ctaLabel: "Resolver bloqueos",
    ctaHref: "/app/tareas",
  },
];

type RoleFilter = "todas" | "mentor" | "entrepreneur";

export default function SuggestionsPage() {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("todas");
  const [selectedId, setSelectedId] = useState("learning");
  const [actionDone, setActionDone] = useState(false);

  const filtered = SUGGESTIONS.filter((s) => {
    if (roleFilter === "todas") return true;
    if (roleFilter === "mentor") return s.targetRole === "mentor" || s.targetRole === "all";
    if (roleFilter === "entrepreneur") return s.targetRole === "entrepreneur" || s.targetRole === "all";
    return true;
  });

  const selected = SUGGESTIONS.find((s) => s.id === selectedId) || SUGGESTIONS[0];

  return (
    <div className="space-y-6">
      {/* 1. Encabezado con Filtros por Rol (Panel 12 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sugerencias para ti
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Recomendaciones proactivas justificadas con datos de tu proyecto y cartera.
          </p>
        </div>

        {/* Filtros: [Todas] | [Mentor] | [Emprendedor] */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          {(
            [
              ["todas", "Todas"],
              ["mentor", "Mentor"],
              ["entrepreneur", "Emprendedor"],
            ] as const
          ).map(([rf, label]) => (
            <button
              key={rf}
              type="button"
              onClick={() => setRoleFilter(rf)}
              className={cx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                roleFilter === rf
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Distribución en 2 Columnas (Panel 12 del Mock) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Lista de Sugerencias (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          {filtered.map((sug) => {
            const isSelected = sug.id === selectedId;

            return (
              <div
                key={sug.id}
                onClick={() => setSelectedId(sug.id)}
                className={cx(
                  "p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3",
                  isSelected
                    ? "bg-blue-50/70 border-blue-400 ring-2 ring-blue-500/10 shadow-xs"
                    : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {sug.title}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {sug.subtitle}
                  </p>
                </div>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs shrink-0"
                >
                  Ver
                </button>
              </div>
            );
          })}
        </div>

        {/* Columna Derecha: Tarjeta de Detalle con "¿Por qué?" (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            <div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700">
                Sugerencia Inteligente
              </span>
              <h2 className="text-xl font-bold text-slate-900 mt-2">
                {selected.title}
              </h2>
              <p className="text-xs text-slate-700 mt-3 leading-relaxed">
                {selected.recommendation}
              </p>
            </div>

            {/* Justificación Data-driven "¿Por qué?" (Panel 12 del Mock) */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <span>📊</span> ¿Por qué sugiere esto RAX?
              </h3>
              <ul className="space-y-2 pt-1">
                {selected.whyPoints.map((point, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="text-blue-600 font-bold">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Botón de acción */}
          <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
            <Link
              href={selected.ctaHref}
              onClick={() => setActionDone(true)}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
            >
              {selected.ctaLabel} →
            </Link>
          </div>

          {actionDone && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-xl">
              ✓ Acción iniciada correctamente. Redirigiendo...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

