"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";
import type { MentorResource, ResourceCategory } from "@/types/domain";

interface DocumentsViewProps {
  initialResources: MentorResource[];
}

type MainTab = "biblioteca" | "mis-documentos" | "generados-ia";
type FilterKind = "Todos" | "Métodos" | "Plantillas" | "Guías" | "Ejercicios";

export function DocumentsView({ initialResources }: DocumentsViewProps) {
  const [mainTab, setMainTab] = useState<MainTab>("biblioteca");
  const [filterKind, setFilterKind] = useState<FilterKind>("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<string>(
    initialResources[0]?.id || "minto"
  );
  const [downloadNotice, setDownloadNotice] = useState(false);

  // Map category to Spanish pill
  const categoryToKind = (cat: ResourceCategory): FilterKind => {
    switch (cat) {
      case "framework":
        return "Métodos";
      case "template":
        return "Plantillas";
      case "guide":
        return "Guías";
      case "questionnaire":
      case "experiment_pattern":
        return "Ejercicios";
      default:
        return "Guías";
    }
  };

  const filteredDocs = initialResources.filter((doc) => {
    const kind = categoryToKind(doc.category);
    if (filterKind !== "Todos" && kind !== filterKind) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = doc.title.toLowerCase().includes(q);
      const matchDesc = doc.description.toLowerCase().includes(q);
      const matchTag = doc.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchDesc && !matchTag) return false;
    }
    return true;
  });

  const selectedDoc =
    initialResources.find((d) => d.id === selectedDocId) || filteredDocs[0] || initialResources[0];

  const handleDownload = () => {
    setDownloadNotice(true);
    setTimeout(() => setDownloadNotice(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* 1. Encabezado y Pestañas Principales (Panel 4 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Centro de documentos con IA
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Plantillas, guías metodológicas y artefactos generados colaborativamente con tu mentor.
          </p>
        </div>

        {/* Pestañas: [Biblioteca] | [Mis documentos] | [Generados con IA] */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          {(
            [
              ["biblioteca", "Biblioteca"],
              ["mis-documentos", "Mis documentos"],
              ["generados-ia", "Generados con IA"],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMainTab(tab)}
              className={cx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                mainTab === tab
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {downloadNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded-xl flex items-center gap-2">
          <span>✓</span> Guía descargada en formato Markdown / PDF listo para imprimir.
        </div>
      )}

      {/* 2. Buscador y Filtros Secundarios */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar documentos, frameworks, guías…"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
        </div>

        {/* Píldoras de Filtro: [Todos] [Métodos] [Plantillas] [Guías] [Ejercicios] */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(
            ["Todos", "Métodos", "Plantillas", "Guías", "Ejercicios"] as const
          ).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilterKind(k)}
              className={cx(
                "px-3 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap cursor-pointer",
                filterKind === k
                  ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Distribución en 2 Columnas (Panel 4 del Mock) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Lista de Documentos (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          {filteredDocs.map((doc) => {
            const isSelected = selectedDoc?.id === doc.id;
            const kindLabel = categoryToKind(doc.category);
            return (
              <div
                key={doc.id}
                onClick={() => setSelectedDocId(doc.id)}
                className={cx(
                  "p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4",
                  isSelected
                    ? "bg-white border-blue-500 shadow-sm ring-1 ring-blue-500"
                    : "bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs"
                )}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-100">
                    📄
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                        {kindLabel}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {doc.tags[0] || "Metodología"}
                      </span>
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 truncate mt-0.5">
                      {doc.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                      {doc.description}
                    </p>
                  </div>
                </div>

                <Link
                  href={`/app/documentos/${doc.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shrink-0 transition-colors shadow-2xs"
                >
                  Usar
                </Link>
              </div>
            );
          })}
        </div>

        {/* Columna Derecha: Vista Previa y Acción IA (5 cols) */}
        <div className="lg:col-span-5">
          {selectedDoc ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-6 sticky top-6">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-base border border-blue-100 mb-3">
                  📋
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wider">
                    {categoryToKind(selectedDoc.category)}
                  </span>
                  {selectedDoc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <h2 className="text-base font-bold text-slate-900">
                  {selectedDoc.title}
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed mt-2">
                  {selectedDoc.description}
                </p>
              </div>

              {/* Contenido / Estructura */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Estructura metodológica
                </p>
                <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed max-h-48 overflow-y-auto">
                  {selectedDoc.content}
                </div>
              </div>

              {/* Botones de Acción (Panel 4 del Mock) */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <Link
                  href={`/app/documentos/${selectedDoc.id}`}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
                >
                  <span>✨</span> Generar versión personalizada con IA
                </Link>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer text-center"
                >
                  Descargar guía
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-slate-400 text-xs">
              Selecciona un documento para ver detalles.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

