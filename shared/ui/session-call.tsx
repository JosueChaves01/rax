"use client";

import { Component, useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import type { SessionCall } from "@/types/domain";
import { adoptPostSessionCommitmentsAction, getCallTranscriptAction, getSessionCallStateAction } from "@/app/actions";
import { Button, Notice, cx, formatDate } from "@/shared/ui/primitives";
import { useSessionCall, type LiveSegment } from "@/shared/ui/use-session-call";
import type { IceServer } from "@/lib/services/session-calls";

export interface CallState {
  sessionId: string;
  projectId: string;
  me: { id: string; name: string };
  ready: boolean;
  canCall: boolean;
  transcriptionAvailable: boolean;
  iceServers: IceServer[];
  activeCall: SessionCall | null;
  pastCalls: SessionCall[];
  /** Mentor de la sesión (en la malla B2B, quien termina la llamada para todos). */
  hostId?: string;
  /** Malla P2P del flujo B2B en vez de la llamada 1:1. */
  mesh?: boolean;
  maxParticipants?: number;
}

export const clock = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

export function Video({ stream, muted, label, off }: { stream: MediaStream | null; muted?: boolean; label: string; off?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  const hasVideo = Boolean(stream?.getVideoTracks().some((t) => t.readyState === "live")) && !off;
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
      <video ref={ref} autoPlay playsInline muted={muted} className={cx("h-full w-full object-cover", !hasVideo && "invisible")} />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-700 text-lg font-bold text-white">
            {label.slice(0, 1).toUpperCase()}
          </span>
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{label}</span>
    </div>
  );
}

export function TranscriptList({ segments, meId, empty, tall }: { segments: LiveSegment[]; meId?: string; empty: string; tall?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [segments.length]);
  if (!segments.length) return <p className="text-xs text-slate-500">{empty}</p>;
  return (
    <div className={cx("space-y-2 overflow-y-auto pr-1", tall ? "max-h-[50vh]" : "max-h-72")}>
      {segments.map((s) => (
        <p key={s.id} className="text-xs leading-relaxed text-slate-800">
          <span className="font-mono text-[10px] text-slate-400">{clock(s.offsetMs)}</span>{" "}
          <span className={cx("font-semibold", s.speakerId === meId ? "text-blue-700" : "text-emerald-700")}>{s.speakerName}:</span> {s.body}
        </p>
      ))}
      <div ref={end} />
    </div>
  );
}

export function PastCall({ call, projectId }: { call: SessionCall; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [segments, setSegments] = useState<LiveSegment[] | null>(null);
  const toggle = async () => {
    setOpen((o) => !o);
    if (segments) return;
    const res = await getCallTranscriptAction(call.id);
    setSegments(res.ok && res.data ? res.data.segments : []);
  };
  const minutes = call.endedAt ? Math.max(1, Math.round((Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 60000)) : null;
  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-slate-700">
          📞 {formatDate(call.startedAt)}
          {minutes ? ` · ${minutes} min` : ""}
        </span>
        <div className="flex items-center gap-3">
          {call.transcriptDocumentId && (
            <a
              href={`/api/documentos?proyecto=${projectId}&documento=${call.transcriptDocumentId}&formato=pdf`}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Descargar PDF
            </a>
          )}
          <button type="button" onClick={toggle} className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline">
            {open ? "Ocultar transcripción" : "Ver transcripción"}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          {segments === null ? (
            <p className="text-xs text-slate-500">Cargando…</p>
          ) : (
            <TranscriptList segments={segments} empty="Esta llamada no tiene transcripción." />
          )}
        </div>
      )}
    </li>
  );
}

export function Result({ projectId, sessionId, result }: { projectId: string; sessionId: string; result: NonNullable<ReturnType<typeof useSessionCall>["result"]> }) {
  const [adopted, setAdopted] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const syn = result.synthesis;
  if (!result.segments) {
    return <Notice tone="warn">La llamada terminó sin transcripción (no se detectó voz o la transcripción no estaba disponible).</Notice>;
  }
  return (
    <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-900">✓ Transcripción guardada en el proyecto</p>
      <p className="text-xs text-emerald-900">
        Quedó como documento del proyecto ({result.segments} fragmentos), así que el agente la usa como contexto en el chat.
      </p>
      {syn ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800">
          <p className="font-bold text-slate-900">Lo que propone el agente para después de la llamada</p>
          <p className="whitespace-pre-wrap leading-relaxed">{syn.summary}</p>
          {syn.agreedDecisions.length > 0 && (
            <div>
              <p className="font-semibold">Acuerdos</p>
              <ul className="list-disc pl-4">{syn.agreedDecisions.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}
          {syn.entrepreneurCommitments.length > 0 && (
            <div>
              <p className="font-semibold">Compromisos del emprendedor</p>
              <ul className="list-disc pl-4">{syn.entrepreneurCommitments.map((c, i) => <li key={i}>{c.title}</li>)}</ul>
            </div>
          )}
          {syn.mentorCommitments.length > 0 && (
            <div>
              <p className="font-semibold">Compromisos del mentor</p>
              <ul className="list-disc pl-4">{syn.mentorCommitments.map((c, i) => <li key={i}>{c.title}</li>)}</ul>
            </div>
          )}
          {syn.nextSteps && <p><span className="font-semibold">Próximos pasos:</span> {syn.nextSteps}</p>}
          <p className="text-[11px] text-slate-500">Puedes corregirla o agregar puntos con «Editar o agregar» en la síntesis de la sesión.</p>
        </div>
      ) : result.synthesisPending ? (
        <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600" aria-live="polite">
          <span className="h-2 w-2 animate-ping rounded-full bg-emerald-600" />
          El agente está preparando la síntesis de la llamada…
        </p>
      ) : (
        result.synthesisError && <Notice tone="warn">No se pudo generar la síntesis ahora: {result.synthesisError}. Puedes generarla luego con «Síntesis pos-sesión».</Notice>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {syn && syn.entrepreneurCommitments.length > 0 && adopted === null && (
          <Button
            size="sm"
            variant="primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setErr(null);
                const res = await adoptPostSessionCommitmentsAction(projectId, sessionId);
                if (res.ok) setAdopted(res.data?.length ?? 0);
                else setErr(res.error);
              })
            }
          >
            {pending ? "Creando tareas…" : "Convertir compromisos en tareas"}
          </Button>
        )}
        {adopted !== null && <span className="text-xs font-semibold text-emerald-800">✓ {adopted} tareas creadas</span>}
        <Link href={`/app/chat?project=${projectId}`} className="text-xs font-semibold text-blue-600 hover:underline">
          Definir los siguientes pasos con el agente →
        </Link>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
    </div>
  );
}

/** Si algo de la llamada falla en el navegador, se avisa aquí y el resto de la página sigue funcionando. */
export class CallErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[llamada] Error en la interfaz de la llamada:", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Notice tone="error">
        La llamada tuvo un problema en este navegador ({this.state.error.message}). Lo transcrito ya quedó guardado; recarga la página para ver la transcripción y la síntesis.
      </Notice>
    );
  }
}

/** Pantalla de la llamada (con el contexto del proyecto al lado) para una sesión. */
export const callRoomHref = (sessionId: string) => `/app/llamada/${sessionId}`;

/** Llamada de una sesión dentro de la página de la sesión: muestra el estado y lleva a la pantalla de la llamada. */
export function SessionCallPanel(props: { sessionId: string; className?: string }) {
  return (
    <CallErrorBoundary>
      <SessionCallPanelInner {...props} />
    </CallErrorBoundary>
  );
}

function SessionCallPanelInner({ sessionId, className }: { sessionId: string; className?: string }) {
  const [state, setState] = useState<CallState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getSessionCallStateAction(sessionId);
    if (res.ok && res.data) {
      setState(res.data);
      setError(null);
    } else if (!res.ok) setError(res.error);
  }, [sessionId]);

  useEffect(() => {
    load();
    // Se revisa cada 15 s si la otra persona ya abrió la llamada.
    const t = window.setInterval(load, 15_000);
    return () => window.clearInterval(t);
  }, [load]);

  if (error || !state) return null;
  if (!state.ready) {
    return (
      <div className={className}>
        <Notice tone="warn">Las llamadas necesitan la migración 20261101000003_session_calls.sql en Supabase.</Notice>
      </div>
    );
  }
  if (!state.canCall && !state.pastCalls.length) return null;

  return (
    <section className={cx("space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Llamada con transcripción</h3>
          <p className="text-[11px] text-slate-500">
            Videollamada entre el mentor y el emprendedor. Al colgar, lo conversado queda como contexto del proyecto y de esta sesión.
          </p>
        </div>
        {state.activeCall && (
          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">● Llamada en curso</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={callRoomHref(sessionId)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-blue-700/50 bg-blue-600 px-5 text-xs font-semibold uppercase tracking-[0.08em] text-white shadow-xs transition-colors hover:bg-blue-700"
        >
          {state.activeCall ? "📞 Unirme a la llamada" : state.canCall ? "📞 Abrir la llamada" : "Ver la pantalla de la llamada"}
        </Link>
        <p className="max-w-xl text-[11px] leading-relaxed text-slate-500">
          La llamada se abre a pantalla completa, con el contexto del proyecto a mano en ventanas: etapa, agenda, diagnóstico, hipótesis, acuerdos,
          tareas, notas y documentos.
        </p>
      </div>

      {state.pastCalls.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Llamadas anteriores</p>
          <ul className="space-y-2">
            {state.pastCalls.map((c) => (
              <PastCall key={c.id} call={c} projectId={state.projectId} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
