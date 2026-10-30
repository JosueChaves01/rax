"use client";

import { useState } from "react";
import { cx } from "@/shared/ui/primitives";

export type MetricTab = "general" | "mentor" | "emprendedor" | "operativo";

export interface ReportMetricsData {
  responseTime: {
    value: string;
    detail: string;
  };
  completionRate: {
    value: string;
    detail: string;
  };
  aiInvocations: {
    value: string;
    detail: string;
  };
  satisfaction: {
    value: string;
    detail: string;
  };
  timeline: {
    labels: string[];
    resources: number[];
    tasks: number[];
    aiInvocations: number[];
    evaluations: number[];
  };
  tabBreakdowns: {
    mentor: { sessionsCount: number; activeProjects: number; interventionsCount: number };
    entrepreneur: { completedTasks: number; totalTasks: number; aiInvocations: number };
    operations: { totalAudits: number; aiInvocations: number; errorEvents: number };
  };
}

interface ReportsViewProps {
  initialData: ReportMetricsData;
}

export function ReportsView({ initialData }: ReportsViewProps) {
  const [tab, setTab] = useState<MetricTab>("general");

  const allTimelineValues = [
    ...initialData.timeline.resources,
    ...initialData.timeline.tasks,
    ...initialData.timeline.aiInvocations,
    ...initialData.timeline.evaluations,
  ];
  const timelineMax = Math.max(0, ...allTimelineValues);
  const hasTimelineData = timelineMax > 0;

  // Show event counts, scaled against the largest observed bucket in this 30-day window.
  const buildSvgPath = (points: number[]) => {
    if (!points || points.length === 0) return "";
    const stepX = 600 / (points.length - 1);
    const coords = points.map((val, idx) => {
      const x = Math.round(idx * stepX);
      const y = Math.round(180 - (timelineMax > 0 ? val / timelineMax : 0) * 140);
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

  const resourcePath = buildSvgPath(initialData.timeline.resources);
  const taskPath = buildSvgPath(initialData.timeline.tasks);
  const aiPath = buildSvgPath(initialData.timeline.aiInvocations);
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
            Recuento de tareas, eventos de IA y actividad registrada. Las métricas sin fuente aparecen como «—».
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
          </div>
          <p className="text-[10px] text-slate-500 mt-1">{initialData.responseTime.detail}</p>
        </div>

        {/* KPI 2: Tasa de Finalización */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <p className="text-xs text-slate-500 font-medium">Tasa de finalización</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-mono">
              {tab === "emprendedor"
                ? initialData.tabBreakdowns.entrepreneur.totalTasks > 0
                  ? `${Math.round((initialData.tabBreakdowns.entrepreneur.completedTasks / initialData.tabBreakdowns.entrepreneur.totalTasks) * 100)}%`
                  : "—"
                : initialData.completionRate.value}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {tab === "emprendedor"
              ? `${initialData.tabBreakdowns.entrepreneur.completedTasks} de ${initialData.tabBreakdowns.entrepreneur.totalTasks} tareas`
              : initialData.completionRate.detail}
          </p>
        </div>

        {/* KPI 3: Invocaciones de IA registradas */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <p className="text-xs text-slate-500 font-medium">Invocaciones de IA</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-mono">
              {initialData.aiInvocations.value}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">{initialData.aiInvocations.detail}</p>
        </div>

        {/* KPI 4: Satisfacción */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-colors">
          <p className="text-xs text-slate-500 font-medium">Satisfacción</p>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-3xl font-black text-slate-900 font-mono">
              {initialData.satisfaction.value}
            </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">{initialData.satisfaction.detail}</p>
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
              <span><strong>{initialData.tabBreakdowns.entrepreneur.aiInvocations}</strong> invocaciones de IA registradas</span>
            </div>
          )}
          {tab === "operativo" && (
            <div className="flex gap-6">
              <span><strong>{initialData.tabBreakdowns.operations.totalAudits}</strong> eventos auditados</span>
              <span><strong>{initialData.tabBreakdowns.operations.aiInvocations}</strong> invocaciones de IA registradas</span>
              <span><strong>{initialData.tabBreakdowns.operations.errorEvents}</strong> errores o accesos denegados registrados</span>
            </div>
          )}
        </div>
      )}

      {/* 3. Conteos reales por período */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Actividad registrada en los últimos 30 días
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Recuento en cinco períodos de seis días. El eje vertical muestra eventos, no porcentajes.
            </p>
          </div>

          {hasTimelineData && <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              Recursos
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              Tareas
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Invocaciones de IA
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              Evaluaciones
            </span>
          </div>}
        </div>

        {hasTimelineData ? <div className="w-full h-64 pt-4 flex gap-3">
          <div className="flex flex-col justify-between text-[10px] text-slate-500 font-mono pb-7">
            <span>{timelineMax}</span>
            <span>{Math.ceil(timelineMax / 2)}</span>
            <span>0</span>
          </div>
          <div className="flex-1 min-w-0">
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

            {/* Recursos */}
            <path
              d={resourcePath}
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
            {/* Invocaciones de IA */}
            <path
              d={aiPath}
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
          <div className="flex justify-between text-[11px] text-slate-500 font-mono mt-2 pt-2 border-t border-slate-100">
            {initialData.timeline.labels.map((lbl, idx) => (
              <span key={idx}>{lbl}</span>
            ))}
          </div>
          </div>
        </div> : (
          <div className="p-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
            No hay actividad registrada en este período.
          </div>
        )}
      </div>
    </div>
  );
}
