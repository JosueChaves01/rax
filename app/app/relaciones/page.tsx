"use client";

import Link from "next/link";

export default function RelationsPage() {
  const relations = [
    {
      id: "rel-1",
      name: "Carlos Méndez (Mentor)",
      project: "RAX Innovation Lab",
      stage: "Ejecución activa",
      compatibility: "94% Afinidad",
      status: "Activa",
      agreementStatus: "Acuerdo rubricado",
      nextSession: "14 Jun 10:00",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Relaciones y acuerdos de mentoría
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestión de vínculos mentor-emprendedor, acuerdos pactados, compatibilidad y rúbricas.
          </p>
        </div>
        <Link
          href="/app/exploracion"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs"
        >
          Explorar nueva mentoría
        </Link>
      </div>

      <div className="space-y-4">
        {relations.map((rel) => (
          <div
            key={rel.id}
            className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 truncate">
                  {rel.name}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                  {rel.status}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 font-mono">
                  {rel.compatibility}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Proyecto: <span className="font-medium text-slate-800">{rel.project}</span> • Etapa: {rel.stage}
              </p>
              <p className="text-[11px] text-slate-400">
                Estado del acuerdo: {rel.agreementStatus} • Próxima reunión: {rel.nextSession}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/app/sesiones"
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
              >
                Ir a sesiones →
              </Link>
              <Link
                href="/app/exploracion"
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs"
              >
                Ver acuerdo
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

