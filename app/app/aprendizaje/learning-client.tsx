"use client";

import { useEffect, useState } from "react";
import { cx } from "@/shared/ui/primitives";
import { loadMainAgentThreadAction, sendMainAgentMessageAction, evaluateExerciseAction } from "@/app/actions";

type TabKind = "asignados" | "en-progreso" | "completados";

export default function LearningClient({ projects }: { projects: Array<{ id: string; name: string }> }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [tab, setTab] = useState<TabKind>("asignados");
  const [exerciseText, setExerciseText] = useState("");
  const [evaluation, setEvaluation] = useState<{ score: string; feedback: string } | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id?: string; sender: "ai" | "user"; text: string; provider?: string }>>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) { setChatMessages([]); return; }
    let active = true;
    void loadMainAgentThreadAction(projectId).then((res) => {
      if (!active) return;
      if (!res.ok || !res.data) {
        setChatMessages([{ sender: "ai", text: res.ok ? "No se pudo cargar el historial." : res.error }]);
        return;
      }
      setChatMessages(res.data.messages.map((entry) => ({
        id: entry.id,
        sender: entry.author === "user" ? "user" : "ai",
        text: entry.content,
        provider: entry.author === "assistant" && entry.status === "complete" ? "Agente principal" : undefined,
      })));
    });
    return () => { active = false; };
  }, [projectId]);

  const promptChips = [
    "Dar un ejercicio similar",
    "Dar ejemplos prácticos",
    "Revisar mi entrega",
    "Explicar el método",
    "Sugerir siguiente paso",
  ];

  const handleSendPrompt = async (prompt: string) => {
    if (isLoading || !projectId) return;
    setIsLoading(true);

    try {
      const res = await sendMainAgentMessageAction({ projectId, stage: "learning", section: "PREP", message: prompt });
      const agentResult = res.ok ? res.data : undefined;
      const replyText = !res.ok
        ? res.error
        : !agentResult
          ? "El agente no devolvió respuesta."
          : agentResult.ok
            ? agentResult.reply
            : agentResult.message;
      if (res.ok && agentResult?.userMessage && agentResult.assistantMessage) {
        setChatMessages((prev) => [...prev,
          { id: agentResult.userMessage.id, sender: "user", text: agentResult.userMessage.content },
          { id: agentResult.assistantMessage.id, sender: "ai", text: replyText, provider: agentResult.ok ? "Agente principal" : undefined },
        ]);
      } else if (!res.ok) {
        setChatMessages((prev) => [...prev, { sender: "ai", text: res.error }]);
      }
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: "ai" as const,
          text: error instanceof Error ? error.message : "No se pudo conectar con el servicio de chat.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;
    const text = inputMessage;
    setInputMessage("");
    handleSendPrompt(text);
  };

  const handleEvaluate = async () => {
    if (!exerciseText.trim() || isEvaluating) return;
    setIsEvaluating(true);
    setEvaluationError(null);
    try {
      const res = await evaluateExerciseAction(exerciseText);
      if (res.ok) {
        setEvaluation({ score: res.score, feedback: res.feedback });
        setShowAiModal(true);
      } else {
        setEvaluationError(res.error);
      }
    } catch (error) {
      setEvaluationError(error instanceof Error ? error.message : "No se pudo evaluar el ejercicio.");
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Encabezado con Pestañas (Panel 5 del Mock) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Aprendizaje aplicado
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Práctica PREP. El historial del agente se guarda por usuario y proyecto; asignaciones y progreso aún no se registran.
          </p>
        </div>

        {/* Pestañas: [Asignados] | [En progreso] | [Completados] */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          {(
            [
              ["asignados", "Asignados"],
              ["en-progreso", "En progreso"],
              ["completados", "Completados"],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              disabled={t !== "asignados"}
              title={t !== "asignados" ? "El estado de las asignaciones todavía no se persiste." : undefined}
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

      {/* 2. Distribución en 2 Columnas (Panel 5 del Mock) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Columna Izquierda: Tarjeta Principal del Ejercicio (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-xs flex flex-col justify-between space-y-6">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-blue-100 text-blue-700">
                {evaluation ? "Evaluado en esta sesión" : "Ejercicio de muestra"}
              </span>
              <span className="text-xs text-slate-500 font-mono">
                Práctica activa
              </span>
            </div>

            <div>
              <h2 className="text-xl font-bold text-slate-900">
                PREP — Respuesta a objeciones
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Módulo de comunicación comercial y defensa de valor
              </p>
            </div>

            {/* Barra de progreso */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-600">
                <span>Progreso del módulo</span>
                <span className="font-mono text-blue-600">No persistido</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: "0%" }}
                />
              </div>
            </div>

            {/* Resumen */}
            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Resumen conceptual
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed">
                Aprende a estructurar respuestas claras y persuasivas ante dudas o cuestionamientos de clientes usando el marco: Punto, Razón, Ejemplo y Punto de cierre.
              </p>
            </div>

            {/* Tu ejercicio */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Tu ejercicio
                </h3>
                <button
                  type="button"
                  disabled
                  onClick={handleEvaluate}
                  title="PREP aún no está integrado como capacidad del agente principal."
                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  Evaluación PREP no disponible
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Escribe una respuesta a la objeción típica de un cliente: «Tu servicio parece caro frente a alternativas de software gratuitas».
              </p>
              <textarea
                rows={3}
                value={exerciseText}
                onChange={(e) => setExerciseText(e.target.value)}
                placeholder="Escribe aquí tu respuesta aplicando el método PREP (Punto, Razón, Ejemplo, Punto)..."
                className="w-full p-3 text-xs rounded-xl border border-slate-200 bg-white leading-relaxed focus:outline-none focus:border-blue-600"
              />
              {evaluationError && (
                <p role="alert" className="text-xs text-rose-700">{evaluationError}</p>
              )}
            </div>

            {/* Estado Evaluación de IA */}
            {evaluation ? (
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-base">🤖</span>
                  <span className="font-semibold text-emerald-900">
                    Evaluación de IA: {evaluation.score}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAiModal(true)}
                  className="font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  Ver detalle
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                <span className="text-base">🤖</span>
                <span>La evaluación estará disponible cuando PREP se integre al agente principal con un proyecto autorizado.</span>
              </div>
            )}
          </div>

          {/* Botón Continuar */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              type="button"
              disabled
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              title="El catálogo de ejercicios siguientes aún no está conectado."
            >
              Continuar al siguiente ejercicio →
            </button>
          </div>
        </div>

        {/* Columna Derecha: Asistente de IA (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[520px]">
          {/* Cabecera del chat */}
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
              IA
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Asistente conversacional</p>
              <p className="text-[10px] text-amber-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                El agente principal aún no está disponible
              </p>
            </div>
          </div>

          <label className="mt-3 flex items-center gap-2 text-[10px] font-semibold text-slate-600">
            Proyecto
            <select
              value={projectId}
              disabled={!projects.length || isLoading}
              onChange={(event) => {
                setProjectId(event.target.value);
              }}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] disabled:opacity-50"
            >
              {!projects.length && <option value="">Sin proyectos accesibles</option>}
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>

          {/* Hilo de mensajes */}
          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {chatMessages.map((msg, i) => (
              <div
                key={msg.id ?? i}
                className={cx(
                  "flex flex-col",
                  msg.sender === "user" ? "items-end" : "items-start"
                )}
              >
                {msg.provider && (
                  <span className="text-[9px] text-slate-500 font-mono mb-0.5 px-1">
                    vía {msg.provider}
                  </span>
                )}
                <div
                  className={cx(
                    "max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed",
                    msg.sender === "user"
                      ? "bg-blue-600 text-white rounded-br-xs"
                      : "bg-slate-100 text-slate-800 rounded-bl-xs"
                  )}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 p-2">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                <span>Consultando el servicio de IA...</span>
              </div>
            )}
          </div>

          {/* Chips de sugerencias interactivas (Panel 5 del Mock) */}
          <div className="py-2 border-t border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Acciones rápidas de IA
            </p>
            <div className="flex flex-wrap gap-1.5">
              {promptChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={isLoading || !projectId}
                  onClick={() => handleSendPrompt(chip)}
                  className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Input de chat */}
          <form onSubmit={handleCustomSend} className="pt-2 flex items-center gap-2">
            <input
              type="text"
              value={inputMessage}
              disabled={isLoading}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Escribe tu mensaje..."
              className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-blue-600 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !inputMessage.trim()}
              className="p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs disabled:opacity-50"
            >
              ➤
            </button>
          </form>
        </div>
      </div>

      {/* Modal detalle de evaluación */}
      {showAiModal && evaluation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <h3 className="text-base font-bold text-slate-900">
                  Resultado de evaluación
                </h3>
              </div>
              <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-100 text-emerald-800">
                Puntaje: {evaluation.score}
              </span>
            </div>
            <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed p-3.5 bg-slate-50 border border-slate-100 rounded-xl">
              {evaluation.feedback}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold"
              >
                Cerrar detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
