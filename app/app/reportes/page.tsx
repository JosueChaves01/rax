"use client";

import { useState } from "react";
import { cx } from "@/shared/ui/primitives";

type MetricTab = "general" | "mentor" | "emprendedor" | "operativo";

export default function ReportsPage() {
  const [tab, setTab] = useState<MetricTab>("general");
  const [timeRange, setTimeRange] = useState("30d");

  return (
    <div className="space-y-6">
      {/* 1. Encabezado con Segmentos y Filtro Temporal (Panel 13 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Seguimiento de métricas y reportes
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Indicadores definidos, evolución temporal, satisfacción y adopción de IA en el programa.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Pestañas de segmento */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
            {(
              [
                ["general", "General"],
                ["mentor", "Mentor"],
                ["emprendedor", "Emprendedor"],
                ["operativo", "Operativo"],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cx(
                  "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                  tab === t
                    ? "bg-white text-slate-900 shadow-2xs"
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Selector de Rango */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-medium text-slate-700 shadow-2xs focus:outline-none focus:border-blue-600"
          >
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
            <option value="90d">Últimos 90 días</option>
          </select>
        </div>
      </div>

      {/* 2. Cuadrícula de 4 Tarjetas de Métricas de Rendimiento (Panel 13 del Mock) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs text-slate-500 font-medium">Tiempo de respuesta</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-mono">16.8s</span>
            <span className="text-xs font-bold text-emerald-600">-2.5%</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">vs mes anterior</p>
        </div>

        {/* KPI 2 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs text-slate-500 font-medium">Tasa de finalización</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-mono">92%</span>
            <span className="text-xs font-bold text-emerald-600">+5%</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">de hitos acordados</p>
        </div>

        {/* KPI 3 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs text-slate-500 font-medium">Uso de IA</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-mono">78%</span>
            <span className="text-xs font-bold text-emerald-600">+14%</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">adopción activa</p>
        </div>

        {/* KPI 4 */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
          <p className="text-xs text-slate-500 font-medium">Satisfacción</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-mono">4.7/5</span>
            <span className="text-xs font-bold text-emerald-600">+0.2</span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">promedio encuestas</p>
        </div>
      </div>

      {/* 3. Gráfico Interactivo de Evolución de Uso (Panel 13 del Mock) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Evolución de uso
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Volumen de interacciones por canal durante el ciclo
            </p>
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              Documentos
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              Tareas
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Chat
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Evaluaciones
            </span>
          </div>
        </div>

        {/* Gráfico SVG de Curvas Onduladas Fluídas como en el Mock */}
        <div className="w-full h-64 pt-4">
          <svg
            className="w-full h-full overflow-visible"
            viewBox="0 0 600 200"
            preserveAspectRatio="none"
          >
            {/* Líneas horizontales de guía */}
            <line x1="0" y1="40" x2="600" y2="40" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="0" y1="90" x2="600" y2="90" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="0" y1="140" x2="600" y2="140" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="0" y1="190" x2="600" y2="190" stroke="#e2e8f0" strokeWidth="1" />

            {/* Curva 1: Documentos (Azul) */}
            <path
              d="M 0,160 Q 150,110 300,120 T 600,60"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
            />
            {/* Curva 2: Tareas (Púrpura) */}
            <path
              d="M 0,170 Q 150,150 300,90 T 600,80"
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2.5"
            />
            {/* Curva 3: Chat (Verde) */}
            <path
              d="M 0,140 Q 150,170 300,140 T 600,110"
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
            />
            {/* Curva 4: Evaluaciones (Ámbar) */}
            <path
              d="M 0,185 Q 150,180 300,165 T 600,135"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
            />

            {/* Puntos destacados */}
            <circle cx="300" cy="120" r="4" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
            <circle cx="300" cy="90" r="4" fill="#8b5cf6" stroke="#ffffff" strokeWidth="2" />
            <circle cx="300" cy="140" r="4" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
            <circle cx="300" cy="165" r="4" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
          </svg>

          {/* Eje de Fechas (X) */}
          <div className="flex justify-between text-[11px] text-slate-400 font-mono mt-2 pt-2 border-t border-slate-100">
            <span>1 Jun</span>
            <span>8 Jun</span>
            <span>15 Jun</span>
            <span>22 Jun</span>
            <span>29 Jun</span>
          </div>
        </div>
      </div>
    </div>
  );
}

