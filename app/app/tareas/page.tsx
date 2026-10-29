"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";

interface TaskItem {
  id: string;
  title: string;
  dueDate: string;
  status: "todo" | "doing" | "done";
  statusLabel: string;
}

type TabScope = "mis-tareas" | "equipo" | "seguimiento";
type FilterStatus = "todas" | "pendientes" | "en-progreso" | "completadas";

export default function TasksPage() {
  const [scope, setScope] = useState<TabScope>("mis-tareas");
  const [filter, setFilter] = useState<FilterStatus>("todas");

  const [tasks, setTasks] = useState<TaskItem[]>([
    {
      id: "t1",
      title: "Completar ejercicio PREP",
      dueDate: "20 Jun 2025",
      status: "doing",
      statusLabel: "En progreso",
    },
    {
      id: "t2",
      title: "Validar propuesta de valor",
      dueDate: "25 Jun 2025",
      status: "todo",
      statusLabel: "Pendiente",
    },
    {
      id: "t3",
      title: "Revisar plan de acción",
      dueDate: "18 Jun 2025",
      status: "todo",
      statusLabel: "Pendiente",
    },
    {
      id: "t4",
      title: "Enviar propuesta comercial",
      dueDate: "16 Jun 2025",
      status: "done",
      statusLabel: "Completada",
    },
    {
      id: "t5",
      title: "Analizar resultados de experimentos",
      dueDate: "12 Jun 2025",
      status: "done",
      statusLabel: "Completada",
    },
  ]);

  const toggleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const nextStatus = t.status === "done" ? "todo" : "done";
          return {
            ...t,
            status: nextStatus,
            statusLabel: nextStatus === "done" ? "Completada" : "Pendiente",
          };
        }
        return t;
      })
    );
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === "pendientes") return t.status === "todo";
    if (filter === "en-progreso") return t.status === "doing";
    if (filter === "completadas") return t.status === "done";
    return true;
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
            Seguimiento de compromisos, fechas límite, dependencias y alertas proactivas.
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
                {filteredTasks.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => toggleTask(t.id)}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={t.status === "done"}
                        onChange={() => {}}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cx(
                          "font-semibold",
                          t.status === "done" ? "line-through text-slate-400" : "text-slate-900"
                        )}
                      >
                        {t.title}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 font-mono">
                      {t.dueDate}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cx(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          t.status === "done"
                            ? "bg-emerald-100 text-emerald-800"
                            : t.status === "doing"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-amber-100 text-amber-800"
                        )}
                      >
                        {t.statusLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Columna Derecha: Recordatorios Inteligentes (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>🔔</span> Recordatorios inteligentes
              </h2>
              <p className="text-xs text-rose-600 font-semibold mt-1">
                Tienes 2 tareas próximas a vencer
              </p>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/60">
                <p className="text-xs font-bold text-slate-900">
                  Completar ejercicio PREP
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5 font-medium">
                  ⏳ Vence en 2 días (20 Jun)
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
                <p className="text-xs font-bold text-slate-900">
                  Reunión con cliente potencial
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  📅 Vence en 3 días (21 Jun)
                </p>
              </div>
            </div>

            {/* Sugerencia de IA (Panel 9 del Mock) */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                💡 Sugerencia de IA
              </span>
              <p className="text-xs text-slate-700 leading-relaxed">
                Considera revisar estos objetivos antes de la próxima sesión para alinear metas con tu mentor y destrabar objeciones.
              </p>
              <div className="pt-2">
                <Link
                  href="/app/sesiones"
                  className="inline-block px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs transition-colors"
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

