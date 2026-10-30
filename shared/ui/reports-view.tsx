"use client";

import { useState } from "react";
import { cx } from "@/shared/ui/primitives";

export type MetricTab = "general" | "mentor" | "emprendedor" | "operativo";

export interface ReportMetricsData {
  responseTime: {
    value: string;
    change: string;
    detail: string;
  };
  completionRate: {
    value: string;
    change: string;
    detail: string;
  };
  aiAdoption: {
    value: string;
    change: string;
    detail: string;
  };
  satisfaction: {
    value: string;
    change: string;
    detail: string;
  };
  timeline: {
    labels: string[];
    documents: number[];
    tasks: number[];
    chat: number[];
    evaluations: number[];
  };
  tabBreakdowns: {
    mentor: { sessionsCount: number; activeProjects: number; interventionsCount: number };
    entrepreneur: { completedTasks: number; totalTasks: number; exercisesEvaluated: number };
    operations: { totalAudits: number; aiInvocations: number; errorRate: string };
  };
}

interface ReportsViewProps {
  initialData: ReportMetricsData;
}

export function ReportsView({ initialData }: ReportsViewProps) {
  const [tab, setTab] = useState<MetricTab>("general");
  const [timeRange, setTimeRange] = useState("30d");

  // Multiplier for display if range changes
  const rangeMultiplier = timeRange === "7d" ? 0.3 : timeRange === "90d" ? 2.5 : 1.0;

  // Render SVG path from array of numbers [0..100] normalized to viewBox 600x200
  const buildSvgPath = (points: number[]) => {
    if (!points || points.length === 0) return "M 0,150 L 600,150";
    const stepX = 600 / (points.length - 1);
    // map 0..100 to y=180..30 (inverted for SVG coordinates)
    const coords = points.map((val, idx) => {
      const x = Math.round(idx * stepX);
      const y = Math.round(180 - (Math.min(100, Math.max(10, val * rangeMultiplier)) / 100) * 140);
      return { x, y };
    });

    let path = `M ${coords[0].x},${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const cpX = (p0.x + p1.x) / 2;
      path += ` C ${cpX},${p0.y} ${cpX},${p1.y} ${p1.x},${p1.y}`;
    }
    return path;
  };

  const docPath = buildSvgPath(initialData.timeline.documents);
  const taskPath = buildSvgPath(initialData.timeline.tasks);
  const chatPath = buildSvgPath(initialData.timeline.chat);
  const evalPath = buildSvgPath(initialData.timeline.evaluations);

  return (
    <div className="space-y-6">
      {/* 1. Encabezado con Segmentos y Filtro Temporal (Panel 13 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Seguimiento de métricas y reportes
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Indicadores consolidados, evolución temporal, satisfacción y adopción de IA con datos reales.
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
        {/* KPI 1: Tiempo de Respuesta */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <p className="text-xs text-slate-500 font-medium">Tiempo de respuesta</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-mono">
              {tab === "operativo" ? initialData.responseTime.value : initialData.responseTime.value}
            </span>
            <span className="text-xs font-bold text-emerald-600">
              {initialData.responseTime.change}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{initialData.responseTime.detail}</p>
        </div>

        {/* KPI 2: Tasa de Finalización */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <p className="text-xs text-slate-500 font-medium">Tasa de finalización</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-mono">
              {tab === "emprendedor"
                ? `${Math.round((initialData.tabBreakdowns.entrepreneur.completedTasks / Math.max(1, initialData.tabBreakdowns.entrepreneur.totalTasks)) * 100)}%`
                : initialData.completionRate.value}
            </span>
            <span className="text-xs font-bold text-emerald-600">
              {initialData.completionRate.change}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            {tab === "emprendedor"
              ? `${initialData.tabBreakdowns.entrepreneur.completedTasks} de ${initialData.tabBreakdowns.entrepreneur.totalTasks} tareas`
              : initialData.completionRate.detail}
          </p>
        </div>

        {/* KPI 3: Uso de IA */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <p className="text-xs text-slate-500 font-medium">Uso de IA</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-mono">
              {initialData.aiAdoption.value}
            </span>
            <span className="text-xs font-bold text-emerald-600">
              {initialData.aiAdoption.change}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{initialData.aiAdoption.detail}</p>
        </div>

        {/* KPI 4: Satisfacción */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <p className="text-xs text-slate-500 font-medium">Satisfacción</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-mono">
              {initialData.satisfaction.value}
            </span>
            <span className="text-xs font-bold text-emerald-600">
              {initialData.satisfaction.change}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">{initialData.satisfaction.detail}</p>
        </div>
      </div>

      {/* Resumen Contextual según la pestaña seleccionada */}
      {tab !== "general" && (
        <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 flex items-center justify-between text-xs text-blue-900">
          {tab === "mentor" && (
            <div className="flex gap-6">
              <span><strong>{initialData.tabBreakdowns.mentor.sessionsCount}</strong> sesiones realizadas</span>
              <span><strong>{initialData.tabBreakdowns.mentor.activeProjects}</strong> proyectos acompañados</span>
              <span><strong>{initialData.tabBreakdowns.mentor.interventionsCount}</strong> intervenciones registradas</span>
            </div>
          )}
          {tab === "emprendedor" && (
            <div className="flex gap-6">
              <span><strong>{initialData.tabBreakdowns.entrepreneur.completedTasks}</strong> tareas completadas</span>
              <span><strong>{initialData.tabBreakdowns.entrepreneur.exercisesEvaluated}</strong> ejercicios evaluados por IA</span>
            </div>
          )}
          {tab === "operativo" && (
            <div className="flex gap-6">
              <span><strong>{initialData.tabBreakdowns.operations.totalAudits}</strong> eventos auditados</span>
              <span><strong>{initialData.tabBreakdowns.operations.aiInvocations}</strong> llamadas a n8n / OpenRouter</span>
              <span>Tasa de error: <strong>{initialData.tabBreakdowns.operations.errorRate}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* 3. Gráfico Interactivo de Evolución de Uso (Panel 13 del Mock) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Evolución de uso
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Volumen de interacciones por canal durante el ciclo (datos dinámicos de auditoría)
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
              d={docPath}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2.5"
            />
            {/* Curva 2: Tareas (Púrpura) */}
            <path
              d={taskPath}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2.5"
            />
            {/* Curva 3: Chat (Verde) */}
            <path
              d={chatPath}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
            />
            {/* Curva 4: Evaluaciones (Ámbar) */}
            <path
              d={evalPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2.5"
            />
          </svg>

          {/* Eje de Fechas (X) */}
          <div className="flex justify-between text-[11px] text-slate-400 font-mono mt-2 pt-2 border-t border-slate-100">
            {initialData.timeline.labels.map((lbl, idx) => (
              <span key={idx}>{lbl}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
