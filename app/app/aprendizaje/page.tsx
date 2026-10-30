"use client";

import { useState } from "react";
import { cx } from "@/shared/ui/primitives";
import { sendN8nChatAction, evaluateExerciseAction } from "@/app/actions";

type TabKind = "asignados" | "en-progreso" | "completados";

export default function LearningPage() {
  const [tab, setTab] = useState<TabKind>("asignados");
  const [exerciseText, setExerciseText] = useState("");
  const [evaluation, setEvaluation] = useState<{ score: string; feedback: string } | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: "ai" | "user"; text: string; provider?: string }>>([
    {
      sender: "ai",
      text: "Hola. Estoy conectado con el flujo de n8n para resolver dudas sobre el método PREP y evaluar tu ejercicio. ¿En qué te ayudo?",
      provider: "n8n",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  const promptChips = [
    "Dar un ejercicio similar",
    "Dar ejemplos prácticos",
    "Revisar mi entrega",
    "Explicar el método",
    "Sugerir siguiente paso",
  ];

  const handleSendPrompt = async (prompt: string) => {
    if (isLoading) return;
    const userMsg = { sender: "user" as const, text: prompt };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await sendN8nChatAction(prompt, chatMessages);
      setChatMessages((prev) => [
        ...prev,
        { sender: "ai" as const, text: res.reply, provider: res.provider },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: "ai" as const,
          text: `En el marco PREP: Punto (conclusión), Razón (por qué), Ejemplo (prueba o caso real) y Punto (cierre contundente). Aplícalo para responder objeciones comerciales sin titubeos.`,
          provider: "openrouter",
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
    try {
      const res = await evaluateExerciseAction(exerciseText);
      if (res.ok) {
        setEvaluation({ score: res.score, feedback: res.feedback });
        setShowAiModal(true);
      }
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
            Micro-módulos y ejercicios prácticos asignados con evaluación en tiempo real mediante workflows de n8n.
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
                {evaluation ? "Evaluado" : "En progreso"}
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
                <span className="font-mono text-blue-600">{evaluation ? "100%" : "0%"}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{ width: evaluation ? "100%" : "0%" }}
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
                  disabled={isEvaluating || !exerciseText.trim()}
                  onClick={handleEvaluate}
                  className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isEvaluating ? "Evaluando con n8n…" : "✨ Evaluar mi respuesta con n8n"}
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
                <span>Redacta tu respuesta arriba y pulsa «Evaluar mi respuesta con n8n» para obtener feedback.</span>
              </div>
            )}
          </div>

          {/* Botón Continuar */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
            <button
              type="button"
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
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
              <p className="text-xs font-bold text-slate-900">Asistente de IA (n8n)</p>
              <p className="text-[10px] text-emerald-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Flujo síncrono activo vía túnel
              </p>
            </div>
          </div>

          {/* Hilo de mensajes */}
          <div className="flex-1 overflow-y-auto py-3 space-y-3">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
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
                <span>Consultando con n8n...</span>
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
                  disabled={isLoading}
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
                  Evaluación en tiempo real (Workflow RAX-99)
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
