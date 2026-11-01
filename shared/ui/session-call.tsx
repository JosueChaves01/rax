"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionCall } from "@/types/domain";
import { adoptPostSessionCommitmentsAction, getCallTranscriptAction, getSessionCallStateAction } from "@/app/actions";
import { Button, Notice, cx, formatDate } from "@/shared/ui/primitives";
import { useSessionCall, type LiveSegment } from "@/shared/ui/use-session-call";
import type { IceServer } from "@/lib/services/session-calls";

interface CallState {
  sessionId: string;
  projectId: string;
  me: { id: string; name: string };
  ready: boolean;
  canCall: boolean;
  transcriptionAvailable: boolean;
  iceServers: IceServer[];
  activeCall: SessionCall | null;
  pastCalls: SessionCall[];
}

const clock = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

function Video({ stream, muted, label, off }: { stream: MediaStream | null; muted?: boolean; label: string; off?: boolean }) {
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

function TranscriptList({ segments, meId, empty }: { segments: LiveSegment[]; meId?: string; empty: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [segments.length]);
  if (!segments.length) return <p className="text-xs text-slate-500">{empty}</p>;
  return (
    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
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

function PastCall({ call, projectId }: { call: SessionCall; projectId: string }) {
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

function Result({ projectId, sessionId, result }: { projectId: string; sessionId: string; result: NonNullable<ReturnType<typeof useSessionCall>["result"]> }) {
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
        </div>
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

function InCall({ state, onDone, onActive }: { state: CallState; onDone: () => void; onActive: (active: boolean) => void }) {
  const c = useSessionCall({
    sessionId: state.sessionId,
    projectId: state.projectId,
    me: state.me,
    iceServers: state.iceServers,
    transcriptionAvailable: state.transcriptionAvailable,
  });
  const live = c.phase === "in_call" || c.phase === "joining" || c.phase === "ending";
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!c.call || c.phase !== "in_call") return;
    const t = window.setInterval(() => setElapsed(Date.now() - Date.parse(c.call!.startedAt)), 1000);
    return () => window.clearInterval(t);
  }, [c.call, c.phase]);

  useEffect(() => {
    onActive(c.phase !== "idle");
    if (c.phase === "ended") onDone();
  }, [c.phase, onDone, onActive]);

  const status =
    c.phase === "joining" ? "Conectando…"
    : c.phase === "ending" ? "Cerrando y guardando la transcripción…"
    : !c.peer ? "Esperando a la otra persona…"
    : c.connection === "connected" ? `En llamada con ${c.peer.name} · ${clock(elapsed)}`
    : c.connection === "failed" ? "No se pudo conectar el audio y video (puede requerir un servidor TURN)."
    : `Conectando con ${c.peer.name}…`;

  return (
    <div className="space-y-3">
      {c.error && (
        <div role="alert" className="flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <span>{c.error}</span>
          <button type="button" className="cursor-pointer font-bold" onClick={c.dismissError} aria-label="Cerrar aviso">×</button>
        </div>
      )}

      {c.phase === "idle" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={c.join}>
            {state.activeCall ? "📞 Unirme a la llamada" : "📞 Iniciar llamada"}
          </Button>
          <p className="max-w-xl text-[11px] leading-relaxed text-slate-500">
            {state.transcriptionAvailable
              ? "Al unirte aceptas que tu voz se transcriba. La transcripción queda guardada en el proyecto y el agente la usa para proponer los siguientes pasos."
              : "La llamada funciona, pero la transcripción está apagada: falta configurar GROQ_API_KEY en el servidor."}
          </p>
        </div>
      )}

      {live && (
        <>
          <p className="text-xs font-semibold text-slate-700">{status}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Video stream={c.remoteStream} label={c.peer?.name ?? "Otra persona"} />
            <Video stream={c.localStream} muted label={`${state.me.name} (tú)`} off={!c.camOn} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={c.toggleMic} disabled={c.phase !== "in_call"}>
              {c.micOn ? "🎙️ Silenciar" : "🔇 Activar micrófono"}
            </Button>
            {c.hasVideo && (
              <Button size="sm" onClick={c.toggleCam} disabled={c.phase !== "in_call"}>
                {c.camOn ? "📷 Apagar cámara" : "📷 Encender cámara"}
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={c.hangUp} disabled={c.phase !== "in_call"}>
              {c.phase === "ending" ? "Guardando…" : "Colgar y guardar"}
            </Button>
            <span className={cx("text-[11px]", c.transcribing ? "text-emerald-700" : "text-slate-500")}>
              {c.transcribing ? "● Transcribiendo" : "Transcripción apagada"}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Transcripción en vivo</p>
            <TranscriptList
              segments={c.segments}
              meId={state.me.id}
              empty={c.transcribing ? "Lo que digan aparecerá aquí cada 15 segundos aproximadamente." : "Sin transcripción en esta llamada."}
            />
          </div>
        </>
      )}

      {c.phase === "ended" && (
        <div className="space-y-3">
          {c.result ? (
            <Result projectId={state.projectId} sessionId={state.sessionId} result={c.result} />
          ) : (
            <Notice tone="info">La llamada terminó. La transcripción y la síntesis se guardan en esta sesión en unos segundos.</Notice>
          )}
          <Button size="sm" onClick={c.reset}>Volver</Button>
        </div>
      )}
    </div>
  );
}

/** Llamada con transcripción dentro de una sesión de mentoría. */
export function SessionCallPanel({ sessionId, className }: { sessionId: string; className?: string }) {
  const router = useRouter();
  const [state, setState] = useState<CallState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inCall, setInCall] = useState(false);

  const load = useCallback(async () => {
    const res = await getSessionCallStateAction(sessionId);
    if (res.ok && res.data) {
      setState(res.data);
      setError(null);
    } else if (!res.ok) setError(res.error);
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Mientras nadie está en la llamada, se revisa cada 15 s si la otra persona ya la abrió.
  useEffect(() => {
    if (inCall) return;
    const t = window.setInterval(load, 15_000);
    return () => window.clearInterval(t);
  }, [inCall, load]);

  const onDone = useCallback(() => {
    window.setTimeout(() => {
      load();
      router.refresh();
    }, 2500);
  }, [load, router]);

  if (error) return null;
  if (!state) return null;
  if (!state.ready) {
    return (
      <div className={className}>
        <Notice tone="warn">Las llamadas necesitan la migración 20261101000003_session_calls.sql en Supabase.</Notice>
      </div>
    );
  }
  if (!state.canCall && !state.pastCalls.length && !inCall) return null;

  return (
    <section className={cx("space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs sm:p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Llamada con transcripción</h3>
          <p className="text-[11px] text-slate-500">
            Videollamada entre el mentor y el emprendedor. Al colgar, lo conversado queda como contexto del proyecto y de esta sesión.
          </p>
        </div>
        {state.activeCall && !inCall && (
          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">● Llamada en curso</span>
        )}
      </div>

      {state.canCall && (
        <InCall state={state} onDone={onDone} onActive={setInCall} />
      )}

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
