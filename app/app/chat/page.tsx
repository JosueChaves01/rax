"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";

interface Message {
  id: string;
  sender: "user" | "ai" | "mentor";
  senderName: string;
  text: string;
  time: string;
  chips?: string[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "m1",
      sender: "user",
      senderName: "Ana Torres",
      text: "¿Cómo puedo mejorar la explicación de mi propuesta de valor?",
      time: "10:20",
    },
    {
      id: "m2",
      sender: "ai",
      senderName: "RAX IA Assistant",
      text: "Para mejorar tu propuesta de valor, te recomiendo aplicar el método de la Pirámide de Minto. Aquí tienes un resumen rápido y un ejemplo aplicado a tu negocio:\n\n1. Conclusión principal: tu propuesta en una sola frase clara y directa.\n2. Argumentos de apoyo: 3 razones indispensables de valor.\n3. Datos y ejemplos: métricas, testimonios o casos reales comprobables.\n\n¿Quieres que te genere una plantilla personalizada para tu negocio?",
      time: "10:21",
      chips: ["Generar plantilla", "Ver ejemplo práctico", "Seguir la guía"],
    },
  ]);

  const [input, setInput] = useState("");

  const handleChipClick = (chip: string) => {
    const userMsg: Message = {
      id: String(Date.now()),
      sender: "user",
      senderName: "Ana Torres",
      text: chip,
      time: "Ahora",
    };
    const aiMsg: Message = {
      id: String(Date.now() + 1),
      sender: "ai",
      senderName: "RAX IA Assistant",
      text: `Entendido. He preparado el recurso relacionado con "${chip}". Puedes abrir el Centro de Documentos o continuar aquí con una consulta detallada.`,
      time: "Ahora",
      chips: ["Abrir en el editor", "Consultar a mi mentor"],
    };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = {
      id: String(Date.now()),
      sender: "user",
      senderName: "Ana Torres",
      text: input,
      time: "Ahora",
    };

    const replyMsg: Message = {
      id: String(Date.now() + 1),
      sender: "ai",
      senderName: "RAX IA Assistant",
      text: `He analizado tu mensaje: "${input}". Basado en tu expediente de mentoría, esto se relaciona directamente con el objetivo de validación de propuesta comercial.`,
      time: "Ahora",
      chips: ["Crear tarea a partir de esto", "Guardar nota en la sesión"],
    };

    setMessages((prev) => [...prev, userMsg, replyMsg]);
    setInput("");
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[650px] overflow-hidden">
      {/* 1. Cabecera del Chat (Panel 7 del Mock) */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase">
            AT
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">
              Ana Torres · Chat Integrado
            </h1>
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              IA y mentor con acceso al contexto del proyecto
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

            {/* Chips de sugerencias de IA al pie del mensaje (Panel 7 del Mock) */}
            {m.chips && m.chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleChipClick(chip)}
                    className="px-3 py-1 rounded-full border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
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
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu consulta o pide una sugerencia de IA..."
          className="flex-1 px-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
        />

        <button
          type="submit"
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

