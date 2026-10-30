"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { cx } from "@/shared/ui/primitives";
import { loadMainAgentThreadAction, sendMainAgentMessageAction } from "@/app/actions";
import { ChatInput } from "./chat-input";
import { FormattedText } from "./formatted-text";

interface Message {
  id: string;
  sender: "user" | "ai" | "mentor";
  senderName: string;
  text: string;
  time: string;
  chips?: string[];
  provider?: string;
}

export default function ChatClient({ projects }: { projects: Array<{ id: string; name: string }> }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll hacia el último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!projectId) { setMessages([]); return; }
    let active = true;
    void loadMainAgentThreadAction(projectId).then((res) => {
      if (!active) return;
      if (!res.ok || !res.data) {
        setMessages([{ id: `notice-${Date.now()}`, sender: "ai", senderName: "RAX", text: res.ok ? "No se pudo cargar el historial." : res.error, time: "Aviso" }]);
        return;
      }
      setMessages(res.data.messages.map((entry) => ({
        id: entry.id,
        sender: entry.author === "user" ? "user" : "ai",
        senderName: entry.author === "user" ? "Tú" : "RAX",
        text: entry.content,
        time: new Date(entry.createdAt).toLocaleString(),
        chips: entry.proposals.map((proposal) => typeof proposal.title === "string" ? proposal.title : "").filter(Boolean).slice(0, 4),
        provider: entry.author === "assistant" && entry.status === "complete" ? "Agente principal" : undefined,
      })));
    });
    return () => { active = false; };
  }, [projectId]);

  const sendMessageToAgent = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;
    if (!projectId) return;

    setIsLoading(true);

    try {
      const res = await sendMainAgentMessageAction({ projectId, stage: "general", message: textToSend.trim() });
      const agentResult = res.ok ? res.data : undefined;
      const replyText = !res.ok
        ? res.error
        : !agentResult
          ? "El agente no devolvió respuesta."
          : agentResult.ok
            ? agentResult.reply
            : agentResult.message;
      if (res.ok && agentResult?.userMessage && agentResult.assistantMessage) {
        setMessages((prev) => [...prev,
          { id: agentResult.userMessage.id, sender: "user", senderName: "Tú", text: agentResult.userMessage.content, time: new Date(agentResult.userMessage.createdAt).toLocaleString() },
          { id: agentResult.assistantMessage.id, sender: "ai", senderName: "RAX", text: replyText, time: new Date(agentResult.assistantMessage.createdAt).toLocaleString(), chips: agentResult.assistantMessage.proposals.map((proposal) => typeof proposal.title === "string" ? proposal.title : "").filter(Boolean).slice(0, 4), provider: agentResult.ok ? "Agente principal" : undefined },
        ]);
      } else if (!res.ok) {
        setMessages((prev) => [...prev, { id: String(Date.now()), sender: "ai", senderName: "RAX", text: res.error, time: "Aviso" }]);
      }
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
    sendMessageToAgent(chip);
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[calc(100vh-140px)] min-h-[640px] max-h-[850px] overflow-hidden">
      {/* 1. Header: Conversación privada del agente para este usuario y proyecto. */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase">
            IA
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Agente principal RAX</span>
            </h1>
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              {projectId ? "Contexto del proyecto seleccionado · Historial guardado para tu cuenta" : "Selecciona un proyecto"}
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

      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
        <label htmlFor="agent-project" className="text-xs font-semibold text-slate-600">Proyecto</label>
        <select
          id="agent-project"
          value={projectId}
          disabled={!projects.length || isLoading}
          onChange={(event) => {
            setProjectId(event.target.value);
          }}
          className="max-w-[75%] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 disabled:opacity-50"
        >
          {!projects.length && <option value="">Sin proyectos accesibles</option>}
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </div>

      {/* 2. Área de Mensajes */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cx("flex flex-col", m.sender === "user" ? "items-end" : "items-start")}
          >
            <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-500 font-mono">
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
                "max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl text-xs leading-relaxed",
                m.sender === "user"
                  ? "bg-blue-600 text-white rounded-br-xs shadow-xs"
                  : "bg-slate-100 text-slate-900 border border-slate-200/60 rounded-bl-xs"
              )}
            >
              <FormattedText content={m.text} isUser={m.sender === "user"} />
            </div>

            {/* Acciones rápidas propuestas por el agente. */}
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
            <span className="text-[10px] text-slate-500 font-mono px-1">
              RAX • consultando el servicio de chat…
            </span>
            <div className="bg-slate-100 text-slate-500 border border-slate-200/60 rounded-2xl p-4 text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
              <span>Esperando respuesta del servicio de chat...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. Barra de Entrada Enriquecida para Chat */}
      <ChatInput
        onSend={sendMessageToAgent}
        isLoading={isLoading}
        disabled={!projectId}
        placeholder="Escribe tu consulta o pega tu texto largo aquí... (Soporta Markdown: **negrita**, listas y código)"
      />
    </div>
  );
}
