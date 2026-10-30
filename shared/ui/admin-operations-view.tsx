"use client";

import { useEffect, useState } from "react";
import { cx } from "@/shared/ui/primitives";

type OpSubTab = "general" | "openrouter" | "logs" | "metricas" | "configuracion";

interface N8nHealthState {
  checked: boolean;
  online: boolean;
  latencyMs?: number;
  baseUrl?: string;
  error?: string;
}

export interface OperationRun {
  workflow: string;
  status: "completed" | "running" | "failed";
  statusLabel: string;
  latency?: string;
  date: string;
}

interface AdminOperationsViewProps {
  initialRuns?: OperationRun[];
  totalExecutions?: number;
  estimatedCost?: string;
  successRate?: string;
}

export function AdminOperationsView({
  initialRuns = [],
  totalExecutions = 0,
  estimatedCost = "$0.00",
  successRate = "100%",
}: AdminOperationsViewProps) {
  const [subTab, setSubTab] = useState<OpSubTab>("general");
  const [health, setHealth] = useState<N8nHealthState>({
    checked: false,
    online: false,
  });
  const [isChecking, setIsChecking] = useState(false);

  const checkHealth = async () => {
    setIsChecking(true);
    try {
      const res = await fetch("/api/n8n/health", { cache: "no-store" });
      const data = await res.json();
      const live = data?.n8nIntegration?.liveHealth;
      setHealth({
        checked: true,
        online: Boolean(live?.ok),
        latencyMs: live?.latencyMs,
        baseUrl: live?.baseUrl || data?.n8nIntegration?.baseUrl,
        error: live?.error,
      });
    } catch (err) {
      setHealth({
        checked: true,
        online: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const recentRuns = initialRuns;

  return (
    <div className="space-y-6">
      {/* 1. Sub-pestañas de Operaciones (Panel 10 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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

        <button
          type="button"
          disabled={isChecking}
          onClick={checkHealth}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
        >
          {isChecking ? "Verificando ping…" : "↻ Verificar conexión"}
        </button>
      </div>

      {/* 2. Tarjetas de Estado Superior: n8n & OpenRouter */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* n8n */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-900">Estado de n8n (Túnel & Webhooks)</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {health.checked
                ? health.online
                  ? `Conectado · Latencia: ${health.latencyMs ?? 150}ms · ${health.baseUrl || ""}`
                  : `Sin respuesta del webhook (${health.error || "offline"})`
                : "Comprobando conexión..."}
            </p>
          </div>
          <span
            className={cx(
              "px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5",
              health.online
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            )}
          >
            <span
              className={cx(
                "w-1.5 h-1.5 rounded-full",
                health.online
                  ? "bg-emerald-600 animate-pulse"
                  : "bg-amber-600"
              )}
            />
            {health.online ? "Conectado" : "Verificando"}
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
          <span className="text-xs text-slate-500 font-mono">Últimas 24 horas</span>
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
              {recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500 font-medium">
                    Sin ejecuciones registradas en las últimas 24 horas.
                  </td>
                </tr>
              ) : (
                recentRuns.map((run, i) => (
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
                      {run.latency || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">
                      {run.date}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Barra de Métricas Inferiores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Latencia promedio
          </p>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {health.latencyMs ? `${(health.latencyMs / 1000).toFixed(2)}s` : "—"}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Total ejecuciones
          </p>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {totalExecutions.toLocaleString()}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Costo estimado
          </p>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {estimatedCost}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs text-center">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Tasa de éxito
          </p>
          <p className="text-2xl font-bold font-mono text-emerald-600 mt-1">
            {successRate}
          </p>
        </div>
      </div>
    </div>
  );
}
