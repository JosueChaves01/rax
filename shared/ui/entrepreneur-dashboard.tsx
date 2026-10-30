"use client";

import Link from "next/link";
import type { Workspace } from "@/lib/services/projects";
import type { AuditEvent } from "@/types/domain";
import { formatDate } from "@/shared/ui/primitives";

interface EntrepreneurDashboardProps {
  entrepreneurName: string;
  mentorName?: string;
  workspaces: Workspace[];
  recentAudits?: AuditEvent[];
}

export function EntrepreneurDashboard({
  entrepreneurName,
  mentorName,
  workspaces,
  recentAudits = [],
}: EntrepreneurDashboardProps) {
  const firstName = entrepreneurName.split(" ")[0] || "Emprendedor/a";
  const primaryWorkspace = workspaces[0];

  const goalsCount = primaryWorkspace?.mentorshipGoals?.filter((g) => g.status !== "discarded").length ?? 0;
  const pendingTasksCount = primaryWorkspace?.tasks?.filter((t) => t.status !== "done").length ?? 0;
  const totalTasks = primaryWorkspace?.tasks?.length || 0;
  const doneTasks = primaryWorkspace?.tasks?.filter((t) => t.status === "done").length || 0;
  const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Pasos del proceso basados en la fase real del proyecto
  const phase = primaryWorkspace?.phase;
  const phaseOrder: Record<string, number> = {
    exploration: 1,
    diagnosis: 2,
    action_plan: 3,
    execution: 4,
    evaluation: 5,
  };
  const currentStepNum = phase ? (phaseOrder[phase] ?? 1) : 1;

  const processSteps = [
    { num: 1, title: "Exploración", done: currentStepNum > 1, isCurrent: currentStepNum === 1 },
    { num: 2, title: "Diagnóstico", done: currentStepNum > 2, isCurrent: currentStepNum === 2 },
    { num: 3, title: "Objetivos", done: currentStepNum > 3, isCurrent: currentStepNum === 3 },
    { num: 4, title: "Plan de acción", done: currentStepNum > 4, isCurrent: currentStepNum === 4 },
    { num: 5, title: "Ejecución", done: currentStepNum > 5, isCurrent: currentStepNum === 5 },
  ];

  const nextTask = primaryWorkspace?.tasks?.find((t) => t.status !== "done");

  const recentActivities = recentAudits.slice(0, 5).map((a) => {
    let title = `Acción registrada: ${a.action}`;
    let icon = "📝";
    let href = "/app";

    if (a.action.includes("task")) {
      title = "Actualización en hoja de tareas";
      icon = "✅";
      href = "/app/tareas";
    } else if (a.action.includes("session")) {
      title = "Encuentro de mentoría coordinado";
      icon = "📅";
      href = "/app/sesiones";
    } else if (a.action.includes("ai") || a.action.includes("proposal")) {
      title = "Propuesta o recomendación de IA recibida";
      icon = "💡";
      href = "/app/sugerencias";
    } else if (a.action.includes("resource")) {
      title = "Material de biblioteca actualizado";
      icon = "📚";
      href = "/app/documentos";
    }

    return {
      title,
      time: formatDate(a.createdAt),
      icon,
      href,
    };
  });

  return (
    <div className="space-y-6">
      {/* 1. Encabezado de Bienvenida */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Hola, {firstName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {mentorName ? (
              <>Tu mentor asignado es <span className="font-semibold text-blue-600">{mentorName}</span></>
            ) : (
              <>Aún no tienes un mentor asignado · <Link href="/app/exploracion" className="text-blue-600 font-semibold hover:underline">Iniciar exploración</Link></>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/chat"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <span>💬 Conversar con RAX</span>
          </Link>
        </div>
      </div>

      {/* 2. Cuadrícula de 3 Tarjetas de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KPI 1: Objetivos activos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center text-xl shrink-0">
            🎯
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{goalsCount}</p>
            <p className="text-xs text-slate-500 font-medium">Objetivos activos</p>
          </div>
        </div>

        {/* KPI 2: Tareas pendientes */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center text-xl shrink-0">
            📋
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{pendingTasksCount}</p>
            <p className="text-xs text-slate-500 font-medium">Tareas pendientes</p>
          </div>
        </div>

        {/* KPI 3: Progreso general */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center text-xl shrink-0">
            📈
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{progressPercent}%</p>
            <p className="text-xs text-slate-500 font-medium">Progreso general</p>
          </div>
        </div>
      </div>

      {/* 3. Stepper de Proceso de Mentoría */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Tu proceso de mentoría
          </h2>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            {currentStepNum > 4 ? "Completado" : "En curso"}
          </span>
        </div>

        {/* Stepper visual horizontal */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          {processSteps.map((step) => (
            <div
              key={step.num}
              className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
                step.isCurrent
                  ? "bg-blue-50 border-blue-200 ring-2 ring-blue-500/20"
                  : step.done
                    ? "bg-emerald-50/50 border-emerald-200 text-emerald-900"
                    : "bg-slate-50 border-slate-200 text-slate-600"
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                  step.isCurrent
                    ? "bg-blue-600 text-white"
                    : step.done
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-200 text-slate-700"
                }`}
              >
                {step.done ? "✓" : step.num}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate text-slate-900">
                  {step.title}
                </p>
                <p className="text-[10px] text-slate-500">
                  {step.done ? "Completado" : step.isCurrent ? "En curso" : "Próximo"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Doble Columna: Tu próximo paso + Actividad reciente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna Izquierda: Tu próximo paso */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                Tu próximo paso
              </span>
              {nextTask?.dueDate && (
                <span className="text-xs text-slate-500 font-medium">
                  Vence: {formatDate(nextTask.dueDate)}
                </span>
              )}
            </div>

            {nextTask ? (
              <div className="mt-5 p-5 rounded-2xl bg-gradient-to-br from-blue-50/80 to-indigo-50/50 border border-blue-100">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-200/60 text-blue-800">
                  Tarea asignada
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-2">
                  {nextTask.title}
                </h3>
                {nextTask.blockedReason && (
                  <p className="text-xs text-rose-600 mt-2 leading-relaxed">
                    ⚠️ Bloqueo reportado: {nextTask.blockedReason}
                  </p>
                )}

                <div className="mt-4 pt-4 border-t border-blue-200/50 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Estado: {nextTask.status === "doing" ? "En curso" : "Pendiente"}
                  </span>
                  <Link
                    href="/app/tareas"
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
                  >
                    Ver tarea →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-5 p-6 rounded-2xl bg-slate-50 border border-slate-200/80 text-center">
                <p className="text-xs text-slate-500">
                  No tienes tareas pendientes en este momento.
                </p>
                <Link
                  href="/app/tareas"
                  className="mt-3 inline-block px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  Ir a tareas
                </Link>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <Link
              href="/app/tareas"
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Ver todas las tareas y hoja de ruta →
            </Link>
          </div>
        </div>

        {/* Columna Derecha: Actividad reciente */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Actividad reciente
              </h2>
              <span className="text-xs text-slate-500 font-mono">Últimas 48 h</span>
            </div>

            {recentActivities.length > 0 ? (
              <div className="mt-4 space-y-3">
                {recentActivities.map((act, idx) => (
                  <Link
                    key={idx}
                    href={act.href}
                    className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors flex items-start gap-3 group block"
                  >
                    <span className="text-lg shrink-0 mt-0.5">{act.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {act.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                        {act.time}
                      </p>
                    </div>
                    <span className="text-slate-400 group-hover:text-slate-600 text-xs transition-colors">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-8 text-center text-slate-500 text-xs py-8">
                Sin actividad reciente registrada en las últimas 48 horas.
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <Link
              href="/app/documentos"
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Explorar centro de documentos y plantillas
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
