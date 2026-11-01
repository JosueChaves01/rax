"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { SessionCall } from "@/types/domain";
import { browserSupabase } from "@/lib/supabase/browser";
import { endCallAction, getCallTranscriptAction, startCallAction } from "@/app/actions";
import type { EndCallResult, IceServer } from "@/lib/services/session-calls";

/**
 * Motor de la llamada en el navegador:
 * - Video y audio por WebRTC directo entre las dos personas (STUN público, TURN opcional).
 * - Señalización por un canal privado de Supabase Realtime («call:<id>»), con presencia.
 * - Cada navegador graba su propio micrófono en trozos de ~15 s y los manda a transcribir; si el
 *   trozo fue casi silencio no se envía (ahorra cupo gratuito y evita frases inventadas).
 * - Al colgar, ambos navegadores envían su último trozo antes de cerrar la llamada en el servidor.
 */

export interface LiveSegment {
  id: string;
  speakerId: string;
  speakerName: string;
  body: string;
  offsetMs: number;
}

export type CallPhase = "idle" | "joining" | "in_call" | "ending" | "ended";

const CHUNK_MS = 15_000;
const SPEECH_RMS = 0.015;
const MIN_SPEECH_FRAMES = 3; // ~0,6 s de voz en un trozo

type Signal =
  | { type: "offer" | "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit };

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

export function useSessionCall(opts: {
  sessionId: string;
  projectId: string;
  me: { id: string; name: string };
  iceServers: IceServer[];
  transcriptionAvailable: boolean;
}) {
  const { sessionId, projectId, me, iceServers } = opts;
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [call, setCall] = useState<SessionCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peer, setPeer] = useState<{ id: string; name: string } | null>(null);
  const [connection, setConnection] = useState<RTCPeerConnectionState | "waiting">("waiting");
  const [segments, setSegments] = useState<LiveSegment[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hasVideo, setHasVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(opts.transcriptionAvailable);
  const [result, setResult] = useState<EndCallResult | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const callRef = useRef<SessionCall | null>(null);
  const peerIdRef = useRef<string | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const recorderRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const flushedRef = useRef<() => void>(() => {});
  const phaseRef = useRef<CallPhase>("idle");
  const transcribingRef = useRef(opts.transcriptionAvailable);
  phaseRef.current = phase;

  const addSegment = useCallback((s: LiveSegment) => {
    setSegments((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev, s].sort((a, b) => a.offsetMs - b.offsetMs)));
  }, []);

  const send = useCallback((event: string, payload: Record<string, unknown>) => {
    channelRef.current?.send({ type: "broadcast", event, payload: { ...payload, from: me.id } }).catch(() => {});
  }, [me.id]);

  /* ── WebRTC ── */

  const newPeerConnection = useCallback(() => {
    pcRef.current?.close();
    pendingIce.current = [];
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;
    localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
    const remote = new MediaStream();
    setRemoteStream(remote);
    pc.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
      if (!e.streams[0]) remote.addTrack(e.track);
      setRemoteStream(new MediaStream(remote.getTracks()));
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && peerIdRef.current) send("signal", { type: "ice", to: peerIdRef.current, candidate: e.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => setConnection(pc.connectionState);
    return pc;
  }, [iceServers, send]);

  const makeOffer = useCallback(async () => {
    if (!peerIdRef.current) return;
    const pc = newPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send("signal", { type: "offer", to: peerIdRef.current, sdp: pc.localDescription!.toJSON() });
  }, [newPeerConnection, send]);

  const onSignal = useCallback(async (msg: Signal) => {
    if (msg.to !== me.id) return;
    if (msg.type === "offer") {
      peerIdRef.current = msg.from;
      const pc = newPeerConnection();
      await pc.setRemoteDescription(msg.sdp);
      for (const c of pendingIce.current.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send("signal", { type: "answer", to: msg.from, sdp: pc.localDescription!.toJSON() });
    } else if (msg.type === "answer") {
      const pc = pcRef.current;
      if (pc && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(msg.sdp);
        for (const c of pendingIce.current.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      }
    } else if (msg.type === "ice") {
      const pc = pcRef.current;
      if (pc?.remoteDescription) await pc.addIceCandidate(msg.candidate).catch(() => {});
      else pendingIce.current.push(msg.candidate);
    }
  }, [me.id, newPeerConnection, send]);

  /* ── Transcripción: trozos del propio micrófono ── */

  const startRecorder = useCallback((stream: MediaStream, current: SessionCall) => {
    const track = stream.getAudioTracks()[0];
    const mime = pickMime();
    if (!track || !mime || !transcribingRef.current) return;
    const audioOnly = new MediaStream([track]);
    let speechFrames = 0;
    let stopped = false;
    let uploads: Promise<void>[] = [];

    // Detector simple de voz para no mandar trozos en silencio.
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(audioOnly).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const meter = window.setInterval(() => {
      if (!track.enabled) return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      if (Math.sqrt(sum / buf.length) > SPEECH_RMS) speechFrames++;
    }, 200);

    const upload = async (blob: Blob, offsetMs: number) => {
      const form = new FormData();
      form.append("audio", blob, "fragmento");
      form.append("offsetMs", String(offsetMs));
      try {
        const res = await fetch(`/api/llamadas/${current.id}/audio`, { method: "POST", body: form });
        const json = (await res.json().catch(() => ({}))) as { segment?: LiveSegment | null; error?: string; code?: string };
        if (!res.ok) {
          if (json.code === "transcription_unavailable") {
            transcribingRef.current = false;
            setTranscribing(false);
          }
          if (json.error) setError(json.error);
          return;
        }
        if (json.segment) {
          addSegment(json.segment);
          send("segment", { segment: json.segment });
        }
      } catch {
        setError("Se perdió un fragmento de la transcripción por la conexión.");
      }
    };

    let recorder: MediaRecorder | null = null;
    let timer = 0;
    const cycle = () => {
      if (stopped || !transcribingRef.current) return;
      const startedAt = Date.now();
      const offsetMs = Math.max(0, startedAt - Date.parse(current.startedAt));
      const parts: Blob[] = [];
      speechFrames = 0;
      recorder = new MediaRecorder(audioOnly, { mimeType: mime, audioBitsPerSecond: 32_000 });
      recorder.ondataavailable = (e) => e.data.size && parts.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(parts, { type: mime });
        if (speechFrames >= MIN_SPEECH_FRAMES && blob.size > 0) uploads.push(upload(blob, offsetMs));
        if (!stopped) cycle();
      };
      recorder.start();
      timer = window.setTimeout(() => recorder?.state === "recording" && recorder.stop(), CHUNK_MS);
    };
    cycle();

    recorderRef.current = {
      stop: async () => {
        stopped = true;
        window.clearTimeout(timer);
        window.clearInterval(meter);
        if (recorder?.state === "recording") {
          await new Promise<void>((resolve) => {
            const prev = recorder!.onstop;
            recorder!.onstop = (e) => {
              prev?.call(recorder!, e);
              resolve();
            };
            recorder!.stop();
          });
        }
        const pending = uploads;
        uploads = [];
        await Promise.allSettled(pending);
        ctx.close().catch(() => {});
      },
    };
  }, [addSegment, send]);

  /* ── Ciclo de vida ── */

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    if (channelRef.current) {
      const sb = browserSupabase();
      channelRef.current.unsubscribe().catch(() => {});
      if (sb) sb.removeChannel(channelRef.current).catch(() => {});
      channelRef.current = null;
    }
    peerIdRef.current = null;
    setPeer(null);
    setConnection("waiting");
  }, []);

  const join = useCallback(async () => {
    setError(null);
    setResult(null);
    const sb = browserSupabase();
    if (!sb) return setError("Falta configurar Supabase en el navegador para conectar la llamada.");
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      return setError("Este navegador no permite videollamadas. Prueba con Chrome, Edge, Firefox o Safari actualizados.");
    }
    setPhase("joining");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: { ideal: 640 }, height: { ideal: 360 } },
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        setPhase("idle");
        return setError("Necesitamos permiso para usar tu micrófono. Revisa los permisos del navegador.");
      }
    }
    localRef.current = stream;
    setLocalStream(stream);
    setHasVideo(stream.getVideoTracks().length > 0);
    setMicOn(true);
    setCamOn(stream.getVideoTracks().length > 0);

    const res = await startCallAction(sessionId);
    if (!res.ok || !res.data) {
      stream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
      setPhase("idle");
      return setError(!res.ok ? res.error : "No se pudo iniciar la llamada.");
    }
    const current = res.data;
    callRef.current = current;
    setCall(current);

    // Si alguien vuelve a entrar, recupera lo transcrito hasta ahora.
    const prev = await getCallTranscriptAction(current.id);
    if (prev.ok && prev.data) setSegments(prev.data.segments.map((s) => ({ id: s.id, speakerId: s.speakerId, speakerName: s.speakerName, body: s.body, offsetMs: s.offsetMs })));

    await sb.realtime.setAuth().catch(() => {});
    const channel = sb.channel(`call:${current.id}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: me.id } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        onSignal(payload as Signal).catch(() => setError("No se pudo negociar la conexión con la otra persona."));
      })
      .on("broadcast", { event: "segment" }, ({ payload }) => {
        const seg = (payload as { segment?: LiveSegment }).segment;
        if (seg) addSegment(seg);
      })
      .on("broadcast", { event: "hangup" }, async ({ payload }) => {
        if ((payload as { from?: string }).from === me.id || phaseRef.current !== "in_call") return;
        // La otra persona colgó: se envía el último trozo y se avisa para que cierre la llamada.
        setPhase("ending");
        await recorderRef.current?.stop();
        recorderRef.current = null;
        send("flushed", {});
        window.setTimeout(() => {
          cleanup();
          setPhase("ended");
        }, 300);
      })
      .on("broadcast", { event: "flushed" }, () => flushedRef.current())
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string }>();
        const others = Object.entries(state).filter(([key]) => key !== me.id);
        const other = others[0];
        if (!other) {
          peerIdRef.current = null;
          setPeer(null);
          setConnection("waiting");
          return;
        }
        const [otherId, metas] = other;
        const changed = peerIdRef.current !== otherId || !pcRef.current || pcRef.current.connectionState === "failed" || pcRef.current.connectionState === "closed";
        peerIdRef.current = otherId;
        setPeer({ id: otherId, name: metas[0]?.name ?? "Otra persona" });
        // Quien tiene el id menor inicia la negociación; el otro responde.
        if (changed && me.id < otherId) makeOffer().catch(() => setError("No se pudo iniciar la conexión."));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: me.name });
          setPhase("in_call");
          startRecorder(stream, current);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError("No se pudo conectar el canal de la llamada. ¿Se aplicó la migración de llamadas?");
        }
      });
  }, [sessionId, me.id, me.name, onSignal, addSegment, send, cleanup, makeOffer, startRecorder]);

  const hangUp = useCallback(async () => {
    const current = callRef.current;
    if (!current) return;
    setPhase("ending");
    const hadPeer = Boolean(peerIdRef.current);
    const peerFlushed = new Promise<void>((resolve) => {
      flushedRef.current = resolve;
      window.setTimeout(resolve, hadPeer ? 8000 : 0);
    });
    send("hangup", {});
    await recorderRef.current?.stop();
    recorderRef.current = null;
    await peerFlushed;
    cleanup();
    const res = await endCallAction(projectId, current.id);
    if (res.ok && res.data) setResult(res.data);
    else if (!res.ok) setError(res.error);
    setPhase("ended");
  }, [projectId, send, cleanup]);

  const toggleMic = useCallback(() => {
    const t = localRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
  }, []);

  const toggleCam = useCallback(() => {
    const t = localRef.current?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCamOn(t.enabled);
  }, []);

  // Al salir de la página en plena llamada se liberan cámara y micrófono.
  useEffect(() => () => {
    recorderRef.current?.stop().catch(() => {});
    cleanup();
  }, [cleanup]);

  return {
    phase, call, localStream, remoteStream, peer, connection, segments, micOn, camOn, hasVideo, error, transcribing, result,
    join, hangUp, toggleMic, toggleCam, dismissError: () => setError(null), reset: () => { setPhase("idle"); setSegments([]); setCall(null); },
  };
}
