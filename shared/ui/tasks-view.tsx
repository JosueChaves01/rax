"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cx, formatDate } from "@/shared/ui/primitives";
import type { Task, TaskStatus } from "@/types/domain";
import { setTaskStatusAction, requestTaskProposalsAction } from "@/app/actions";

interface TasksViewProps {
  initialTasks: Task[];
  projectId: string;
  projectName?: string;
}

type TabScope = "mis-tareas" | "equipo" | "seguimiento";
type FilterStatus = "todas" | "pendientes" | "en-progreso" | "completadas";

export function TasksView({ initialTasks, projectId, projectName }: TasksViewProps) {
  const [scope, setScope] = useState<TabScope>("mis-tareas");
  const [filter, setFilter] = useState<FilterStatus>("todas");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [isPending, startTransition] = useTransition();
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const toggleTask = (task: Task) => {
    const nextStatus: TaskStatus = task.status === "done" ? "todo" : "done";
    // Optimistic local update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

    startTransition(async () => {
      try {
        const res = await setTaskStatusAction(task.projectId || projectId, task.id, nextStatus);
        if (!res.ok) {
          // Rollback on error
          setTasks((prev) =>
            prev.map((t) => (t.id === task.id ? { ...t, status: task.status } : t))
          );
          setActionNotice(`Error al actualizar estado: ${res.error}`);
        }
      } catch (err) {
        setActionNotice(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  };

  const handleRequestN8nProposals = () => {
    startTransition(async () => {
      setActionNotice(null);
      try {
        const res = await requestTaskProposalsAction(projectId);
        if (res.ok) {
          setActionNotice(
            "✓ Evento despachado al flujo de n8n (RAX-08). Las propuestas generadas requerirán aprobación del mentor."
          );
        } else {
          setActionNotice(`Aviso n8n: ${res.error}`);
        }
      } catch (err) {
        setActionNotice(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === "pendientes") return t.status === "todo";
    if (filter === "en-progreso") return t.status === "doing";
    if (filter === "completadas") return t.status === "done";
    return true;
  });

  // Cálculo dinámico de recordatorios inteligentes (RAX-10)
  const now = Date.now();
  const twoDaysMs = 48 * 60 * 60 * 1000;
  const urgentTasks = tasks.filter((t) => {
    if (t.status === "done") return false;
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate).getTime();
    return due - now <= twoDaysMs; // overdue or within 48h
  });

  return (
    <div className="space-y-6">
      {/* 1. Encabezado y Pestañas de Ámbito (Panel 9 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Tareas, recordatorios y accountability
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Proyecto: <span className="font-semibold text-slate-700">{projectName || "Principal"}</span> • Seguimiento de compromisos, fechas límite y alertas proactivas.
          </p>
        </div>

        {/* Pestañas: [Mis tareas] | [De mi equipo] | [Seguimiento] */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          {(
            [
              ["mis-tareas", "Mis tareas"],
              ["equipo", "De mi equipo"],
              ["seguimiento", "Seguimiento"],
            ] as const
          ).map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={cx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                scope === s
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {actionNotice && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 text-xs text-blue-900 rounded-xl">
          {actionNotice}
        </div>
      )}

      {/* 2. Píldoras de Filtro por Estado */}
      <div className="flex items-center gap-1.5">
        {(
          [
            ["todas", "Todas"],
            ["pendientes", "Pendientes"],
            ["en-progreso", "En progreso"],
            ["completadas", "Completadas"],
          ] as const
        ).map(([f, label]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cx(
              "px-3 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer",
              filter === f
                ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 3. Distribución en 2 Columnas (Panel 9 del Mock) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Tabla de Tareas (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          {filteredTasks.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs">
              No hay tareas registradas para el filtro seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th scope="col" className="px-4 py-3 w-10">
                      <span className="sr-only">Estado</span>
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Tarea
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Fecha límite
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTasks.map((t) => {
                    const isDone = t.status === "done";
                    const isOverdue =
                      !isDone && t.dueDate && new Date(t.dueDate).getTime() < now;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => toggleTask(t)}
                        className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3.5">
                          <input
                            type="checkbox"
                            checked={isDone}
                            disabled={isPending}
                            onChange={() => {}}
                            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={cx(
                              "font-semibold",
                              isDone
                                ? "line-through text-slate-400"
                                : "text-slate-900"
                            )}
                          >
                            {t.title}
                          </span>
                          {t.blockedReason && (
                            <p className="text-[11px] text-rose-600 mt-0.5">
                              ⚠️ Bloqueo: {t.blockedReason}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-slate-500 font-mono">
                          {t.dueDate ? formatDate(t.dueDate) : "Sin fecha"}
                          {isOverdue && (
                            <span className="ml-1 text-[10px] font-bold text-rose-600">
                              (Vencida)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={cx(
                              "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                              isDone
                                ? "bg-emerald-100 text-emerald-800"
                                : t.status === "doing"
                                  ? "bg-blue-100 text-blue-800"
                                  : t.status === "blocked"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-amber-100 text-amber-800"
                            )}
                          >
                            {isDone
                              ? "Completada"
                              : t.status === "doing"
                                ? "En progreso"
                                : t.status === "blocked"
                                  ? "Bloqueada"
                                  : "Pendiente"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Columna Derecha: Recordatorios Inteligentes (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>🔔</span> Recordatorios inteligentes (RAX-10)
              </h2>
              <p
                className={cx(
                  "text-xs font-semibold mt-1",
                  urgentTasks.length > 0 ? "text-rose-600" : "text-emerald-600"
                )}
              >
                {urgentTasks.length > 0
                  ? `Tienes ${urgentTasks.length} tarea${urgentTasks.length > 1 ? "s" : ""} próxima${urgentTasks.length > 1 ? "s" : ""} a vencer o en riesgo`
                  : "Todos tus compromisos están al día"}
              </p>
            </div>

            <div className="space-y-3">
              {urgentTasks.length > 0 ? (
                urgentTasks.map((u) => {
                  const dueMs = u.dueDate ? new Date(u.dueDate).getTime() : now;
                  const diffHours = Math.round((dueMs - now) / (1000 * 60 * 60));
                  const isLate = diffHours < 0;
                  return (
                    <div
                      key={u.id}
                      className={cx(
                        "p-3.5 rounded-xl border",
                        isLate
                          ? "border-rose-200 bg-rose-50/60"
                          : "border-amber-200 bg-amber-50/60"
                      )}
                    >
                      <p className="text-xs font-bold text-slate-900">{u.title}</p>
                      <p
                        className={cx(
                          "text-[11px] mt-0.5 font-medium",
                          isLate ? "text-rose-800" : "text-amber-800"
                        )}
                      >
                        {isLate
                          ? `⚠️ Venció hace ${Math.abs(diffHours)}h (${u.dueDate ? formatDate(u.dueDate) : ""})`
                          : `⏳ Vence en ${diffHours}h (${u.dueDate ? formatDate(u.dueDate) : ""})`}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 text-slate-500 text-xs">
                  Sin alertas urgentes de vencimiento en las próximas 48 horas.
                </div>
              )}
            </div>

            {/* Sugerencia de IA (Panel 9 del Mock + RAX-08) */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                💡 Sugerencia de IA (Flujo RAX-08)
              </span>
              <p className="text-xs text-slate-700 leading-relaxed">
                Considera solicitar a n8n la generación de compromisos accionables basados en los objetivos de la mentoría.
              </p>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleRequestN8nProposals}
                  className="w-full px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50 text-center"
                >
                  {isPending ? "Contactando n8n…" : "↻ Proponer tareas con n8n"}
                </button>
                <Link
                  href="/app/sesiones"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold text-center transition-colors"
                >
                  Ir al plan de sesión →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
