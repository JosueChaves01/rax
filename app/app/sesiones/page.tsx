"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";

type SessionTab = "agenda" | "notas" | "documentos" | "tareas";

export default function SessionViewPage() {
  const [activeTab, setActiveTab] = useState<SessionTab>("agenda");
  const [isEditingAgenda, setIsEditingAgenda] = useState(false);

  const [agendaItems] = useState([
    { id: 1, title: "1. Revisión de avances", duration: "15 min", desc: "Verificación de tareas completadas y hallazgos en entrevistas con clientes." },
    { id: 2, title: "2. Discusión de bloqueos", duration: "20 min", desc: "Análisis del obstáculo en la tasa de respuesta de correos fríos." },
    { id: 3, title: "3. Plan de acción", duration: "15 min", desc: "Definición del nuevo experimento de mensajería con método PREP." },
    { id: 4, title: "4. Cierre y próximos pasos", duration: "10 min", desc: "Acuerdos rubricados y asignación de responsables para la siguiente quincena." },
  ]);

  return (
    <div className="space-y-6">
      {/* 1. Encabezado de Sesión (Panel 6 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              Encuentro activo
            </span>
            <span className="text-xs text-slate-400 font-mono">14 de Junio, 10:00 - 11:00</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Sesión de mentoría — Ana Torres
          </h1>
          <p className="text-xs text-slate-500">
            Mentor: Carlos Méndez • Modalidad: Videollamada virtual
          </p>
        </div>

        {/* Pestañas: [Agenda] | [Notas] | [Documentos] | [Tareas] */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          {(
            [
              ["agenda", "Agenda"],
              ["notas", "Notas"],
              ["documentos", "Documentos"],
              ["tareas", "Tareas"],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                activeTab === tab
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Distribución en 2 Columnas (Panel 6 del Mock) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Agenda propuesta por IA (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Agenda propuesta por IA
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Estructurada en bloques de tiempo (timeboxes)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingAgenda(!isEditingAgenda)}
                className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                {isEditingAgenda ? "Guardar agenda" : "Editar agenda"}
              </button>
            </div>

            <div className="space-y-3">
              {agendaItems.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900">
                      {item.title}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded-md bg-white border border-slate-200 text-xs font-mono font-semibold text-slate-700 shrink-0">
                    {item.duration}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-blue-800">
              💡 <strong>Basado en:</strong> objetivos acordados, tareas pendientes de la última semana y diagnósticos previos de RAX.
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-xs"
            >
              Iniciar sesión virtual →
            </button>
          </div>
        </div>

        {/* Columna Derecha: Contexto Relevante (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Contexto relevante
              </h2>
              <span className="text-xs text-slate-400">Resumen en vivo</span>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Objetivo del ciclo
                </p>
                <p className="text-xs font-bold text-slate-900 mt-1">
                  Validar propuesta de valor con clientes
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Último avance</span>
                  <span className="font-mono text-emerald-600 font-bold">75%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full w-3/4" />
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Bloqueos reportados
                </p>
                <p className="text-xs font-semibold text-rose-600 mt-1">
                  ⚠️ Comunicación con clientes en fase de prospección
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Tareas pendientes
                </p>
                <p className="text-xs font-bold text-slate-800 mt-1">
                  2 tareas requieren revisión en este encuentro
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <Link
              href="/app/tareas"
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Ver contexto completo y expediente →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
