"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cx, formatDate } from "@/shared/ui/primitives";
import type { MentorSession, MentorshipGoal, Project } from "@/types/domain";
import { generatePreSessionBriefingAction } from "@/app/actions";

interface SessionsViewProps {
  initialSessions: MentorSession[];
  projects: Project[];
  goals: MentorshipGoal[];
}

export function SessionsView({ initialSessions, projects, goals }: SessionsViewProps) {
  const [sessions, setSessions] = useState<MentorSession[]>(initialSessions);
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    initialSessions[0]?.id || ""
  );
  const [isPending, startTransition] = useTransition();
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const activeSession = sessions.find((s) => s.id === selectedSessionId) || sessions[0];
  const activeProject = projects.find((p) => p.id === activeSession?.projectId);
  const activeGoals = goals.filter((g) => g.status !== "discarded");

  // La agenda se muestra solo cuando existe en el briefing persistido de la sesión.
  const agendaList = activeSession?.preSessionBriefing?.suggestedAgenda?.length
    ? activeSession.preSessionBriefing.suggestedAgenda.map((item, idx) => ({
        id: idx + 1,
        title: item,
        desc: "Punto estratégico estructurado para el encuentro.",
      }))
    : [];

  const handleGenerateAgendaWithN8n = () => {
    if (!activeSession) return;
    startTransition(async () => {
      setActionNotice(null);
      try {
        const res = await generatePreSessionBriefingAction(activeSession.projectId, activeSession.id);
        if (res.ok && res.data) {
          setActionNotice("✓ Briefing y agenda generados y guardados en esta sesión.");
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeSession.id ? { ...s, preSessionBriefing: res.data } : s
            )
          );
        } else {
          setActionNotice("No se pudo generar el briefing. El servicio de IA no devolvió un resultado.");
        }
      } catch (err: unknown) {
        setActionNotice(`Aviso: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Encabezado de Sesión */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              {activeSession ? (activeSession.status === "completed" ? "Completada" : "Encuentro activo") : "Sin sesiones"}
            </span>
            <span className="text-xs text-slate-500 font-mono">
              {activeSession?.scheduledAt ? formatDate(activeSession.scheduledAt) : "Programación flexible"}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            Sesión de mentoría — {activeProject?.name || "Proyecto Activo"}
          </h1>
          <p className="text-xs text-slate-500">
            Tipo: {activeSession?.kind || "first_review"} • Preparación asistida por IA de RAX
          </p>
          {sessions.length > 1 && (
            <div className="flex items-center gap-1.5 mt-2 overflow-x-auto">
              {sessions.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSessionId(s.id)}
                  className={cx(
                    "px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer",
                    activeSession?.id === s.id
                      ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  Sesión #{idx + 1}
                </button>
              ))}
            </div>
          )}
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
              disabled={tab !== "agenda"}
              title={tab !== "agenda" ? "Esta vista todavía no está disponible." : undefined}
              className={cx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                tab === "agenda"
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
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Estructurada en bloques de tiempo (timeboxes)
                </p>
              </div>
              <button
                type="button"
                disabled={isPending || !activeSession}
                onClick={handleGenerateAgendaWithN8n}
                className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer disabled:opacity-50"
              >
                {isPending ? "Generando…" : "↻ Regenerar agenda"}
              </button>
            </div>

            <div className="space-y-3">
              {agendaList.length > 0 ? (
                agendaList.map((item) => (
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
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-200 rounded-xl">
                  {activeSession
                    ? "No se ha generado una agenda aún. Pulsa «Regenerar agenda» para preparar una propuesta a partir del contexto del proyecto."
                    : "No hay una sesión activa seleccionada."}
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-100 text-xs text-blue-800">
              💡 <strong>Contexto disponible:</strong> objetivos registrados y agenda guardada en el briefing de esta sesión.
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
            {activeProject ? (
              <Link
                href={`/app/p/${activeProject.id}/orientar`}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-xs"
              >
                Abrir sala de notas del proyecto →
              </Link>
            ) : (
              <span className="text-xs text-slate-500">Selecciona un proyecto para abrir notas</span>
            )}
          </div>
        </div>

        {/* Columna Derecha: Contexto Relevante Real (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Contexto relevante
              </h2>
              <span className="text-xs text-slate-500 font-mono">Datos registrados</span>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Objetivo principal activo
                </p>
                <p className="text-xs font-bold text-slate-900 mt-1">
                  {activeGoals[0]?.title || "Sin objetivos registrados aún"}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                  <span>Progreso del ciclo</span>
                  <span className="font-mono text-emerald-700 font-bold">
                    {activeGoals.length > 0
                      ? `${Math.round(
                          (activeGoals.filter((g) => g.status === "achieved").length / activeGoals.length) * 100
                        )}%`
                      : "0%"}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all"
                    style={{
                      width:
                        activeGoals.length > 0
                          ? `${Math.round(
                              (activeGoals.filter((g) => g.status === "achieved").length / activeGoals.length) * 100
                            )}%`
                          : "0%",
                    }}
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Diagnóstico y bloqueos
                </p>
                <p className="text-xs font-semibold text-slate-700 mt-1">
                  {activeSession?.preSessionBriefing?.pendingTopicsSummary
                    ? `⚠️ ${activeSession.preSessionBriefing.pendingTopicsSummary}`
                    : "Sin bloqueos pendientes reportados"}
                </p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/60">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Compromisos pactados
                </p>
                <p className="text-xs font-bold text-slate-800 mt-1">
                  {activeGoals.length} objetivos registrados en el acuerdo
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <Link
              href="/app/tareas"
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Ver hoja de ruta y tareas pendientes →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
