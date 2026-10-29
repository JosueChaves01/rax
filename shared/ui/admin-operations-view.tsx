"use client";

import { useState } from "react";
import { cx } from "@/shared/ui/primitives";

type OpSubTab = "general" | "openrouter" | "logs" | "metricas" | "configuracion";

export function AdminOperationsView() {
  const [subTab, setSubTab] = useState<OpSubTab>("general");

  const recentRuns = [
    {
      workflow: "n8n-02 Mentor Chat",
      status: "completed",
      statusLabel: "Completado",
      latency: "1.2s",
      date: "14 Jun 11:20",
    },
    {
      workflow: "n8n-01 Sesión",
      status: "completed",
      statusLabel: "Completado",
      latency: "2.8s",
      date: "14 Jun 09:50",
    },
    {
      workflow: "n8n-03 Tareas",
      status: "running",
      statusLabel: "En ejecución",
      latency: "45.2s",
      date: "14 Jun 09:12",
    },
    {
      workflow: "n8n-02 Reintento",
      status: "failed",
      statusLabel: "Fallido",
      latency: "18.7s",
      date: "14 Jun 08:30",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Sub-pestañas de Operaciones (Panel 10 del Mock) */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 w-fit">
        {(
          [
            ["general", "General"],
            ["openrouter", "OpenRouter"],
            ["logs", "Logs"],
            ["metricas", "Métricas"],
            ["configuracion", "Configuración"],
          ] as const
        ).map(([st, label]) => (
          <button
            key={st}
            type="button"
            onClick={() => setSubTab(st)}
            className={cx(
              "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
              subTab === st
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-500 hover:text-slate-900"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 2. Tarjetas de Estado Superior: n8n & OpenRouter */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* n8n */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-900">Estado de n8n</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Última ejecución: hace 2m
            </p>
          </div>
          <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-100 text-emerald-800 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Conectado
          </span>
        </div>

        {/* OpenRouter */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-900">OpenRouter</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Modelos: GPT-4o, Claude 3.5 Sonnet, Llama 3.3
            </p>
          </div>
          <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-100 text-emerald-800 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Conectado
          </span>
        </div>
      </div>

      {/* 3. Tabla de Ejecuciones Recientes (Panel 10 del Mock) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">
            Ejecuciones recientes
          </h2>
          <span className="text-xs text-slate-400 font-mono">Últimas 24 horas</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th scope="col" className="px-4 py-2.5">Workflow</th>
                <th scope="col" className="px-4 py-2.5">Estado</th>
                <th scope="col" className="px-4 py-2.5">Latencia</th>
                <th scope="col" className="px-4 py-2.5">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentRuns.map((run, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {run.workflow}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cx(
                        "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        run.status === "completed"
                          ? "bg-emerald-100 text-emerald-800"
                          : run.status === "running"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-rose-100 text-rose-800"
                      )}
                    >
                      {run.statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">
                    {run.latency}
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono">
                    {run.date}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Barra de Métricas Inferiores (Panel 10 del Mock) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Latencia promedio
          </p>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
            16.8s
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total ejecuciones
          </p>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
            12,340
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Costo estimado
          </p>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
            $50.32
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Tasa de éxito
          </p>
          <p className="text-2xl font-bold font-mono text-emerald-600 mt-1">
            98%
          </p>
        </div>
      </div>
    </div>
  );
}

