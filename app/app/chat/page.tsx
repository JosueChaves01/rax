"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";
import { sendN8nChatAction } from "@/app/actions";

interface Message {
  id: string;
  sender: "user" | "ai" | "mentor";
  senderName: string;
  text: string;
  time: string;
  chips?: string[];
  provider?: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "m1",
      sender: "ai",
      senderName: "RAX IA Assistant",
      text: "¡Hola! Estoy conectado con el workflow de n8n (RAX-02) y tengo acceso al contexto de tu proyecto. ¿En qué objetivo o bloqueo deseas que trabajemos hoy?",
      time: "En línea",
      chips: ["Estructurar mi propuesta de valor", "Resolver bloqueo con clientes", "Preparar la próxima reunión"],
      provider: "n8n",
    },
  ]);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const sendMessageToN8n = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: String(Date.now()),
      sender: "user",
      senderName: "Tú",
      text: textToSend.trim(),
      time: "Ahora",
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const res = await sendN8nChatAction(textToSend, messages);
      const aiMsg: Message = {
        id: String(Date.now() + 1),
        sender: "ai",
        senderName: "RAX IA Assistant",
        text: res.reply,
        time: "Ahora",
        chips: res.chips,
        provider: res.provider,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: unknown) {
      const errorMsg: Message = {
        id: String(Date.now() + 1),
        sender: "ai",
        senderName: "RAX IA Assistant",
        text: `Se produjo un error al comunicar con el asistente: ${err instanceof Error ? err.message : String(err)}`,
        time: "Ahora",
        chips: ["Reintentar"],
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChipClick = (chip: string) => {
    sendMessageToN8n(chip);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input;
    setInput("");
    sendMessageToN8n(text);
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[650px] overflow-hidden">
      {/* 1. Cabecera del Chat Conectado a n8n */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase">
            IA
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Chat de Mentoría Contextual</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 font-mono">
                Workflow RAX-02 Activo
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Sincronizado vía túnel con webhook /rax-chat
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/app/documentos"
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            📚 Plantillas
          </Link>
        </div>
      </div>

      {/* 2. Área de Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cx("flex flex-col", m.sender === "user" ? "items-end" : "items-start")}
          >
            <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400 font-mono">
              <span>{m.senderName}</span>
              <span>•</span>
              <span>{m.time}</span>
              {m.provider && (
                <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[9px]">
                  vía {m.provider}
                </span>
              )}
            </div>

            <div
              className={cx(
                "max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap",
                m.sender === "user"
                  ? "bg-blue-600 text-white rounded-br-xs shadow-xs"
                  : "bg-slate-100 text-slate-900 border border-slate-200/60 rounded-bl-xs"
              )}
            >
              {m.text}
            </div>

            {/* Chips de sugerencias interactivas generadas por n8n */}
            {m.chips && m.chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleChipClick(chip)}
                    className="px-3 py-1 rounded-full border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start space-y-1">
            <span className="text-[10px] text-slate-400 font-mono px-1">
              RAX IA Assistant • procesando con n8n…
            </span>
            <div className="bg-slate-100 text-slate-500 border border-slate-200/60 rounded-2xl p-4 text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
              <span>Analizando contexto y generando respuesta estructurada...</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Barra de Entrada de Chat */}
      <form onSubmit={handleSend} className="p-3.5 border-t border-slate-200 bg-white flex items-center gap-2">
        <button
          type="button"
          title="Adjuntar archivo o evidencia"
          className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
        >
          📎
        </button>

        <input
          type="text"
          value={input}
          disabled={isLoading}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu consulta o pide una sugerencia de IA..."
          className="flex-1 px-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          {isLoading ? "Enviando…" : "Enviar"}
        </button>
      </form>
    </div>
  );
}
