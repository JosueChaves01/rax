"use client";

import { useState } from "react";
import Link from "next/link";
import { improveDocumentWithAIAction } from "@/app/actions";
import type { MentorResource } from "@/types/domain";

interface DocumentEditorViewProps {
  docId: string;
  initialDoc?: MentorResource;
}

export function DocumentEditorView({ docId, initialDoc }: DocumentEditorViewProps) {

  // Secciones del documento
  const [conclusion, setConclusion] = useState(
    initialDoc?.description || ""
  );
  const [argumentos, setArgumentos] = useState(
    initialDoc?.content || ""
  );
  const [datos, setDatos] = useState("");

  // Sugerencias de IA
  const [suggestions, setSuggestions] = useState([
    { id: "s1", text: "Verificar claridad y síntesis del mensaje", checked: false },
    { id: "s2", text: "Añadir evidencias o casos contrastables", checked: false },
    { id: "s3", text: "Alinear con los objetivos del ciclo", checked: false },
  ]);

  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [suggestionApplied, setSuggestionApplied] = useState(false);

  const handleImproveWithAI = async () => {
    setAiGenerating(true);
    setAiError(null);
    try {
      const res = await improveDocumentWithAIAction({
        title: initialDoc?.title || "Documento",
        conclusion,
        argumentsText: argumentos,
        dataText: datos,
      });
      if (!res.ok) {
        setAiError(res.error);
        return;
      }
      setConclusion(res.reply);
      setSuggestionApplied(true);
      setSuggestions((prev) => prev.map((s) => ({ ...s, checked: true })));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "No se pudo generar una sugerencia.");
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
                {initialDoc?.title || "Propuesta de valor"} — Edición temporal
              </h1>
            </div>
            <p className="text-xs text-slate-500">
              Plantilla {docId}. Los cambios de esta pantalla no se guardan ni se versionan.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Distribución en 2 Columnas: Editor y Asistente IA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Lienzo de Edición (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {initialDoc?.title || "Propuesta de Valor"}
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-mono">
              Plantilla: Pirámide de Minto
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
            disabled
            title="La edición de secciones todavía no está disponible."
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 cursor-not-allowed"
          >
            + Añadir sección (no disponible)
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
                    <span className={s.checked ? "line-through text-slate-500" : ""}>
                      {s.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Resumen analítico */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                Revisión orientativa
              </p>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Revisa que la conclusión sea breve y que los argumentos y cifras se respalden con evidencia registrada. Esta pantalla aún no valida coherencia automáticamente.
              </p>
            </div>

            {/* Esta acción solo ofrece una sugerencia temporal; no guarda una versión. */}
            <button
              type="button"
              disabled={aiGenerating}
              onClick={handleImproveWithAI}
              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {aiGenerating ? "Preparando sugerencia…" : "Sugerir reformulación"}
            </button>

            {aiError && (
              <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {aiError}
              </div>
            )}
            {suggestionApplied && (
              <div role="status" className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                Sugerencia aplicada solo en esta sesión; aún no está guardada.
              </div>
            )}

            {/* El modelo de documentos aún no tiene guardado/revisión persistentes. */}
            <div className="pt-4 border-t border-slate-100">
              <button
                type="button"
                disabled
                title="El guardado y la solicitud de revisión todavía no están disponibles."
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500 cursor-not-allowed"
              >
                Guardar y solicitar revisión (no disponible)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

