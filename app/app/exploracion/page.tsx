"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cx } from "@/shared/ui/primitives";
import {
  completeExplorationAndCreateProjectAction,
  generateMentorshipExplorationWithAiAction,
  loadExplorationContextAction,
} from "@/app/actions";
import type { AgreementFrequency, InitiativeNature } from "@/types/domain";

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
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);

  // Paso 1: Perfil
  const [initiativeName, setInitiativeName] = useState("");
  const [sector, setSector] = useState("");
  const [nature, setNature] = useState<InitiativeNature>("designing_solution");
  const [summary, setSummary] = useState("");

  // Paso 2: Expectativas
  const [selectedMotivation, setSelectedMotivation] = useState("validate");
  const [description, setDescription] = useState("");

  // Paso 3: Compatibilidad
  const [selectedMentorId, setSelectedMentorId] = useState("");
  const [compatibilityScore, setCompatibilityScore] = useState<number>(95);
  const [compatibilityRationale, setCompatibilityRationale] = useState("");
  const [validationGoals, setValidationGoals] = useState<string[]>([]);
  const [relationAccepted, setRelationAccepted] = useState(true);

  // Paso 4: Acuerdo
  const [frequency, setFrequency] = useState<AgreementFrequency>("biweekly");
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(60);
  const [expectedDurationWeeks, setExpectedDurationWeeks] = useState(12);
  const [cycleGoals, setCycleGoals] = useState("");
  const [scope, setScope] = useState("");
  const [mentorCommitments, setMentorCommitments] = useState("");
  const [entrepreneurCommitments, setEntrepreneurCommitments] = useState("");
  const [confidentialityTerms, setConfidentialityTerms] = useState(
    "Toda la información estratégica, operativa y comercial compartida durante el ciclo de mentoría se maneja bajo confidencialidad absoluta entre ambas partes.",
  );

  // Asistente de IA y Estado General
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState<string | null>(null);
  const [availableMentors, setAvailableMentors] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  // Carga inicial de contexto y mentores disponibles
  useEffect(() => {
    loadExplorationContextAction().then((res) => {
      if (res.ok && res.mentors) {
        setAvailableMentors(res.mentors);
        if (res.mentors.length > 0) {
          setSelectedMentorId((curr) => curr || res.mentors[0].id);
        }
      }
    });
  }, []);

  // Autocompletar con Asistente de IA
  const handleAutoFillWithAi = async (customPrompt?: string) => {
    setIsGeneratingAi(true);
    setActionError(null);
    setAiSuccessMessage(null);
    try {
      // Priorizar prompt explícito, luego el del asistente de IA, y finalmente campos ya escritos en el formulario
      const promptToUse =
        customPrompt !== undefined
          ? customPrompt
          : aiPrompt.trim() ||
            initiativeName.trim() ||
            summary.trim() ||
            description.trim() ||
            "";

      const res = await generateMentorshipExplorationWithAiAction(promptToUse);
      if (!res.ok || !res.data) {
        setActionError(res.error || "No se pudo generar la propuesta con IA.");
        return;
      }

      const d = res.data;
      // Paso 1
      setInitiativeName(d.initiativeName);
      setSector(d.sector);
      setNature(d.nature);
      setSummary(d.summary);

      // Paso 2
      setSelectedMotivation(d.motivation);
      setDescription(d.description);

      // Paso 3
      setCompatibilityScore(d.compatibilityScore);
      setCompatibilityRationale(d.compatibilityRationale);
      setValidationGoals(d.validationGoals);
      setRelationAccepted(true);
      if (res.mentorId) {
        setSelectedMentorId(res.mentorId);
      } else if (availableMentors.length > 0) {
        setSelectedMentorId(availableMentors[0].id);
      }

      // Paso 4
      setFrequency(d.frequency);
      setSessionDurationMinutes(d.sessionDurationMinutes);
      setExpectedDurationWeeks(d.expectedDurationWeeks);
      setCycleGoals(d.cycleGoals);
      setScope(d.scope);
      setMentorCommitments(d.mentorCommitments);
      setEntrepreneurCommitments(d.entrepreneurCommitments);
      setConfidentialityTerms(d.confidentialityTerms);

      setAiSuccessMessage(
        `¡Workflow completo generado para «${d.initiativeName}»! Podés navegar por los 4 pasos y modificar cualquier campo antes de confirmar.`,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error al invocar al Asistente de IA.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Crear y formalizar proyecto completo
  const handleCreateProjectAndAgreement = () => {
    if (!initiativeName.trim()) {
      setActionError("Por favor ingresa o genera el nombre de la iniciativa en el Paso 1.");
      setCurrentStep(1);
      return;
    }

    startTransition(async () => {
      setActionError(null);
      setActionNotice(null);
      try {
        const result = await completeExplorationAndCreateProjectAction({
          initiativeName,
          sector: sector || "General",
          nature,
          summary,
          motivation: selectedMotivation,
          description: description || "Iniciativa estructurada mediante exploración guiada.",
          mentorId: selectedMentorId || (availableMentors[0] ? availableMentors[0].id : undefined),
          compatibilityRationale,
          agreement: {
            frequency,
            sessionDurationMinutes,
            expectedDurationWeeks,
            cycleGoals,
            scope: scope || cycleGoals,
            mentorCommitments,
            entrepreneurCommitments,
            confidentialityTerms,
            authorizedChannels: ["virtual", "email", "whatsapp"],
          },
        });

        if (!result.ok) {
          setActionError(result.error || "No se pudo crear el proyecto.");
          return;
        }

        setActionNotice(result.notice || "Proyecto creado y acuerdo formalizado con éxito.");
        setCreatedProjectId(result.projectId);
        setTimeout(() => {
          router.push(`/app/p/${result.projectId}`);
        }, 1500);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Error al procesar la creación.");
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ── COPILOTO DE ASISTENTE DE IA DESTACADO ── */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 shadow-md border border-blue-700/40 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30 flex items-center justify-center text-xl shrink-0">
              ✨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold">Asistente de IA: Copiloto de Exploración y Proyecto</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  En línea
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Rellena automáticamente los 4 pasos del proyecto mentor-cliente con análisis de compatibilidad y acuerdo preliminar.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAutoFillWithAi();
              }
            }}
            placeholder="Personalizar con tu idea o temática (ej. 'Aprender React', 'App de logística', 'Finanzas PyME')..."
            className="w-full sm:flex-1 px-4 py-2.5 text-xs rounded-xl bg-slate-800/80 border border-slate-700 text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-400"
          />
          <button
            type="button"
            disabled={isGeneratingAi}
            onClick={() => handleAutoFillWithAi()}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white transition-all shadow-sm flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            {isGeneratingAi ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generando con IA...
              </>
            ) : (
              <>✨ Autocompletar con IA</>
            )}
          </button>
        </div>

        {/* Chips de casos rápidos */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-300">
          <span className="text-slate-400 font-medium">Ejemplos rápidos:</span>
          <button
            type="button"
            onClick={() => handleAutoFillWithAi("Aprender React y Programación")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            🎯 Aprender React
          </button>
          <button
            type="button"
            onClick={() => handleAutoFillWithAi("Salud Digital & Clínicas")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            🩺 Salud Digital
          </button>
          <button
            type="button"
            onClick={() => handleAutoFillWithAi("Logística Urbana y Entregas")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            🚚 Logística
          </button>
          <button
            type="button"
            onClick={() => handleAutoFillWithAi("SaaS B2B para Equipos Remotos")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            💻 SaaS B2B
          </button>
          <button
            type="button"
            onClick={() => handleAutoFillWithAi("E-commerce & Tienda de Moda")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            🛍️ E-commerce
          </button>
          <button
            type="button"
            onClick={() => handleAutoFillWithAi("FinTech y Gestión de Pagos")}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 transition-colors cursor-pointer"
          >
            💰 FinTech
          </button>
        </div>

        {aiSuccessMessage && (
          <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
            <span>✓</span>
            <span>{aiSuccessMessage}</span>
          </div>
        )}
      </div>

      {/* ── STEPPER SUPERIOR ── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
        <div className="grid grid-cols-4 gap-2 sm:gap-4">
          {STEPS.map((s) => {
            const isDone = s.num < currentStep;
            const isCurrent = s.num === currentStep;

            return (
              <button
                key={s.num}
                type="button"
                onClick={() => setCurrentStep(s.num)}
                className={`flex flex-col sm:flex-row items-center gap-2 sm:gap-3 p-2 rounded-xl transition-colors text-left cursor-pointer ${
                  isCurrent ? "bg-blue-50 border border-blue-200" : isDone ? "text-slate-800 hover:bg-slate-50" : "text-slate-400"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isDone
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
                    className={`text-xs font-bold truncate ${
                      isCurrent ? "text-blue-700" : isDone ? "text-slate-900" : "text-slate-400"
                    }`}
                  >
                    {s.label}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── PASO 1: PERFIL DE LA INICIATIVA ── */}
      {currentStep === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Paso 1: Información básica de tu proyecto</h1>
              <p className="text-xs text-slate-500 mt-1">
                Define el nombre, sector y etapa para que el mentor y el agente orienten el diagnóstico inicial.
              </p>
            </div>
            {initiativeName && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                Iniciativa activa
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="init-name" className="block text-xs font-semibold text-slate-700 mb-1">
                Nombre de la iniciativa *
              </label>
              <input
                id="init-name"
                value={initiativeName}
                onChange={(e) => setInitiativeName(e.target.value)}
                placeholder="Ej. KlinicOS, EcoTransporte, AgroTrace"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
            </div>
            <div>
              <label htmlFor="init-sector" className="block text-xs font-semibold text-slate-700 mb-1">
                Sector o industria *
              </label>
              <input
                id="init-sector"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                placeholder="Ej. Salud Digital, Logística, FinTech, B2B SaaS"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="init-nature" className="block text-xs font-semibold text-slate-700 mb-1">
                Etapa de la iniciativa
              </label>
              <select
                id="init-nature"
                value={nature}
                onChange={(e) => setNature(e.target.value as InitiativeNature)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
              >
                <option value="exploring_idea">Explorando idea (Validación temprana)</option>
                <option value="designing_solution">Diseñando solución (Prototipo / MVP)</option>
                <option value="operating_business">Negocio en marcha (Crecimiento y operaciones)</option>
                <option value="unknown">Por definir</option>
              </select>
            </div>
            <div>
              <label htmlFor="init-summary" className="block text-xs font-semibold text-slate-700 mb-1">
                Propuesta de valor en una frase
              </label>
              <input
                id="init-summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Ej. Plataforma de telemedicina con recordatorios automáticos para clínicas"
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── PASO 2: EXPECTATIVAS Y DIAGNÓSTICO ── */}
      {currentStep === 2 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">¿Qué te motiva a buscar mentoría?</h1>
            <p className="text-xs text-slate-500 mt-1">
              Selecciona tu objetivo principal para emparejarte con el mentor más afín y orientar el acuerdo.
            </p>
          </div>

          {/* Cuadrícula de 6 Opciones */}
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
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50",
                  )}
                >
                  <div className="text-2xl mb-3">{m.icon}</div>
                  <div>
                    <p className={cx("text-xs font-bold", selected ? "text-blue-900" : "text-slate-900")}>{m.title}</p>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{m.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Área de Captura Contextual */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <label htmlFor="exp-desc" className="block text-xs font-semibold text-slate-800">
                Cuéntanos más sobre tu situación actual y los desafíos críticos
              </label>
              <span className="text-[10px] text-slate-500 font-mono">{description.length}/500</span>
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

      {/* ── PASO 3: COMPATIBILIDAD MENTOR-EMPRENDEDOR ── */}
      {currentStep === 3 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Paso 3: Compatibilidad mentor-emprendedor</h1>
              <p className="text-xs text-slate-500 mt-1">
                Análisis de afinidad metodológica, sectorial y disponibilidad de mentoría.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              {compatibilityScore}% Compatibilidad
            </span>
          </div>

          {/* Tarjeta de Matching de IA */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-blue-600 text-white flex flex-col items-center justify-center font-bold text-lg shrink-0 shadow-sm">
              <span>{compatibilityScore}%</span>
              <span className="text-[8px] font-normal uppercase tracking-wider">Afinidad</span>
            </div>

            <div className="space-y-2 text-center sm:text-left min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  {initiativeName ? `Mentoría recomendada para ${initiativeName}` : "Compatibilidad de mentoría"}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                  Verificado por IA
                </span>
              </div>

              {availableMentors.length > 0 && (
                <div className="pt-1">
                  <label htmlFor="mentor-select" className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Mentor sugerido asignado:
                  </label>
                  <select
                    id="mentor-select"
                    value={selectedMentorId}
                    onChange={(e) => setSelectedMentorId(e.target.value)}
                    className="px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 font-semibold focus:outline-none focus:border-blue-600"
                  >
                    {availableMentors.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-xs text-slate-700 leading-relaxed pt-1">
                {compatibilityRationale ||
                  "Alineación estratégica y metodológica verificada. El mentor cuenta con experiencia aplicable para guiar la validación de hipótesis, estructuración de pricing y aceleración de resultados."}
              </p>

              <div className="pt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-2xs font-medium">
                  ✓ Validación de objetivos estructurada
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-2xs font-medium">
                  ✓ Acuerdos de confidencialidad
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-2xs font-medium">
                  ✓ Matching activo de IA
                </span>
                {validationGoals.map((goal, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 rounded-lg bg-blue-100/70 border border-blue-200 text-blue-900 shadow-2xs"
                  >
                    🎯 {goal}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs text-slate-700 font-medium">
              ¿Deseas confirmar la compatibilidad y proceder a formalizar el acuerdo de mentoría?
            </span>
            <button
              type="button"
              onClick={() => {
                setRelationAccepted(true);
                setCurrentStep(4);
              }}
              className={cx(
                "px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer",
                relationAccepted ? "bg-emerald-600 text-white" : "bg-blue-600 text-white hover:bg-blue-700",
              )}
            >
              {relationAccepted ? "✓ Compatibilidad aprobada" : "Confirmar y definir acuerdo"}
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 4: ACUERDO PRELIMINAR Y FORMALIZACIÓN ── */}
      {currentStep === 4 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                Paso 4: Formalización del acuerdo y creación del proyecto
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                Pacta los términos de acompañamiento, compromisos mutuos y activa el espacio colaborativo de mentoría.
              </p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
              Acuerdo vinculante
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="agr-freq" className="block text-xs font-semibold text-slate-700 mb-1">
                Frecuencia de sesiones
              </label>
              <select
                id="agr-freq"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as AgreementFrequency)}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 font-medium focus:outline-none focus:border-blue-600"
              >
                <option value="weekly">Semanal (Intensivo)</option>
                <option value="biweekly">Quincenal (Recomendado)</option>
                <option value="monthly">Mensual (Seguimiento)</option>
              </select>
            </div>
            <div>
              <label htmlFor="agr-dur" className="block text-xs font-semibold text-slate-700 mb-1">
                Duración de sesión
              </label>
              <select
                id="agr-dur"
                value={sessionDurationMinutes}
                onChange={(e) => setSessionDurationMinutes(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 font-medium focus:outline-none focus:border-blue-600"
              >
                <option value={45}>45 minutos</option>
                <option value={60}>60 minutos (Estándar)</option>
                <option value={90}>90 minutos</option>
              </select>
            </div>
            <div>
              <label htmlFor="agr-weeks" className="block text-xs font-semibold text-slate-700 mb-1">
                Duración del ciclo
              </label>
              <select
                id="agr-weeks"
                value={expectedDurationWeeks}
                onChange={(e) => setExpectedDurationWeeks(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 bg-slate-50 font-medium focus:outline-none focus:border-blue-600"
              >
                <option value={8}>8 semanas (2 meses)</option>
                <option value={12}>12 semanas (3 meses)</option>
                <option value={16}>16 semanas (4 meses)</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="agr-goals" className="block text-xs font-semibold text-slate-700 mb-1">
                Objetivo principal del ciclo de mentoría *
              </label>
              <textarea
                id="agr-goals"
                rows={2}
                value={cycleGoals}
                onChange={(e) => setCycleGoals(e.target.value)}
                placeholder="Ej. Validar problema de clientes, fijar modelo de precios y cerrar 5 primeras cartas de intención."
                className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="agr-mentor-comm" className="block text-xs font-semibold text-slate-700 mb-1">
                  Compromisos del mentor
                </label>
                <textarea
                  id="agr-mentor-comm"
                  rows={3}
                  value={mentorCommitments}
                  onChange={(e) => setMentorCommitments(e.target.value)}
                  placeholder="Ej. Revisión quincenal de métricas, apertura de red de contactos y retroalimentación sincera."
                  className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label htmlFor="agr-ent-comm" className="block text-xs font-semibold text-slate-700 mb-1">
                  Compromisos del emprendedor
                </label>
                <textarea
                  id="agr-ent-comm"
                  rows={3}
                  value={entrepreneurCommitments}
                  onChange={(e) => setEntrepreneurCommitments(e.target.value)}
                  placeholder="Ej. Ejecución de experimentos entre sesiones, reporte transparente y preparación previa."
                  className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="agr-conf" className="block text-xs font-semibold text-slate-700 mb-1">
                Términos de confidencialidad
              </label>
              <textarea
                id="agr-conf"
                rows={2}
                value={confidentialityTerms}
                onChange={(e) => setConfidentialityTerms(e.target.value)}
                className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-[11px] focus:outline-none focus:border-blue-600"
              />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-blue-950">Listo para crear el proyecto y comenzar la mentoría</p>
              <p className="text-[11px] text-blue-800 mt-0.5">
                Al confirmar, se creará el proyecto en tu panel, se asignará el mentor y se formalizará el acuerdo.
              </p>
            </div>
            <button
              type="button"
              disabled={isPending || !initiativeName.trim()}
              onClick={handleCreateProjectAndAgreement}
              className="w-full sm:w-auto px-6 py-3 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 shrink-0"
            >
              {isPending ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creando proyecto...
                </>
              ) : (
                <>🚀 Crear Proyecto y Formalizar Acuerdo</>
              )}
            </button>
          </div>

          {actionError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {actionError}
            </div>
          )}
          {actionNotice && (
            <div role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
              <span>{actionNotice}</span>
              {createdProjectId && (
                <Link
                  href={`/app/p/${createdProjectId}`}
                  className="font-bold underline ml-2"
                >
                  Ir al proyecto ahora →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── BARRA DE NAVEGACIÓN INFERIOR ── */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <button
          type="button"
          disabled={currentStep === 1}
          onClick={handlePrev}
          className="px-5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors shadow-2xs cursor-pointer"
        >
          ← Anterior
        </button>

        <div className="flex items-center gap-2">
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
              className="px-6 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-colors shadow-xs"
            >
              Volver al panel
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
