"use client";

import Link from "next/link";
import type { MentorPortfolio } from "@/lib/services/portfolio";

interface MentorDashboardProps {
  mentorName: string;
  portfolio: MentorPortfolio;
}

export function MentorDashboard({ mentorName, portfolio }: MentorDashboardProps) {
  const firstName = mentorName.split(" ")[0] || "Mentor";

  // Estadísticas basadas en la cartera real o defaults del mock
  const activeCount = portfolio.stats.totalActiveProjects || 5;
  const sessionsCount = portfolio.stats.upcomingSessionsCount || 3;
  const pendingCount = portfolio.stats.projectsNeedingAttention || 8;
  const avgProgress = 92;

  // Emprendedores de la cartera
  const defaultMentees = [
    { name: "Ana Torres", sector: "Growth", stage: "En proceso", progress: 68, id: "p-ana" },
    { name: "Carlos Méndez", sector: "SaaS", stage: "En proceso", progress: 52, id: "p-carlos" },
    { name: "Lucía Fernández", sector: "E-commerce", stage: "En seguimiento", progress: 37, id: "p-lucia" },
    { name: "Diego Rojas", sector: "Servicios", stage: "En proceso", progress: 71, id: "p-diego" },
  ];

  const mentees = portfolio.projects.length > 0
    ? portfolio.projects.map((p) => ({
        id: p.projectId,
        name: p.entrepreneurName || p.projectName,
        sector: p.projectName,
        stage: p.stage === "exploration" ? "Exploración" : p.stage === "diagnosis" ? "Diagnóstico" : "En proceso",
        progress: Math.min(100, Math.round(((p.completedTasksCount || 1) / Math.max(1, p.totalTasksCount || 3)) * 100)),
      }))
    : defaultMentees;

  // Próximas sesiones
  const upcomingSessions = [
    {
      timeBadge: "Hoy · 11:00 - 12:00",
      mentee: "Ana Torres",
      topic: "Estrategia de crecimiento",
      isToday: true,
      href: "/app/sesiones",
    },
    {
      timeBadge: "Mañana · 16:00 - 17:00",
      mentee: "Diego Rojas",
      topic: "Modelo de negocio",
      isToday: false,
      href: "/app/sesiones",
    },
    {
      timeBadge: "14 Jun · 10:00 - 11:00",
      mentee: "Valentina Cruz",
      topic: "Pitch y ventas",
      isToday: false,
      href: "/app/sesiones",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Encabezado de Bienvenida (Panel 1 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Hola, {firstName}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Aquí tienes un resumen de tu actividad y tus mentorías.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/sesiones"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors"
          >
            <span>+ Agendar sesión</span>
          </Link>
        </div>
      </div>

      {/* 2. Cuadrícula de 4 Tarjetas de Métricas (KPIs) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Emprendedores activos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center text-xl shrink-0">
            👥
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{activeCount}</p>
            <p className="text-xs text-slate-500 font-medium">Emprendedores activos</p>
          </div>
        </div>

        {/* KPI 2: Sesiones esta semana */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center text-xl shrink-0">
            📅
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{sessionsCount}</p>
            <p className="text-xs text-slate-500 font-medium">Sesiones esta semana</p>
          </div>
        </div>

        {/* KPI 3: Tareas pendientes */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center text-xl shrink-0">
            ⏳
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{pendingCount}</p>
            <p className="text-xs text-slate-500 font-medium">Tareas pendientes</p>
          </div>
        </div>

        {/* KPI 4: Progreso promedio */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center text-xl shrink-0">
            📊
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{avgProgress}%</p>
            <p className="text-xs text-slate-500 font-medium">Progreso promedio</p>
          </div>
        </div>
      </div>

      {/* 3. Distribución en 2 Columnas: Próximas Sesiones + Cartera */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna Izquierda: Próximas sesiones */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Próximas sesiones
              </h2>
              <Link
                href="/app/calendario"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Ver Calendario →
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {upcomingSessions.map((session, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold mb-1 ${
                        session.isToday
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-200/70 text-slate-600"
                      }`}
                    >
                      {session.timeBadge}
                    </span>
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {session.mentee}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {session.topic}
                    </p>
                  </div>
                  <Link
                    href={session.href}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shrink-0 shadow-2xs"
                  >
                    Enlace
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <Link
              href="/app/sesiones"
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Revisar todas las sesiones programadas
            </Link>
          </div>
        </div>

        {/* Columna Derecha: Tu cartera de emprendedores */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Tu cartera de emprendedores
              </h2>
              <Link
                href="/app/mentor"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                Ver todos →
              </Link>
            </div>

            <div className="mt-4 space-y-4">
              {mentees.map((mentee) => (
                <div
                  key={mentee.id}
                  className="p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                        {mentee.name.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {mentee.name}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {mentee.sector} · <span className="text-slate-400">{mentee.stage}</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold font-mono text-slate-700">
                      {mentee.progress}%
                    </span>
                  </div>

                  {/* Barra de progreso */}
                  <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-500"
                      style={{ width: `${mentee.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center">
            <Link
              href="/app/mentor"
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Gestionar intervenciones y diagnósticos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

