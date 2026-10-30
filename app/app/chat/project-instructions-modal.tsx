"use client";

import { useState } from "react";
import { updateProjectInstructionsAction } from "@/app/actions";

interface ProjectInstructionsModalProps {
  projectId: string;
  projectName: string;
  initialInstructions: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (newInstructions: string) => void;
}

export function ProjectInstructionsModal({
  projectId,
  projectName,
  initialInstructions,
  isOpen,
  onClose,
  onSaved,
}: ProjectInstructionsModalProps) {
  const [instructions, setInstructions] = useState(initialInstructions);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await updateProjectInstructionsAction(projectId, instructions);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSaved(instructions);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-orange-100 text-orange-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </span>
              <h2 className="text-base font-bold text-slate-800">Instrucciones del Proyecto</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Proyecto: <strong className="text-slate-700">{projectName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          <div className="p-3.5 bg-amber-50/60 border border-amber-200/60 rounded-xl text-xs text-amber-900 leading-relaxed">
            <strong>Arquitectura Claude Projects:</strong> Estas instrucciones se inyectan automáticamente como{" "}
            <em>System Prompt</em> dedicado en cada nuevo chat de este proyecto. Claude las usa para regir su tono,
            comportamiento, reglas de negocio y formato de salida sin que tengas que repetirlas en cada mensaje.
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Instrucciones y Reglas de Comportamiento:
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Ejemplo: Responde siempre con mentalidad Lean Startup. Exige criterios numéricos de éxito antes de validar cualquier experimento. Mantén un tono conciso y usa tablas comparativas cuando haya métricas..."
              rows={9}
              maxLength={10000}
              className="w-full text-xs sm:text-sm p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition font-sans text-slate-800 resize-none"
            />
            <div className="flex justify-between items-center text-[0.7rem] text-slate-400 mt-1">
              <span>{instructions.length} / 10.000 caracteres</span>
              <span>Claude no lee el título del proyecto; todo lo que debe saber debe estar aquí o en sus archivos.</span>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-xl shadow-xs transition flex items-center gap-2"
          >
            {isSaving ? "Guardando..." : "Guardar Instrucciones"}
          </button>
        </div>
      </div>
    </div>
  );
}

