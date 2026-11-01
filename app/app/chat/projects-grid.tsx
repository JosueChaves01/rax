"use client";

import { useState } from "react";
import { timeAgo } from "./time-ago";

/** Lista de proyectos del asistente (como «Proyectos» en Claude). */
export function ProjectsGrid({
  projects,
  onOpen,
}: {
  projects: Array<{ id: string; name: string; description?: string; updatedAt?: string }>;
  onOpen: (projectId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q ? projects.filter((p) => `${p.name} ${p.description ?? ""}`.toLowerCase().includes(q)) : projects;

  return (
    <div className="h-full overflow-y-auto bg-slate-50/30">
      <div className="max-w-5xl mx-auto px-4 py-5 lg:px-8 lg:py-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Proyectos</h1>
            <p className="text-sm text-slate-500">Elige un proyecto para ver sus sesiones y conversar con el agente.</p>
          </div>
          {projects.length > 3 && (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar proyecto…"
              aria-label="Buscar proyecto"
              className="w-full sm:w-64 text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          )}
        </div>

        {projects.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-2xl bg-white">
            No tienes proyectos todavía. Crea uno desde el inicio para empezar a trabajar con el agente.
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-slate-500">Ningún proyecto coincide con «{query}».</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="w-full h-full text-left p-4 rounded-2xl border border-slate-200/80 bg-white shadow-2xs hover:border-orange-300 hover:shadow-xs transition flex flex-col"
                >
                  <span className="text-sm font-semibold text-slate-900 break-words">{p.name}</span>
                  <span className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2 flex-1">{p.description || "Sin descripción"}</span>
                  {p.updatedAt && <span className="mt-3 text-[0.6875rem] text-slate-400">Actualizado {timeAgo(p.updatedAt)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
