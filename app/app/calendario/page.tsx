"use client";

import Link from "next/link";

export default function CalendarPage() {
  const sessions = [
    {
      date: "Hoy · 14 de Junio",
      time: "11:00 - 12:00",
      mentee: "Ana Torres",
      topic: "Estrategia de crecimiento y propuesta de valor",
      status: "Confirmada",
      href: "/app/sesiones",
    },
    {
      date: "Mañana · 15 de Junio",
      time: "16:00 - 17:00",
      mentee: "Diego Rojas",
      topic: "Revisión de modelo de monetización",
      status: "Programada",
      href: "/app/sesiones",
    },
    {
      date: "21 de Junio",
      time: "10:00 - 11:00",
      mentee: "Valentina Cruz",
      topic: "Pitch comercial y objeciones de clientes",
      status: "Agendada",
      href: "/app/sesiones",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Calendario de mentorías
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Encuentros virtuales programados, recordatorios y enlaces de conexión.
          </p>
        </div>
        <Link
          href="/app/sesiones"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs"
        >
          + Programar nueva sesión
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900">
          Próximos encuentros
        </h2>
        <div className="space-y-3">
          {sessions.map((s, idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                  {s.date} • {s.time}
                </span>
                <p className="text-xs font-bold text-slate-900 mt-1">
                  {s.mentee}
                </p>
                <p className="text-[11px] text-slate-500">
                  {s.topic}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                  {s.status}
                </span>
                <Link
                  href={s.href}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  Abrir sesión →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

