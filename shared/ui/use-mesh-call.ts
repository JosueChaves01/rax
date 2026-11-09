"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { SessionCall } from "@/types/domain";
import { browserSupabase } from "@/lib/supabase/browser";
import { endCallAction, getCallTranscriptAction, startCallAction, synthesizeCallAction } from "@/app/actions";
import type { EndCallResult, IceServer } from "@/lib/services/session-calls";
import { startTranscriptRecorder, type CallPhase, type LiveSegment } from "./use-session-call";

/**
 * Llamada en malla P2P para el flujo B2B (RAX_B2B_FLOW): el mentor de la sesión y hasta
 * `maxParticipants - 1` clientes, cada par con su propia RTCPeerConnection (malla completa). Más de
 * ~4 personas requiere un SFU (plan técnico §6.1); acá el límite se aplica con la presencia del canal:
 * se admite a las primeras personas por orden de llegada (el mentor siempre primero) y quien queda
 * afuera sale sola con un aviso claro, sin afectar a las demás.
 *
 * Diferencias con la llamada 1:1 (use-session-call.ts, que no cambia):
 * - Señales con destinatario (`to`) por par; negocia quien tiene el id menor (sin choques de oferta).
 * - Solo el mentor (host) termina la llamada para todos: avisa, espera el último trozo de audio de
 *   cada persona y cierra en el servidor (transcripción + síntesis). Un cliente solo sale.
 * - Misma transcripción por trozos de cada micrófono (startTranscriptRecorder).
 */

export interface MeshRemote {
  id: string;
  name: string;
  stream: MediaStream | null;
  connection: RTCPeerConnectionState | "waiting";
}

type Signal =
  | { type: "offer" | "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit };

interface PresenceMeta {
  name: string;
  joinedAt: number;
  host: boolean;
}

function safely(fn: () => unknown) {
  try {
    fn();
  } catch (err) {
    console.warn("[llamada]", err);
  }
}

/** Quiénes quedan dentro con el límite: el host primero, después por orden de llegada. */
export function admitted(entries: Array<{ id: string; meta: PresenceMeta }>, max: number): Set<string> {
  const sorted = [...entries].sort((a, b) => Number(b.meta.host) - Number(a.meta.host) || a.meta.joinedAt - b.meta.joinedAt || a.id.localeCompare(b.id));
  return new Set(sorted.slice(0, Math.max(2, max)).map((e) => e.id));
}

export function useMeshCall(opts: {
  sessionId: string;
  projectId: string;
  me: { id: string; name: string };
  hostId: string;
  maxParticipants: number;
  iceServers: IceServer[];
  transcriptionAvailable: boolean;
}) {
  const { sessionId, projectId, me, iceServers, hostId, maxParticipants } = opts;
  const isHost = me.id === hostId;
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [call, setCall] = useState<SessionCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotes, setRemotes] = useState<MeshRemote[]>([]);
  const [segments, setSegments] = useState<LiveSegment[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hasVideo, setHasVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(opts.transcriptionAvailable);
  const [result, setResult] = useState<EndCallResult | null>(null);
  /** Saliste de la llamada (cliente) o te quedaste afuera por el límite: no hay resultado que mostrar. */
  const [left, setLeft] = useState<null | "left" | "full">(null);

  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const callRef = useRef<SessionCall | null>(null);
  const recorderRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const flushed = useRef<{ waiting: Set<string>; done: () => void } | null>(null);
  const phaseRef = useRef<CallPhase>("idle");
  const transcribingRef = useRef(opts.transcriptionAvailable);
  const joinedAt = useRef(0);
  phaseRef.current = phase;

  const addSegment = useCallback((s: LiveSegment) => {
    setSegments((prev) => (prev.some((p) => p.id === s.id) ? prev : [...prev, s].sort((a, b) => a.offsetMs - b.offsetMs)));
  }, []);

  const send = useCallback(
    (event: string, payload: Record<string, unknown>) => {
      channelRef.current?.send({ type: "broadcast", event, payload: { ...payload, from: me.id } }).catch(() => {});
    },
    [me.id],
  );

  const patchRemote = useCallback((id: string, patch: Partial<MeshRemote>) => {
    setRemotes((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  /* ── WebRTC, una conexión por par ── */

  const dropPeer = useCallback((id: string) => {
    const pc = pcs.current.get(id);
    pcs.current.delete(id);
    pendingIce.current.delete(id);
    if (pc) safely(() => pc.close());
  }, []);

  const newPeerConnection = useCallback(
    (peerId: string) => {
      dropPeer(peerId);
      const pc = new RTCPeerConnection({ iceServers });
      pcs.current.set(peerId, pc);
      localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
      const remote = new MediaStream();
      patchRemote(peerId, { stream: remote, connection: "new" });
      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
        if (!e.streams[0]) remote.addTrack(e.track);
        patchRemote(peerId, { stream: new MediaStream(remote.getTracks()) });
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) send("signal", { type: "ice", to: peerId, candidate: e.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => patchRemote(peerId, { connection: pc.connectionState });
      return pc;
    },
    [dropPeer, iceServers, patchRemote, send],
  );

  const makeOffer = useCallback(
    async (peerId: string) => {
      const pc = newPeerConnection(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send("signal", { type: "offer", to: peerId, sdp: pc.localDescription!.toJSON() });
    },
    [newPeerConnection, send],
  );

  const flushIce = async (peerId: string, pc: RTCPeerConnection) => {
    for (const c of pendingIce.current.get(peerId)?.splice(0) ?? []) await pc.addIceCandidate(c).catch(() => {});
  };

  const onSignal = useCallback(
    async (msg: Signal) => {
      if (msg.to !== me.id) return;
      if (msg.type === "offer") {
        const pc = newPeerConnection(msg.from);
        await pc.setRemoteDescription(msg.sdp);
        await flushIce(msg.from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send("signal", { type: "answer", to: msg.from, sdp: pc.localDescription!.toJSON() });
      } else if (msg.type === "answer") {
        const pc = pcs.current.get(msg.from);
        if (pc && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(msg.sdp);
          await flushIce(msg.from, pc);
        }
      } else if (msg.type === "ice") {
        const pc = pcs.current.get(msg.from);
        if (pc?.remoteDescription) await pc.addIceCandidate(msg.candidate).catch(() => {});
        else pendingIce.current.set(msg.from, [...(pendingIce.current.get(msg.from) ?? []), msg.candidate]);
      }
    },
    [me.id, newPeerConnection, send],
  );

  /* ── Ciclo de vida ── */

  const cleanup = useCallback(() => {
    for (const id of [...pcs.current.keys()]) dropPeer(id);
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setLocalStream(null);
    setRemotes([]);
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) safely(() => browserSupabase()?.removeChannel(channel).catch(() => {}));
  }, [dropPeer]);

  const stopRecorder = useCallback(async () => {
    await recorderRef.current?.stop().catch(() => {});
    recorderRef.current = null;
  }, []);

  /** Presencia: quién está, quién entra con el límite y con quién falta negociar. */
  const onPresence = useCallback(
    (channel: RealtimeChannel) => {
      const state = channel.presenceState<PresenceMeta>();
      const entries = Object.entries(state)
        .flatMap(([id, metas]): Array<{ id: string; meta: PresenceMeta }> => (metas[0] ? [{ id, meta: metas[0] }] : []));
      if (!entries.some((e) => e.id === me.id)) return; // todavía no se registró la propia presencia
      const inside = admitted(entries, maxParticipants);
      if (!inside.has(me.id)) {
        // Llegó tarde: se sale sola sin tocar a las demás.
        setError(`La llamada ya tiene ${maxParticipants} personas, el máximo por ahora. Espera a que alguien salga y vuelve a intentarlo.`);
        setLeft("full");
        stopRecorder().finally(() => {
          cleanup();
          setPhase("ended");
        });
        return;
      }
      const others = entries.filter((e) => e.id !== me.id && inside.has(e.id));
      for (const id of [...pcs.current.keys()]) if (!others.some((o) => o.id === id)) dropPeer(id);
      setRemotes((rs) =>
        others.map((o) => rs.find((r) => r.id === o.id) ?? { id: o.id, name: o.meta.name || "Otra persona", stream: null, connection: "waiting" as const }),
      );
      for (const o of others) {
        const pc = pcs.current.get(o.id);
        const stale = !pc || pc.connectionState === "failed" || pc.connectionState === "closed";
        // Quien tiene el id menor inicia la negociación con cada par; el otro responde.
        if (stale && me.id < o.id) makeOffer(o.id).catch(() => setError("No se pudo iniciar la conexión con una de las personas."));
      }
    },
    [cleanup, dropPeer, makeOffer, maxParticipants, me.id, stopRecorder],
  );

  const join = useCallback(async () => {
    setError(null);
    setResult(null);
    setLeft(null);
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
        // En grupo se baja la resolución: cada persona envía su video a todas las demás.
        video: { width: { ideal: 480 }, height: { ideal: 270 } },
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

    const prev = await getCallTranscriptAction(current.id);
    if (prev.ok && prev.data) setSegments(prev.data.segments.map((s) => ({ id: s.id, speakerId: s.speakerId, speakerName: s.speakerName, body: s.body, offsetMs: s.offsetMs })));

    await sb.realtime.setAuth().catch(() => {});
    const channel = sb.channel(`call:${current.id}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: me.id } },
    });
    channelRef.current = channel;
    joinedAt.current = Date.now();

    channel
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        onSignal(payload as Signal).catch(() => setError("No se pudo negociar la conexión con una de las personas."));
      })
      .on("broadcast", { event: "segment" }, ({ payload }) => {
        const seg = (payload as { segment?: LiveSegment }).segment;
        if (seg) addSegment(seg);
      })
      .on("broadcast", { event: "hangup" }, async ({ payload }) => {
        // Solo cuenta el aviso del mentor: termina la llamada para todos.
        if ((payload as { from?: string }).from !== hostId || phaseRef.current !== "in_call") return;
        setPhase("ending");
        await stopRecorder();
        send("flushed", {});
        window.setTimeout(() => {
          cleanup();
          setPhase("ended");
        }, 300);
      })
      .on("broadcast", { event: "flushed" }, ({ payload }) => {
        const from = (payload as { from?: string }).from;
        const f = flushed.current;
        if (!f || !from) return;
        f.waiting.delete(from);
        if (f.waiting.size === 0) f.done();
      })
      .on("presence", { event: "sync" }, () => onPresence(channel))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: me.name, joinedAt: joinedAt.current, host: isHost } satisfies PresenceMeta);
          setPhase((p) => (p === "joining" ? "in_call" : p));
          if (transcribingRef.current && phaseRef.current !== "ended") {
            recorderRef.current = startTranscriptRecorder({
              stream,
              call: current,
              isEnabled: () => transcribingRef.current,
              onUnavailable: () => {
                transcribingRef.current = false;
                setTranscribing(false);
              },
              onError: setError,
              onSegment: (segment) => {
                addSegment(segment);
                send("segment", { segment });
              },
            });
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError("No se pudo conectar el canal de la llamada. ¿Se aplicaron las migraciones de llamadas?");
        }
      });
  }, [sessionId, me.id, me.name, hostId, isHost, onSignal, onPresence, addSegment, send, cleanup, stopRecorder]);

  /** Mentor: termina para todos. Cliente: sale (la llamada sigue para las demás personas). */
  const hangUp = useCallback(async () => {
    const current = callRef.current;
    if (!current) return;
    setPhase("ending");
    if (!isHost) {
      try {
        await stopRecorder();
      } finally {
        safely(cleanup);
      }
      setLeft("left");
      setPhase("ended");
      return;
    }
    const waiting = new Set(pcs.current.keys());
    const allFlushed = new Promise<void>((resolve) => {
      flushed.current = { waiting, done: resolve };
      window.setTimeout(resolve, waiting.size ? 8000 : 0);
    });
    try {
      send("hangup", {});
      await stopRecorder();
      await allFlushed;
    } finally {
      flushed.current = null;
      safely(cleanup);
    }
    try {
      const res = await endCallAction(projectId, current.id);
      if (res.ok && res.data) setResult(res.data);
      else if (!res.ok) setError(res.error);
      setPhase("ended");
      if (res.ok && res.data?.synthesisPending) {
        const syn = await synthesizeCallAction(projectId, current.id).catch(() => null);
        setResult((prev) =>
          prev
            ? {
                ...prev,
                synthesisPending: false,
                ...(syn?.ok && syn.data ? { synthesis: syn.data } : { synthesisError: syn && !syn.ok ? syn.error : "No se pudo generar la síntesis." }),
              }
            : prev,
        );
      }
    } catch (err) {
      console.error("[llamada] No se pudo cerrar la llamada:", err);
      setError("No se pudo confirmar el cierre de la llamada. Recarga la página: lo transcrito hasta ahora quedó guardado.");
    }
    setPhase("ended");
  }, [isHost, projectId, send, cleanup, stopRecorder]);

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

  useEffect(
    () => () => {
      recorderRef.current?.stop().catch(() => {});
      safely(cleanup);
    },
    [cleanup],
  );

  // Compatibilidad con la vista 1:1: la primera persona conectada ocupa el escenario.
  const first = remotes[0] ?? null;
  return {
    phase,
    call,
    localStream,
    remoteStream: first?.stream ?? null,
    peer: first ? { id: first.id, name: first.name } : null,
    connection: first?.connection ?? ("waiting" as const),
    remotes,
    isHost,
    left,
    segments,
    micOn,
    camOn,
    hasVideo,
    error,
    transcribing,
    result,
    join,
    hangUp,
    toggleMic,
    toggleCam,
    dismissError: () => setError(null),
    reset: () => {
      setPhase("idle");
      setSegments([]);
      setCall(null);
      setLeft(null);
    },
  };
}
