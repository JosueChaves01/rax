"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { cx } from "@/shared/ui/primitives";
import { FormattedText } from "./formatted-text";

interface ChatInputProps {
  onSend: (message: string) => Promise<void> | void;
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const TEMPLATES = [
  {
    id: "structured-query",
    title: "📋 Consulta estructurada",
    description: "Contexto, desafío y pregunta concreta",
    content: `### Contexto
Describe brevemente tu modelo de negocio o fase actual...

### Desafío principal
¿Cuál es el obstáculo o decisión clave que enfrentas?

### Preguntas para RAX
- 1. ¿Cómo abordarías este problema?
- 2. ¿Qué métrica o experimento validar primero?`,
  },
  {
    id: "hypothesis-validation",
    title: "💡 Validación de hipótesis",
    description: "Cliente, propuesta de valor y experimento",
    content: `### Hipótesis de negocio
Creemos que **[segmento de clientes]** experimenta el problema de **[necesidad/fricción]**.

### Propuesta de solución
Ofrecemos una alternativa que destaca por:
- Valor diferencial: 
- Canal de adquisición estimado: 

### Criterio de validación
¿Qué experimento rápido y de bajo costo nos recomiendas ejecutar esta semana?`,
  },
  {
    id: "action-plan",
    title: "🎯 Plan de acción semanal",
    description: "Objetivos y tareas priorizadas",
    content: `### Objetivo del ciclo
Definir y avanzar en las prioridades de los próximos 7 días:

### Tareas propuestas
- [ ] Tarea prioritaria 1: 
- [ ] Tarea prioritaria 2: 
- [ ] Métrica a monitorear: 

### Solicitud a RAX
Revisa si este plan es realista o si detectas algún riesgo de ejecución.`,
  },
  {
    id: "feedback-review",
    title: "🔍 Análisis de retroalimentación",
    description: "Evaluar comentarios de clientes o mentores",
    content: `### Comentarios recibidos
> "Copia o resume aquí la retroalimentación de clientes o mentores..."

### Nuestra interpretación
Creemos que el punto central es:

### Pregunta
¿Qué cambios o pivote preliminar nos sugieres considerar con base en esta evidencia?`,
  },
];

export function ChatInput({
  onSend,
  isLoading,
  disabled = false,
  placeholder = "Escribe tu consulta o pega tu texto largo aquí... (Soporta Markdown con **negrita**, listas y código)",
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [activeTab, setActiveTab] = useState<"write" | "preview">("write");
  const [sendOnEnter, setSendOnEnter] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [isExpandedModal, setIsExpandedModal] = useState(false);
  const [, startTransition] = useTransition();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modalTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize de la altura del textarea normal
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const newHeight = Math.min(Math.max(el.scrollHeight, 56), 220);
    el.style.height = `${newHeight}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  // Insertar formato Markdown rodeando la selección o con placeholder
  const applyFormat = useCallback(
    (prefix: string, suffix: string = "", placeholderText: string = "texto") => {
      const activeEl = isExpandedModal ? modalTextareaRef.current : textareaRef.current;
      if (!activeEl) return;

      const start = activeEl.selectionStart;
      const end = activeEl.selectionEnd;
      const currentValue = activeEl.value;

      let newText: string;
      let newSelectionStart: number;
      let newSelectionEnd: number;

      if (start !== end) {
        // Texto seleccionado: rodearlo
        const selected = currentValue.slice(start, end);
        newText = currentValue.slice(0, start) + prefix + selected + suffix + currentValue.slice(end);
        newSelectionStart = start + prefix.length;
        newSelectionEnd = newSelectionStart + selected.length;
      } else {
        // Sin selección: insertar sintaxis con texto de ejemplo
        newText = currentValue.slice(0, start) + prefix + placeholderText + suffix + currentValue.slice(end);
        newSelectionStart = start + prefix.length;
        newSelectionEnd = newSelectionStart + placeholderText.length;
      }

      setText(newText);
      setActiveTab("write");

      // Restaurar foco y selección
      setTimeout(() => {
        activeEl.focus();
        activeEl.setSelectionRange(newSelectionStart, newSelectionEnd);
        adjustHeight();
      }, 0);
    },
    [isExpandedModal, adjustHeight]
  );

  // Insertar prefijo al inicio de línea (para listas o títulos)
  const applyLinePrefix = useCallback(
    (prefix: string) => {
      const activeEl = isExpandedModal ? modalTextareaRef.current : textareaRef.current;
      if (!activeEl) return;

      const start = activeEl.selectionStart;
      const end = activeEl.selectionEnd;
      const currentValue = activeEl.value;

      // Encontrar inicio de la línea actual
      const lineStart = currentValue.lastIndexOf("\n", start - 1) + 1;
      const newText = currentValue.slice(0, lineStart) + prefix + currentValue.slice(lineStart);

      setText(newText);
      setActiveTab("write");

      setTimeout(() => {
        activeEl.focus();
        const newPos = end + prefix.length;
        activeEl.setSelectionRange(newPos, newPos);
        adjustHeight();
      }, 0);
    },
    [isExpandedModal, adjustHeight]
  );

  // Insertar plantilla prediseñada
  const handleApplyTemplate = (templateContent: string) => {
    setText((prev) => {
      if (!prev.trim()) return templateContent;
      return `${prev.trim()}\n\n${templateContent}`;
    });
    setShowTemplates(false);
    setActiveTab("write");
    setTimeout(() => {
      adjustHeight();
      const el = isExpandedModal ? modalTextareaRef.current : textareaRef.current;
      el?.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enviar con Enter (si está activado y no se presionó Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      if (sendOnEnter) {
        e.preventDefault();
        handleSubmit();
      }
    }
    // Enviar con Ctrl+Enter o Cmd+Enter siempre
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || disabled) return;

    if (isExpandedModal) {
      setIsExpandedModal(false);
    }

    startTransition(async () => {
      setText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "56px";
      }
      await onSend(trimmed);
    });
  };

  // Conteo de palabras y caracteres
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="border-t border-slate-200 bg-white">
      {/* 1. Barra superior de navegación del input (Pestañas y utilidades) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pt-2.5 pb-1 border-b border-slate-100 bg-slate-50/70">
        {/* Pestañas: Escribir vs Vista Previa */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("write")}
            className={cx(
              "px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer",
              activeTab === "write"
                ? "bg-white text-blue-700 shadow-2xs border border-slate-200"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
            )}
          >
            <span>✏️</span>
            <span>Escribir</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={cx(
              "px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer",
              activeTab === "preview"
                ? "bg-white text-blue-700 shadow-2xs border border-slate-200"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
            )}
          >
            <span>👁️</span>
            <span>Vista previa</span>
            {text.trim() && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            )}
          </button>
        </div>

        {/* Acciones auxiliares: Plantillas y Modo Expandido */}
        <div className="flex items-center gap-1.5 relative">
          {/* Botón de Plantillas Rápidas */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTemplates((prev) => !prev)}
              className={cx(
                "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 cursor-pointer",
                showTemplates
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs"
              )}
              title="Insertar plantillas estructuradas para textos largos"
            >
              <span>📋</span>
              <span className="hidden sm:inline">Plantillas</span>
              <span className="text-[10px] text-slate-400">▾</span>
            </button>

            {/* Menú desplegable de plantillas */}
            {showTemplates && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowTemplates(false)}
                />
                <div className="absolute right-0 bottom-full mb-1 w-72 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-30 space-y-1">
                  <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    Estructuras para textos largos
                  </div>
                  {TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => handleApplyTemplate(tmpl.content)}
                      className="w-full text-left p-2 rounded-lg hover:bg-blue-50/80 transition-colors group cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-slate-800 group-hover:text-blue-700">
                        {tmpl.title}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {tmpl.description}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Botón para expandir editor a modo amplio */}
          <button
            type="button"
            onClick={() => setIsExpandedModal(true)}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-2xs text-xs flex items-center gap-1 cursor-pointer"
            title="Expandir editor para redactar textos largos cómodamente"
          >
            <span>⤢</span>
            <span className="hidden sm:inline text-[11px] font-medium">Ampliar</span>
          </button>
        </div>
      </div>

      {/* 2. Barra de herramientas de formato (solo visible en pestaña Escribir) */}
      {activeTab === "write" && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-100 bg-white overflow-x-auto text-xs text-slate-600">
          <span className="text-[11px] font-medium text-slate-400 mr-1 hidden sm:inline">Formato:</span>

          <button
            type="button"
            onClick={() => applyFormat("**", "**", "texto en negrita")}
            className="p-1.5 px-2 rounded hover:bg-slate-100 font-bold text-slate-800 cursor-pointer"
            title="Negrita (**texto**)"
          >
            B
          </button>

          <button
            type="button"
            onClick={() => applyFormat("*", "*", "texto en cursiva")}
            className="p-1.5 px-2 rounded hover:bg-slate-100 italic font-serif text-slate-800 cursor-pointer"
            title="Cursiva (*texto*)"
          >
            I
          </button>

          <button
            type="button"
            onClick={() => applyLinePrefix("### ")}
            className="p-1.5 px-2 rounded hover:bg-slate-100 font-bold text-slate-800 text-xs cursor-pointer"
            title="Título (### Título)"
          >
            H
          </button>

          <div className="w-[1px] h-4 bg-slate-200 mx-1" />

          <button
            type="button"
            onClick={() => applyLinePrefix("- ")}
            className="p-1.5 px-2 rounded hover:bg-slate-100 text-slate-800 cursor-pointer"
            title="Lista con viñetas (- elemento)"
          >
            • Lista
          </button>

          <button
            type="button"
            onClick={() => applyLinePrefix("1. ")}
            className="p-1.5 px-2 rounded hover:bg-slate-100 text-slate-800 cursor-pointer"
            title="Lista numerada (1. elemento)"
          >
            1. Lista
          </button>

          <button
            type="button"
            onClick={() => applyLinePrefix("> ")}
            className="p-1.5 px-2 rounded hover:bg-slate-100 text-slate-800 cursor-pointer"
            title="Cita (> cita)"
          >
            “” Cita
          </button>

          <div className="w-[1px] h-4 bg-slate-200 mx-1" />

          <button
            type="button"
            onClick={() => applyFormat("`", "`", "código")}
            className="p-1.5 px-2 rounded hover:bg-slate-100 font-mono text-[11px] text-slate-800 cursor-pointer"
            title="Código en línea (`código`)"
          >
            `código`
          </button>

          <button
            type="button"
            onClick={() => applyFormat("```\n", "\n```", "bloque de código")}
            className="p-1.5 px-2 rounded hover:bg-slate-100 font-mono text-[11px] text-slate-800 cursor-pointer"
            title="Bloque de código (```código```)"
          >
            &lt;/&gt;
          </button>

          {text.trim() && (
            <button
              type="button"
              onClick={() => {
                setText("");
                if (textareaRef.current) textareaRef.current.style.height = "56px";
              }}
              className="ml-auto p-1.5 px-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded text-xs transition-colors cursor-pointer"
              title="Borrar todo el texto"
            >
              ✕ Limpiar
            </button>
          )}
        </div>
      )}

      {/* 3. Área de entrada o Vista Previa */}
      <div className="p-3">
        {activeTab === "write" ? (
          <textarea
            ref={textareaRef}
            value={text}
            disabled={disabled || isLoading}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            className="w-full px-3.5 py-2.5 text-xs text-slate-900 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 disabled:opacity-50 resize-y transition-all leading-relaxed placeholder:text-slate-400 min-h-[56px] max-h-[220px]"
          />
        ) : (
          <div className="min-h-[72px] max-h-[220px] overflow-y-auto p-3.5 bg-slate-50/70 rounded-xl border border-slate-200 text-xs">
            {text.trim() ? (
              <FormattedText content={text} isUser={false} />
            ) : (
              <p className="text-slate-400 italic">
                Escribe algo en la pestaña «Escribir» para ver la vista previa con formato.
              </p>
            )}
          </div>
        )}
      </div>

      {/* 4. Barra inferior de envío, contadores y opciones */}
      <div className="px-3.5 pb-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
        <div className="flex items-center gap-3">
          {/* Contador de palabras y caracteres */}
          <span className="font-mono text-slate-500">
            {wordCount} {wordCount === 1 ? "palabra" : "palabras"} · {charCount} car.
          </span>

          <span className="text-slate-300 hidden sm:inline">•</span>

          {/* Atajo de teclado descriptivo */}
          <span className="text-slate-400 hidden sm:inline">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-sans">
              Enter
            </kbd>{" "}
            para enviar ·{" "}
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-sans">
              Shift+Enter
            </kbd>{" "}
            nueva línea
          </span>

          {/* Toggle para enviar con Enter */}
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 select-none ml-1">
            <input
              type="checkbox"
              checked={sendOnEnter}
              onChange={(e) => setSendOnEnter(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
            />
            <span className="text-[11px]">Enviar con Enter</span>
          </label>
        </div>

        {/* Botón de Enviar */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            disabled={disabled || isLoading || !text.trim()}
            onClick={handleSubmit}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Enviando…</span>
              </>
            ) : (
              <>
                <span>Enviar</span>
                <span className="text-sm">↗</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 5. Modal de Pantalla Completa / Modo Redacción Ampliada para textos largos */}
      {isExpandedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header del Modal */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2">
                <span className="text-base">📝</span>
                <h3 className="text-sm font-bold text-slate-900">
                  Modo de redacción amplia
                </h3>
                <span className="text-xs text-slate-500 font-normal">
                  — Ideal para textos largos, propuestas o consultas estructuradas
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsExpandedModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors cursor-pointer"
                title="Cerrar ventana ampliada"
              >
                ✕
              </button>
            </div>

            {/* Toolbar en Modal */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => applyFormat("**", "**", "texto en negrita")}
                  className="p-1.5 px-2.5 rounded hover:bg-slate-100 font-bold text-slate-800 cursor-pointer"
                  title="Negrita"
                >
                  B
                </button>
                <button
                  type="button"
                  onClick={() => applyFormat("*", "*", "texto en cursiva")}
                  className="p-1.5 px-2.5 rounded hover:bg-slate-100 italic font-serif text-slate-800 cursor-pointer"
                  title="Cursiva"
                >
                  I
                </button>
                <button
                  type="button"
                  onClick={() => applyLinePrefix("### ")}
                  className="p-1.5 px-2.5 rounded hover:bg-slate-100 font-bold text-slate-800 cursor-pointer"
                  title="Título"
                >
                  H
                </button>
                <div className="w-[1px] h-4 bg-slate-200 mx-1" />
                <button
                  type="button"
                  onClick={() => applyLinePrefix("- ")}
                  className="p-1.5 px-2.5 rounded hover:bg-slate-100 text-slate-800 cursor-pointer"
                  title="Viñetas"
                >
                  • Viñetas
                </button>
                <button
                  type="button"
                  onClick={() => applyLinePrefix("1. ")}
                  className="p-1.5 px-2.5 rounded hover:bg-slate-100 text-slate-800 cursor-pointer"
                  title="Numeración"
                >
                  1. Numeración
                </button>
                <button
                  type="button"
                  onClick={() => applyLinePrefix("> ")}
                  className="p-1.5 px-2.5 rounded hover:bg-slate-100 text-slate-800 cursor-pointer"
                  title="Cita"
                >
                  “” Cita
                </button>
                <div className="w-[1px] h-4 bg-slate-200 mx-1" />
                <button
                  type="button"
                  onClick={() => applyFormat("```\n", "\n```", "bloque de código")}
                  className="p-1.5 px-2.5 rounded hover:bg-slate-100 font-mono text-[11px] text-slate-800 cursor-pointer"
                  title="Código"
                >
                  &lt;/&gt;
                </button>
              </div>

              {/* Selector de plantilla en modal */}
              <div className="flex items-center gap-1.5">
                <select
                  onChange={(e) => {
                    const tmpl = TEMPLATES.find((t) => t.id === e.target.value);
                    if (tmpl) handleApplyTemplate(tmpl.content);
                    e.target.value = "";
                  }}
                  defaultValue=""
                  className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 bg-white"
                >
                  <option value="" disabled>
                    Insertar plantilla...
                  </option>
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Cuerpo del Modal: Pestañas o Vista dividida */}
            <div className="p-4 flex-1 flex flex-col min-h-[350px] overflow-hidden space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab("write")}
                    className={cx(
                      "px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                      activeTab === "write"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    ✏️ Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("preview")}
                    className={cx(
                      "px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                      activeTab === "preview"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    👁️ Vista previa
                  </button>
                </div>

                <div className="text-xs font-mono text-slate-500">
                  {wordCount} palabras · {charCount} caracteres
                </div>
              </div>

              {activeTab === "write" ? (
                <textarea
                  ref={modalTextareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Redacta con libertad tu texto, requerimientos, hipótesis o consulta extendida..."
                  className="w-full flex-1 p-4 text-xs font-sans text-slate-900 bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 resize-none leading-relaxed min-h-[300px]"
                />
              ) : (
                <div className="w-full flex-1 p-4 bg-slate-50 rounded-xl border border-slate-200 overflow-y-auto min-h-[300px]">
                  {text.trim() ? (
                    <FormattedText content={text} isUser={false} />
                  ) : (
                    <p className="text-slate-400 italic text-xs">
                      No hay contenido aún para previsualizar.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer del Modal */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/80 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Presiona <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px]">Ctrl+Enter</kbd> para enviar directamente
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsExpandedModal(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Volver al chat
                </button>
                <button
                  type="button"
                  disabled={disabled || isLoading || !text.trim()}
                  onClick={handleSubmit}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40"
                >
                  {isLoading ? "Enviando…" : "Enviar consulta"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
