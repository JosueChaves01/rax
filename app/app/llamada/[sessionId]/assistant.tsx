"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createProjectThreadAction, loadThreadMessagesAction, sendClaudeAgentMessageAction } from "@/app/actions";
import { FormattedText } from "@/app/app/chat/formatted-text";
import { cx } from "@/shared/ui/primitives";

export type RoomMode = "reunion" | "cierre";

interface Msg {
  id: string;
  from: "user" | "assistant";
  text: string;
  failed?: boolean;
}

const SUGGESTIONS: Record<RoomMode, string[]> = {
  reunion: ["¿Qué falta de la agenda?", "Resumime lo que llevamos", "¿Qué pregunta conviene hacer ahora?"],
  cierre: ["Proponé el acuerdo de la sesión", "¿Qué compromisos quedaron?", "Hacé la síntesis más corta"],
};

const threadKey = (sessionId: string) => `rax:sala-hilo:${sessionId}`;

function readThread(sessionId: string): string | null {
  try {
    return window.localStorage.getItem(threadKey(sessionId));
  } catch {
    return null;
  }
}

function saveThread(sessionId: string, id: string) {
  try {
    window.localStorage.setItem(threadKey(sessionId), id);
  } catch {
    /* sin almacenamiento: se crea otro hilo la próxima vez */
  }
}

/* ───────────── Dictado por voz (Web Speech API, si el navegador la tiene) ───────────── */

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}

function newRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function useDictation(onText: (finalText: string, interim: string) => void) {
  const rec = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setSupported(Boolean(newRecognition())), []);

  const stop = useCallback(() => rec.current?.stop(), []);
  const start = useCallback(() => {
    const r = newRecognition();
    if (!r) return;
    r.lang = "es-419";
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e) => {
      let final = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript;
        else interim += res[0].transcript;
      }
      onText(final, interim);
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "El navegador no dio permiso para usar el micrófono." : "No se pudo seguir escuchando.");
    r.onend = () => setListening(false);
    rec.current = r;
    setError(null);
    setListening(true);
    r.start();
  }, [onText]);

  useEffect(() => () => rec.current?.stop(), []);
  return { listening, supported, error, start, stop };
}

/**
 * El asistente de RAX dentro de la sala: un hilo propio de esta sesión, con el contexto del proyecto y
 * del momento (reunión o cierre). Se escribe o se dicta.
 */
export function RoomAssistant({
  projectId,
  sessionId,
  sessionTitle,
  mode,
  isMentor,
  className,
  onClose,
}: {
  projectId: string;
  sessionId: string;
  sessionTitle: string;
  mode: RoomMode;
  isMentor: boolean;
  className?: string;
  onClose?: () => void;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // Si ya se conversó en esta sesión (en este navegador), se retoma el mismo hilo.
  useEffect(() => {
    const saved = readThread(sessionId);
    if (!saved) return;
    setThreadId(saved);
    loadThreadMessagesAction(projectId, saved).then((res) => {
      if (res.ok && res.data) {
        setMessages(res.data.messages.map((m) => ({ id: m.id, from: m.author, text: m.content, failed: m.status === "failed" })));
      }
    });
  }, [projectId, sessionId]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const dictation = useDictation(
    useCallback((final: string, partial: string) => {
      if (final) setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${final.trim()}`);
      setInterim(partial);
    }, []),
  );

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || sending) return;
    dictation.stop();
    setText("");
    setInterim("");
    setError(null);
    setFollowUps([]);
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, from: "user", text: message }]);
    setSending(true);
    try {
      let tid = threadId;
      if (!tid) {
        const created = await createProjectThreadAction(projectId, `Sala · ${sessionTitle}`.slice(0, 120));
        if (!created.ok || !created.data) throw new Error(!created.ok ? created.error : "No se pudo abrir la conversación.");
        tid = created.data.id;
        setThreadId(tid);
        saveThread(sessionId, tid);
      }
      const res = await sendClaudeAgentMessageAction({
        projectId,
        threadId: tid,
        message,
        sessionContext: {
          location: "mentorship_session",
          pageTitle: `Sala de mentoría · ${sessionTitle}`,
          section: mode === "cierre" ? "Cierre de la sesión: síntesis, acuerdo y compromisos" : "Reunión en curso con el mentor",
          isMentorView: isMentor,
        },
      });
      if (!res.ok || !res.data) throw new Error(!res.ok ? res.error : "Sin respuesta.");
      const data = res.data;
      setMessages((m) => [...m.map((x) => (x.id === tempId ? { ...x, id: data.userMessage.id } : x)), { id: data.assistantMessage.id, from: "assistant", text: data.reply, failed: data.assistantMessage.status === "failed" }]);
      setFollowUps(data.followUps ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar.");
    } finally {
      setSending(false);
    }
  };

  const chips = messages.length ? followUps : SUGGESTIONS[mode];

  return (
    <section aria-label="Asistente de RAX" className={cx("flex min-h-0 flex-col bg-white", className)}>
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">Asistente de RAX</p>
          <p className="truncate text-[11px] text-slate-500">{mode === "cierre" ? "Te ayuda a cerrar: síntesis, acuerdo, compromisos" : "Conoce el proyecto y la agenda de esta sesión"}</p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Cerrar el asistente" className="cursor-pointer rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            ✕
          </button>
        )}
      </header>

      <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !sending && (
          <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-3 text-xs leading-relaxed text-slate-500">
            Preguntale lo que necesités durante la sesión o dictale una nota con el micrófono. La conversación queda en el asistente como «Sala · {sessionTitle}».
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cx("flex", m.from === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cx(
                "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm",
                m.from === "user" ? "rounded-br-md bg-blue-600 text-white" : m.failed ? "rounded-bl-md bg-rose-50 text-rose-900" : "rounded-bl-md bg-slate-100 text-slate-800",
              )}
            >
              {m.from === "user" ? <p className="whitespace-pre-wrap">{m.text}</p> : <FormattedText content={m.text} />}
            </div>
          </div>
        ))}
        {sending && <p className="text-xs text-slate-500">RAX está pensando…</p>}
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              disabled={sending}
              onClick={() => send(c)}
              className="cursor-pointer rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <form
        className="border-t border-slate-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5 pl-3 focus-within:border-blue-400">
          <label htmlFor={`sala-msg-${sessionId}`} className="sr-only">
            Mensaje para RAX
          </label>
          <textarea
            id={`sala-msg-${sessionId}`}
            rows={1}
            value={interim ? `${text}${text ? " " : ""}${interim}` : text}
            onChange={(e) => {
              setInterim("");
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder={dictation.listening ? "Escuchando…" : mode === "cierre" ? "Pedile un cambio al borrador…" : "Preguntale a RAX o dictá…"}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          {dictation.supported && (
            <button
              type="button"
              onClick={dictation.listening ? dictation.stop : dictation.start}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? "Dejar de dictar" : "Dictar con la voz"}
              className={cx(
                "grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors",
                dictation.listening ? "bg-rose-600 text-white" : "bg-amber-300 text-amber-950 hover:bg-amber-400",
              )}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden className="h-4 w-4">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
          )}
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="h-9 shrink-0 cursor-pointer rounded-full bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
        {dictation.error && <p className="mt-1.5 text-[11px] text-rose-700">{dictation.error}</p>}
      </form>
    </section>
  );
}
