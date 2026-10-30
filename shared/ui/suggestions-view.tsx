"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";

export interface SuggestionItem {
  id: string;
  title: string;
  subtitle: string;
  targetRole: "mentor" | "entrepreneur" | "all";
  recommendation: string;
  whyPoints: string[];
  ctaLabel: string;
  ctaHref: string;
}

interface SuggestionsViewProps {
  initialSuggestions: SuggestionItem[];
}

type RoleFilter = "todas" | "mentor" | "entrepreneur";

export function SuggestionsView({ initialSuggestions }: SuggestionsViewProps) {
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("todas");
  const [selectedId, setSelectedId] = useState<string>(
    initialSuggestions[0]?.id || ""
  );
  const [actionDone, setActionDone] = useState(false);

  const filtered = initialSuggestions.filter((s) => {
    if (roleFilter === "todas") return true;
    if (roleFilter === "mentor") return s.targetRole === "mentor" || s.targetRole === "all";
    if (roleFilter === "entrepreneur") return s.targetRole === "entrepreneur" || s.targetRole === "all";
    return true;
  });

  const selected = initialSuggestions.find((s) => s.id === selectedId) || filtered[0] || initialSuggestions[0];

  return (
    <div className="space-y-6">
      {/* 1. Encabezado con Filtros por Rol (Panel 12 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Sugerencias para ti
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Recomendaciones proactivas justificadas con datos de tu proyecto y cartera (Workflow RAX-09).
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

      {/* 2. Distribución en 2 Columnas (Panel 12) */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl mx-auto mb-3">
            💡
          </div>
          <h2 className="text-base font-bold text-slate-900">Sin sugerencias pendientes</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Actualmente todos tus proyectos e hitos se encuentran al día. RAX generará nuevas sugerencias de forma proactiva conforme avance la interacción y se registren novedades.
          </p>
        </div>
      ) : (
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
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs shrink-0 cursor-pointer"
                  >
                    Ver
                  </button>
                </div>
              );
            })}
          </div>

          {/* Columna Derecha: Tarjeta de Detalle con "¿Por qué?" (7 cols) */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs flex flex-col justify-between space-y-6">
            {selected ? (
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

                {/* Justificación Data-driven "¿Por qué?" */}
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
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                Selecciona una sugerencia para ver el detalle.
              </div>
            )}

            {/* Botón de acción */}
            {selected && (
              <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                <Link
                  href={selected.ctaHref}
                  onClick={() => setActionDone(true)}
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  {selected.ctaLabel} →
                </Link>
              </div>
            )}

            {actionDone && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-xl">
                ✓ Acción iniciada correctamente. Redirigiendo...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

