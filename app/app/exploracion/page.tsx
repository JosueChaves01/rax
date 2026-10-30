"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";
import { completeExplorationAction } from "@/app/actions";

interface MotivationCard {
  id: string;
  icon: string;
  title: string;
  description: string;
}

const MOTIVATIONS: MotivationCard[] = [
  {
    id: "scale",
    icon: "🚀",
    title: "Escalar el negocio",
    description: "Crecer en ventas, estructurar operaciones y expandir mercado.",
  },
  {
    id: "skills",
    icon: "🎯",
    title: "Mejorar habilidades",
    description: "Desarrollar capacidades directivas, comerciales y de negociación.",
  },
  {
    id: "validate",
    icon: "💡",
    title: "Validar idea",
    description: "Comprobar supuestos críticos con clientes reales antes de invertir.",
  },
  {
    id: "network",
    icon: "🌐",
    title: "Conectar con redes",
    description: "Acceder a ecosistemas, alianzas estratégicas e inversionistas.",
  },
  {
    id: "blocker",
    icon: "🧩",
    title: "Resolver un bloqueo",
    description: "Destrabar dificultades técnicas, societarias o de tracción.",
  },
  {
    id: "other",
    icon: "➕",
    title: "Otro",
    description: "Un desafío específico que requiere acompañamiento a medida.",
  },
];

const STEPS = [
  { num: 1, label: "Perfil" },
  { num: 2, label: "Expectativas" },
  { num: 3, label: "Compatibilidad" },
  { num: 4, label: "Acuerdo" },
];

export default function ExplorationPage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedMotivation, setSelectedMotivation] = useState("");
  const [description, setDescription] = useState("");
  const [relationAccepted, setRelationAccepted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleAcceptMentor = () => {
    startTransition(async () => {
      setActionError(null);
      setActionNotice(null);
      try {
        const result = await completeExplorationAction({
          motivation: selectedMotivation,
          description,
        });
        if (!result.ok) {
          setActionError(result.error || "No se pudo registrar la solicitud.");
          return;
        }
        setActionNotice(result.notice || "La acción terminó, pero no se confirmó la creación de una relación nueva.");
        setRelationAccepted(true);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "No se pudo registrar la solicitud.");
      }
    });
  };

  const handleNext = () => {
    if (currentStep < 4) setCurrentStep((prev) => prev + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep((prev) => prev - 1);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* 1. Stepper Superior (Panel 3 del Mock) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="grid grid-cols-4 gap-2 sm:gap-4">
          {STEPS.map((s) => {
            const isDone = s.num < currentStep;
            const isCurrent = s.num === currentStep;

            return (
              <div
                key={s.num}
                className={`flex flex-col sm:flex-row items-center gap-2 sm:gap-3 p-2 rounded-xl transition-colors ${isCurrent
                    ? "bg-blue-50 border border-blue-200"
                    : isDone
                      ? "text-slate-800"
                      : "text-slate-400"
                  }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isDone
                      ? "bg-emerald-600 text-white"
                      : isCurrent
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-500"
                    }`}
                >
                  {isDone ? "✓" : s.num}
                </div>
                <div className="text-center sm:text-left min-w-0">
                  <p
                    className={`text-xs font-bold truncate ${isCurrent
                        ? "text-blue-700"
                        : isDone
                          ? "text-slate-900"
                          : "text-slate-400"
                      }`}
                  >
                    {s.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Contenido del Asistente */}
      {currentStep === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Paso 1: Información básica de tu proyecto
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Confirma los datos principales para orientar el diagnóstico inicial.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre de la iniciativa
              </label>
              <input
                placeholder="Nombre de la iniciativa"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Sector o industria
              </label>
              <input
                placeholder="Sector o industria"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50"
              />
            </div>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              ¿Qué te motiva a buscar mentoría?
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Selecciona tu objetivo principal para emparejarte con el mentor más afín.
            </p>
          </div>

          {/* Cuadrícula de 6 Opciones (Panel 3 del Mock) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {MOTIVATIONS.map((m) => {
              const selected = selectedMotivation === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedMotivation(m.id)}
                  className={cx(
                    "p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between",
                    selected
                      ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20 shadow-xs"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                  )}
                >
                  <div className="text-2xl mb-3">{m.icon}</div>
                  <div>
                    <p
                      className={cx(
                        "text-xs font-bold",
                        selected ? "text-blue-900" : "text-slate-900"
                      )}
                    >
                      {m.title}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      {m.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Área de Captura Contextual */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="exp-desc"
                className="block text-xs font-semibold text-slate-800"
              >
                Cuéntanos más sobre tu situación actual
              </label>
              <span className="text-[10px] text-slate-500 font-mono">
                {description.length}/500
              </span>
            </div>
            <textarea
              id="exp-desc"
              rows={4}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe tu proyecto, etapa actual y los principales desafíos que enfrentas..."
              className="w-full p-3.5 text-xs rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 leading-relaxed"
            />
          </div>
        </div>
      )}

      {currentStep === 3 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Paso 3: Compatibilidad mentor-emprendedor
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              El emparejamiento automatizado y la disponibilidad de mentores aún no están conectados.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-blue-600 text-white flex flex-col items-center justify-center font-bold text-xl shrink-0 shadow-sm">
              <span>Manual</span>
              <span className="text-[9px] font-normal uppercase tracking-wider">Pendiente</span>
            </div>

            <div className="space-y-2 text-center sm:text-left min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Compatibilidad de mentoría
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                  No disponible
                </span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Puedes registrar tu motivación y descripción; esta pantalla no calcula compatibilidad ni asigna un mentor.
              </p>
              <div className="pt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                  ✓ Validación de objetivos
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                  ✓ Acuerdos de confidencialidad
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200">
                  Matching automatizado pendiente
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-700">
              ¿Deseas enviar tu perfil para confirmación de la relación de mentoría?
            </span>
            <button
              type="button"
              disabled={isPending || relationAccepted}
              onClick={handleAcceptMentor}
              className={cx(
                "px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer disabled:opacity-50",
                relationAccepted
                  ? "bg-emerald-600 text-white"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              {relationAccepted ? "✓ Solicitud registrada" : "Registrar interés en mentoría"}
            </button>
          </div>
          {actionError && <p role="alert" className="text-xs text-rose-700">{actionError}</p>}
          {actionNotice && <p role="status" className="text-xs text-blue-800">{actionNotice}</p>}
        </div>
      )}

      {currentStep === 4 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Paso 4: Acuerdo preliminar y próximos pasos
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Propuesta de frecuencia y objetivos; no se registra un acuerdo en esta pantalla.
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">Frecuencia de sesiones</p>
                <p className="text-[11px] text-slate-500">Encuentros virtuales coordinados por ambas partes</p>
              </div>
              <span className="text-xs font-semibold text-blue-600">Propuesta: quincenal</span>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900">Objetivo del ciclo</p>
                <p className="text-[11px] text-slate-500">Validación de hipótesis y seguimiento de acuerdos</p>
              </div>
              <span className="text-xs font-semibold text-amber-700">Por definir</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-center">
            <p className="text-xs text-blue-900 font-semibold">
              Este resumen es una vista previa. El acuerdo y los datos del perfil no se guardan aquí.
            </p>
            <Link
              href="/app"
              className="mt-3 inline-block px-5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 shadow-xs"
            >
              Ir a mi panel de emprendedor →
            </Link>
          </div>
        </div>
      )}

      {/* 3. Barra de Botones Inferiores (Panel 3 del Mock) */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button
          type="button"
          disabled={currentStep === 1}
          onClick={handlePrev}
          className="px-5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors shadow-2xs cursor-pointer"
        >
          Anterior
        </button>

        {currentStep < 4 ? (
          <button
            type="button"
            onClick={handleNext}
            className="px-6 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs cursor-pointer"
          >
            Siguiente →
          </button>
        ) : (
          <Link
            href="/app"
            className="px-6 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
          >
              Volver al panel
          </Link>
        )}
      </div>
    </div>
  );
}
