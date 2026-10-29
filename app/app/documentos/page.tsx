"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";

interface DocumentItem {
  id: string;
  title: string;
  kind: "Métodos" | "Plantillas" | "Guías" | "Ejercicios";
  duration: string;
  tags: string[];
  description: string;
  sections: string[];
}

const DOCUMENTS: DocumentItem[] = [
  {
    id: "minto",
    title: "Principio de la Pirámide de Minto",
    kind: "Guías",
    duration: "Guía · 12 min",
    tags: ["Guía", "Comunicación", "Estrategia"],
    description:
      "Aprende a estructurar tus ideas empezando por la conclusión principal, seguida de argumentos de apoyo y finalmente los datos y detalles.",
    sections: [
      "Explicación del método",
      "Ejemplos prácticos",
      "Ejercicio aplicado a tu negocio",
    ],
  },
  {
    id: "business-plan",
    title: "Plantilla de Plan de Negocio",
    kind: "Plantillas",
    duration: "Plantilla · 15 min",
    tags: ["Plantilla", "Estructura", "Finanzas"],
    description:
      "Formato sintético para presentar propuesta de valor, estructura de costos, proyecciones de tracción y necesidades de capital.",
    sections: [
      "Resumen ejecutivo",
      "Problema y propuesta única",
      "Modelo de monetización",
      "Proyección financiera a 12 meses",
    ],
  },
  {
    id: "prep-exercise",
    title: "Ejercicio PREP - Objeciones de clientes",
    kind: "Ejercicios",
    duration: "Ejercicio · 20 min",
    tags: ["Ejercicio", "Ventas", "Validación"],
    description:
      "Estructura respuestas contundentes ante dudas comerciales usando la fórmula Punto, Razón, Ejemplo y Punto final.",
    sections: [
      "Identificación de la objeción",
      "Declaración del punto principal",
      "Razonamiento justificativo",
      "Ejemplo verificable",
    ],
  },
  {
    id: "lean-canvas",
    title: "Lean Canvas - Creación de valor",
    kind: "Métodos",
    duration: "Ejercicio · 10 min",
    tags: ["Lean", "Modelos", "Agilidad"],
    description:
      "Diagrama de 9 bloques para desglosar tu modelo de negocio identificando supuestos de mayor riesgo e incertidumbre.",
    sections: [
      "Top 3 problemas del cliente",
      "Propuesta de valor única",
      "Métricas clave y ventaja competitiva",
    ],
  },
  {
    id: "mece",
    title: "Marco MECE - Análisis de mercado",
    kind: "Guías",
    duration: "Guía · 12 min",
    tags: ["Guía", "Estrategia", "Análisis"],
    description:
      "Principio de exclusión mutua y exhaustividad colectiva para segmentar clientes y competidores sin solapamientos ni omisiones.",
    sections: [
      "Reglas de categorización MECE",
      "Árbol de problemas",
      "Ejemplo aplicado a pricing",
    ],
  },
];

type MainTab = "biblioteca" | "mis-documentos" | "generados-ia";
type FilterKind = "Todos" | "Métodos" | "Plantillas" | "Guías" | "Ejercicios";

export default function DocumentsPage() {
  const [mainTab, setMainTab] = useState<MainTab>("biblioteca");
  const [filterKind, setFilterKind] = useState<FilterKind>("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocId, setSelectedDocId] = useState("minto");
  const [downloadNotice, setDownloadNotice] = useState(false);

  const selectedDoc = DOCUMENTS.find((d) => d.id === selectedDocId) || DOCUMENTS[0];

  const filteredDocs = DOCUMENTS.filter((d) => {
    if (filterKind !== "Todos" && d.kind !== filterKind) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        d.title.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. Encabezado con Pestañas Principales (Panel 4 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Centro de documentos con IA
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Plantillas, marcos de trabajo estructurados y generación asistida por inteligencia artificial.
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

      {/* 2. Barra de Búsqueda y Filtros Rápidos */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Píldoras de filtro */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(["Todos", "Métodos", "Plantillas", "Guías", "Ejercicios"] as const).map((k) => (
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

        {/* Buscador */}
        <div className="relative w-full sm:w-64 shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar documentos..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
          />
          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
            🔍
          </span>
        </div>
      </div>

      {/* 3. Distribución en 2 Columnas (Panel 4 del Mock) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Lista de Documentos (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          {filteredDocs.map((doc) => {
            const isSelected = doc.id === selectedDocId;

            return (
              <div
                key={doc.id}
                onClick={() => setSelectedDocId(doc.id)}
                className={cx(
                  "p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3",
                  isSelected
                    ? "bg-blue-50/70 border-blue-300 ring-2 ring-blue-500/10 shadow-xs"
                    : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {doc.title}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {doc.duration}
                  </p>
                </div>
                <Link
                  href={`/app/documentos/${doc.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shrink-0 shadow-2xs"
                >
                  Usar
                </Link>
              </div>
            );
          })}
        </div>

        {/* Columna Derecha: Vista Previa Detallada (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs flex flex-col justify-between">
          <div>
            {/* Título y Etiquetas */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {selectedDoc.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-slate-100 text-slate-700 border border-slate-200"
                >
                  {tag}
                </span>
              ))}
            </div>

            <h2 className="text-xl font-bold text-slate-900">
              {selectedDoc.title}
            </h2>

            {/* Descripción */}
            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              {selectedDoc.description}
            </p>

            {/* Contenido desplegable */}
            <div className="mt-6 pt-6 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                Contenido del marco
              </h3>
              <ul className="space-y-2">
                {selectedDoc.sections.map((sec, idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2 text-xs text-slate-700"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    <span>{sec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Botones de Acción (Panel 4 del Mock) */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-3">
            <Link
              href={`/app/documentos/${selectedDoc.id}`}
              className="flex-1 min-w-[200px] py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold text-center transition-colors shadow-xs"
            >
              Generar versión personalizada con IA
            </Link>
            <button
              type="button"
              onClick={() => {
                setDownloadNotice(true);
                setTimeout(() => setDownloadNotice(false), 3000);
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs cursor-pointer"
            >
              Descargar guía
            </button>
          </div>

          {downloadNotice && (
            <div className="mt-3 p-3 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-center">
              ✓ Guía preparada para descarga en formato PDF / Markdown.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

