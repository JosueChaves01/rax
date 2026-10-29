"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";
import { improveDocumentWithAIAction } from "@/app/actions";

type EditorTab = "editar" | "vista-previa" | "historial" | "comentarios";

export default function DocumentEditorPage() {
  const [tab, setTab] = useState<EditorTab>("editar");

  // Secciones del documento (Panel 8 del Mock)
  const [conclusion, setConclusion] = useState(
    "Ofrecemos una plataforma de gestión simple y costeable para pequeñas empresas, que les permite ahorrar tiempo y aumentar sus ventas."
  );
  const [argumentos, setArgumentos] = useState(
    "• Fácil de implementar y usar en menos de 24 horas.\n• Soporte personalizado y contextualizado a la etapa del negocio.\n• Integración nativa con herramientas populares y flujos de automatización."
  );
  const [datos, setDatos] = useState(
    "• 3 pruebas piloto concluidas con 85% de satisfacción.\n• 30% de ahorro promedio en horas operativas semanales."
  );

  // Sugerencias de IA (Panel 8 del Mock)
  const [suggestions, setSuggestions] = useState([
    { id: "s1", text: "Mejorar la claridad del mensaje", checked: true },
    { id: "s2", text: "Agregar un ejemplo de cliente real", checked: false },
    { id: "s3", text: "Optimizar síntesis para inversionistas", checked: false },
  ]);

  const [aiGenerating, setAiGenerating] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);

  const handleImproveWithAI = async () => {
    setAiGenerating(true);
    try {
      const res = await improveDocumentWithAIAction({
        title: "Propuesta de valor",
        conclusion,
        argumentsText: argumentos,
        dataText: datos,
      });
      if (res?.ok && res.reply) {
        setConclusion(
          "Transformamos la gestión de pequeñas empresas mediante una solución ágil, accesible y asistida por IA que multiplica sus ventas y reduce en un tercio su carga operativa."
        );
        setSuggestions((prev) =>
          prev.map((s) => (s.id === "s1" || s.id === "s3" ? { ...s, checked: true } : s))
        );
      }
    } finally {
      setAiGenerating(false);
    }
  };

  const toggleSuggestion = (id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s))
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Barra Superior del Documento (Panel 8 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            href="/app/documentos"
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-500 transition-colors"
            title="Volver a documentos"
          >
            ←
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">
                Propuesta de valor — Borrador
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                v1.0
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Documento generado con IA • Guardado automáticamente
            </p>
          </div>
        </div>

        {/* Pestañas: [Editar] | [Vista previa] | [Historial] | [Comentarios] */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          {(
            [
              ["editar", "Editar"],
              ["vista-previa", "Vista previa"],
              ["historial", "Historial"],
              ["comentarios", "Comentarios"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cx(
                "px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                tab === t
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Distribución en 2 Columnas: Editor y Asistente IA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Lienzo de Edición (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              Propuesta de Valor
            </h2>
            <p className="text-xs text-slate-400 mt-1 font-mono">
              Estructura piramidal de Minto
            </p>
          </div>

          {/* Sección 1: Conclusión principal */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              1. Conclusión principal
            </label>
            <textarea
              rows={3}
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              className="w-full p-3.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 leading-relaxed font-sans"
            />
          </div>

          {/* Sección 2: Argumentos de apoyo */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              2. Argumentos de apoyo
            </label>
            <textarea
              rows={4}
              value={argumentos}
              onChange={(e) => setArgumentos(e.target.value)}
              className="w-full p-3.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 leading-relaxed font-sans"
            />
          </div>

          {/* Sección 3: Datos y ejemplos */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              3. Datos y ejemplos
            </label>
            <textarea
              rows={3}
              value={datos}
              onChange={(e) => setDatos(e.target.value)}
              className="w-full p-3.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-800 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 leading-relaxed font-sans"
            />
          </div>

          {/* Botón Añadir sección */}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            + Añadir sección personalizada
          </button>
        </div>

        {/* Columna Derecha: Panel de Asistencia de IA (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-5">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-xs">
                💡
              </span>
              <h3 className="text-sm font-bold text-slate-900">
                Asistencia de IA
              </h3>
            </div>

            {/* Checklist de sugerencias */}
            <div>
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Sugerencias
              </p>
              <div className="space-y-2">
                {suggestions.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-50 cursor-pointer text-xs text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={s.checked}
                      onChange={() => toggleSuggestion(s.id)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className={s.checked ? "line-through text-slate-400" : ""}>
                      {s.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Resumen analítico */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                Resumen de coherencia
              </p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                El documento sigue la estructura de la pirámide de Minto, con una conclusión clara y argumentos relevantes respaldados por datos tempranos.
              </p>
            </div>

            {/* Botón Generar versión mejorada */}
            <button
              type="button"
              disabled={aiGenerating}
              onClick={handleImproveWithAI}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {aiGenerating ? "Optimizando con IA…" : "Generar versión mejorada"}
            </button>

            {/* Botones al pie: Descartar / Solicitar revisión */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-xs text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
              >
                Descartar borrador
              </button>
              <button
                type="button"
                onClick={() => setReviewRequested(true)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer"
              >
                {reviewRequested ? "✓ Revisión solicitada" : "Solicitar revisión"}
              </button>
            </div>

            {reviewRequested && (
              <div className="p-2.5 text-[11px] bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">
                Notificación enviada a tu mentor para su retroalimentación.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

