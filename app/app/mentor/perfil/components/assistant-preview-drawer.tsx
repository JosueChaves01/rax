"use client";

import { useEffect } from "react";
import type { IntakeQuestion } from "@/types/b2b";

interface AssistantPreviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  mentorName: string;
  headline?: string;
  methodology?: string;
  tone?: string;
  interviewGuide?: IntakeQuestion[];
  documentsCount: number;
}

export function AssistantPreviewDrawer({
  isOpen,
  onClose,
  mentorName,
  headline,
  methodology,
  tone,
  interviewGuide = [],
  documentsCount,
}: AssistantPreviewDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const firstQuestion = interviewGuide[0] || {
    topic: "Contexto Inicial",
    question: "¿En qué estado se encuentra tu negocio actualmente y qué esperas lograr con tu mentor?",
    why: "Ubicar las prioridades para la primera sesión.",
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-title"
      >
        {/* Encabezado del Drawer */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-xs font-bold text-xs">
              IA
            </div>
            <div>
              <h2 id="preview-title" className="text-sm font-bold text-slate-900">
                Simulador del Asistente
              </h2>
              <p className="text-[11px] text-slate-500">Vista previa de cómo interactúa con tu cliente</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            title="Cerrar vista previa"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Parámetros Activos */}
        <div className="border-b border-slate-100 bg-slate-50/40 px-6 py-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-700">Configuración activa:</span>
          <span className="rounded-md bg-blue-50 px-2 py-0.5 text-blue-700 font-medium">
            {interviewGuide.length} preguntas en guía
          </span>
          <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-indigo-700 font-medium">
            {documentsCount} docs RAG
          </span>
        </div>

        {/* Ventana de Simulación de Chat */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
          <div className="text-center">
            <span className="rounded-full bg-slate-200/80 px-3 py-1 font-mono text-[10px] text-slate-600">
              Inicio de entrevista previa · Sesión 1
            </span>
          </div>

          {/* Mensaje del Asistente IA */}
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-xs shadow-xs">
              R
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white p-4 shadow-sm border border-slate-200 text-slate-800 text-xs sm:text-sm space-y-2.5">
              <p>
                ¡Hola! Soy el asistente de mentoría de <strong className="text-slate-900">{mentorName || "tu mentor"}</strong> en RAX.
              </p>
              {headline && (
                <p className="border-l-2 border-blue-500 pl-2.5 text-xs italic text-slate-600">
                  «{headline}»
                </p>
              )}
              <p>
                Antes de su primera sesión juntos, {mentorName || "tu mentor"} me pidió que conversemos brevemente
                para entender el contexto actual de tu proyecto y enfocar la reunión al 100%.
              </p>
              {methodology && (
                <div className="rounded-xl bg-blue-50/50 p-2.5 text-xs text-blue-900 border border-blue-100">
                  <p className="font-semibold">Marco de trabajo aplicado:</p>
                  <p className="mt-0.5 line-clamp-3 text-slate-700">
                    {methodology}
                  </p>
                </div>
              )}
              <div className="pt-1">
                <p className="font-semibold text-slate-900">
                  {firstQuestion.topic ? `[${firstQuestion.topic}]` : "Primera pregunta:"}
                </p>
                <p className="mt-1 font-medium text-blue-950">
                  {firstQuestion.question}
                </p>
              </div>
            </div>
          </div>

          {/* Globo Informativo de cómo actúa el tono */}
          {tone && (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-3 text-xs text-amber-900">
              <p className="font-semibold flex items-center gap-1.5">
                <span>🎭</span> Tono activo en la conversación:
              </p>
              <p className="mt-1 text-slate-700 italic leading-relaxed">
                «{tone}»
              </p>
            </div>
          )}

          {/* Respuesta simulada del cliente */}
          <div className="flex justify-end gap-3 pt-2">
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-900 p-3.5 text-white text-xs sm:text-sm shadow-xs">
              <p>
                ¡Hola! Claro, te cuento: vendemos software para logística a empresas medianas, pero nos cuesta acelerar el ciclo de ventas...
              </p>
            </div>
          </div>

          {/* Repregunta del Asistente aplicando la justificación 'why' */}
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white font-bold text-xs shadow-xs">
              R
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white p-4 shadow-sm border border-slate-200 text-slate-800 text-xs sm:text-sm space-y-2">
              <p className="text-slate-700">
                Entendido. Para ayudar a {mentorName || "tu mentor"} a diagnosticar el cuello de botella:
              </p>
              <p className="font-medium text-slate-900">
                {firstQuestion.why
                  ? `Para dimensionar bien esto: ¿cuántas semanas suele tardar hoy desde el primer contacto hasta el cierre de un contrato?`
                  : `¿Cuál ha sido tu mayor obstáculo para acortar ese proceso de venta?`}
              </p>
            </div>
          </div>
        </div>

        {/* Pie del Drawer */}
        <div className="border-t border-slate-200 bg-white p-4 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            Los cambios que guardes en tu perfil actualizan este flujo inmediatamente.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
