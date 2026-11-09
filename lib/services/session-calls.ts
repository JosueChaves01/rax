import type { MentorSession, PostSessionSynthesis, SessionCall, SessionCallSegment } from "@/types/domain";
import { SESSION_KIND_LABEL } from "@/features/labels";
import { forbidden, notFound, validation } from "@/lib/errors";
import { cleanTranscript, getTranscriber, TranscriptionUnavailableError, type AudioChunk, type Transcriber } from "@/lib/ai/transcription";
import { addProjectDocument } from "./project-knowledge";
import { generatePostSessionSynthesis } from "./mentoring";
import { audit, guard, sysRepo, type ServiceDeps } from "./base";
import { touch } from "./projects";
import { bySpeech, names, transcriptLines } from "./session-transcript";
import { enforceAiQuota } from "./ai-quota";
import { isB2BFlow } from "@/lib/flags";
import { b2bSessionViewer, type RoomViewer } from "./session-room";
import { loadSessionForAccessCheck } from "./session-visibility";

/**
 * Llamadas entre el mentor de una sesión y la persona emprendedora (dueña o colaboradora del
 * proyecto). El audio viaja por WebRTC directo entre navegadores; cada navegador manda trozos de
 * su propio micrófono para transcribir, así que cada fragmento ya sabe quién habló. Al colgar, la
 * transcripción queda como documento del proyecto (contexto del agente) y genera la síntesis
 * pos-sesión con compromisos que se pueden adoptar como tareas.
 *
 * Pivot B2B (RAX_B2B_FLOW, proyectos con mentor_id): también entran los clientes del proyecto y la
 * llamada es una malla P2P de hasta `MESH_MAX_PARTICIPANTS` personas (el navegador aplica el límite
 * con la presencia del canal, ver use-mesh-call.ts). Solo el mentor de la sesión cierra la llamada
 * para todos; un cliente solo sale de ella.
 */

/** Tope de la malla P2P (proyectos grupales): más personas requieren un SFU (plan §6.1). */
export const MESH_MAX_PARTICIPANTS = 4;

/** Con la bandera B2B: el papel de quien mira en una sesión de un proyecto B2B (o null). */
async function b2bViewer(d: ServiceDeps, session: MentorSession): Promise<RoomViewer | null> {
  return isB2BFlow() ? b2bSessionViewer(d, session) : null;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** STUN público y, si se configuró, un TURN fijo (TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL). */
export function iceServers(env: NodeJS.ProcessEnv = process.env): IceServer[] {
  const servers: IceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turn = (env.TURN_URLS ?? "").split(",").map((u) => u.trim()).filter(Boolean);
  if (turn.length) servers.push({ urls: turn, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  return servers;
}

/** Los navegadores bloquean el puerto 53 en TURN y la conexión se queda esperando: se descartan. */
const usablePort = (url: string) => !/:53(\?|$)/.test(url);

/**
 * Servidores ICE para una llamada. Sin TURN, dos personas en redes distintas (datos móviles, Wi-Fi
 * de oficina o de universidad) muchas veces no logran conectarse: el audio y el video nunca llegan.
 * Con CLOUDFLARE_TURN_KEY_ID y CLOUDFLARE_TURN_API_TOKEN (TURN gratuito de Cloudflare) se piden
 * credenciales temporales en cada llamada; si falla, se usa lo fijo de iceServers().
 */
export async function resolveIceServers(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): Promise<IceServer[]> {
  const base = iceServers(env);
  const keyId = env.CLOUDFLARE_TURN_KEY_ID?.trim();
  const token = env.CLOUDFLARE_TURN_API_TOKEN?.trim();
  if (!keyId || !token) return base;
  try {
    const res = await fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 6 * 60 * 60 }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Cloudflare TURN respondió ${res.status}`);
    const json = (await res.json()) as { iceServers?: IceServer | IceServer[] };
    const list = Array.isArray(json.iceServers) ? json.iceServers : json.iceServers ? [json.iceServers] : [];
    const turn = list
      .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(usablePort) }))
      .filter((s) => s.urls.length && s.urls.some((u) => u.startsWith("turn")));
    return [...base, ...turn];
  } catch (err) {
    console.warn("[session-calls] No se pudieron obtener credenciales TURN:", err instanceof Error ? err.message : err);
    return base;
  }
}

/** Una llamada que sigue «abierta» tras tantas horas quedó colgada (alguien cerró la pestaña). */
const STALE_CALL_MS = 4 * 60 * 60 * 1000;

async function loadSession(d: ServiceDeps, sessionId: string) {
  // Cada llamador verifica después que sea su mentor, del equipo o cliente B2B (assertParticipant).
  const s = await loadSessionForAccessCheck(d, sessionId);
  if (!s) throw notFound("Sesión no encontrada.");
  return s;
}

async function loadCall(d: ServiceDeps, callId: string) {
  const c = await d.repo.sessionCalls.get(callId);
  if (!c) throw notFound("Llamada no encontrada.");
  return c;
}

/** Pueden llamar el mentor de la sesión y quienes llevan el proyecto (dueña o colaboradores); en B2B, sus clientes. */
async function assertParticipant(d: ServiceDeps, session: MentorSession) {
  if ((await b2bViewer(d, session)) === "client") return { isSessionMentor: false, isB2BClient: true };
  const { project, rel } = await guard(d, session.projectId, "project.read");
  const isSessionMentor = session.mentorId === d.actor.id;
  const isTeam = rel.isOwner || rel.isCollaborator;
  if (!isSessionMentor && !isTeam) throw forbidden("Solo el mentor de la sesión y el equipo del proyecto pueden unirse a la llamada.");
  return { project, rel, isSessionMentor, isB2BClient: false };
}

/** Estado de la llamada de una sesión para quien mira: llamada abierta, anteriores y permisos. */
export async function getSessionCallState(d: ServiceDeps, sessionId: string, transcriber: Transcriber = getTranscriber()) {
  const s = await loadSession(d, sessionId);
  const viewer = await b2bViewer(d, s);
  let canJoin = viewer === "client";
  if (!canJoin) {
    const { rel } = await guard(d, s.projectId, "project.read");
    canJoin = s.mentorId === d.actor.id || rel.isOwner || rel.isCollaborator;
  }
  const canCall = canJoin && s.status !== "completed";
  let calls: SessionCall[] = [];
  let ready = true;
  try {
    calls = (await d.repo.sessionCalls.list({ sessionId })).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch (err) {
    // Sin la migración 20261101000003 la tabla no existe: se avisa en vez de romper la sesión.
    ready = false;
    console.warn("[session-calls] Llamadas no disponibles:", err instanceof Error ? err.message : err);
  }
  const active = calls.find((c) => c.status === "active") ?? null;
  return {
    sessionId,
    projectId: s.projectId,
    me: { id: d.actor.id, name: d.actor.name },
    ready,
    canCall: canCall && ready,
    transcriptionAvailable: transcriber.available,
    iceServers: canCall && ready ? await resolveIceServers() : [],
    activeCall: active,
    pastCalls: calls.filter((c) => c.status === "ended"),
    /** Mentor de la sesión: en la malla es quien termina la llamada para todos. */
    hostId: s.mentorId,
    /** Malla P2P (B2B) en vez de la llamada 1:1 de siempre. */
    mesh: viewer !== null,
    maxParticipants: viewer !== null ? MESH_MAX_PARTICIPANTS : 2,
  };
}

/** Abre la llamada de la sesión, o devuelve la que ya está abierta para unirse a ella. */
export async function startCall(d: ServiceDeps, sessionId: string): Promise<SessionCall> {
  const s = await loadSession(d, sessionId);
  await assertParticipant(d, s);
  if (s.status === "completed") throw validation("La sesión ya terminó: agenda una nueva para volver a llamar.");
  const oldestFirst = (a: SessionCall, b: SessionCall) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id);
  const now = d.now();
  const open: SessionCall[] = [];
  for (const c of (await d.repo.sessionCalls.list({ sessionId, status: "active" })).sort(oldestFirst)) {
    // Una llamada vieja que nadie colgó se cierra (guardando lo transcrito) en vez de reabrirla.
    if (Date.parse(now) - Date.parse(c.startedAt) > STALE_CALL_MS) await endCall(d, c.id, { synthesize: false }).catch(() => {});
    else open.push(c);
  }
  if (open[0]) return open[0];
  const call: SessionCall = {
    id: d.newId("call"),
    sessionId,
    projectId: s.projectId,
    startedBy: d.actor.id,
    status: "active",
    startedAt: now,
    createdAt: now,
  };
  let saved: SessionCall;
  try {
    saved = await sysRepo(d).sessionCalls.insert(call);
  } catch (err) {
    // Con el índice único (migración 20261109000301) la otra persona pudo abrirla primero.
    const [winner] = (await d.repo.sessionCalls.list({ sessionId, status: "active" })).sort(oldestFirst);
    if (winner) return winner;
    throw err;
  }
  // Si las dos personas tocaron «Iniciar» casi a la vez, cada una abría su propia llamada y quedaban
  // en canales distintos esperándose para siempre. Gana la más antigua y la otra se descarta.
  const [winner] = (await d.repo.sessionCalls.list({ sessionId, status: "active" })).sort(oldestFirst);
  if (winner && winner.id !== saved.id) {
    await sysRepo(d).sessionCalls.update(saved.id, { status: "ended", endedAt: now, endedBy: d.actor.id }).catch(() => {});
    return winner;
  }
  await audit(d, "session.call_started", { projectId: s.projectId, targetId: saved.id, meta: { sessionId } });
  return saved;
}

async function activeCallFor(d: ServiceDeps, callId: string) {
  const call = await loadCall(d, callId);
  const s = await loadSession(d, call.sessionId);
  const { isB2BClient } = await assertParticipant(d, s);
  return { call, session: s, isB2BClient };
}

/** Guarda un fragmento ya transcrito de la voz de quien llama. */
export async function addCallSegment(d: ServiceDeps, callId: string, text: string, offsetMs: number): Promise<SessionCallSegment | null> {
  const { call } = await activeCallFor(d, callId);
  if (call.status !== "active") throw validation("La llamada ya terminó.");
  const body = cleanTranscript(text);
  if (!body) return null;
  const segment: SessionCallSegment = {
    id: d.newId("seg"),
    callId,
    projectId: call.projectId,
    speakerId: d.actor.id,
    body,
    offsetMs: Math.max(0, Math.min(Math.round(offsetMs) || 0, 2_147_000_000)),
    createdAt: d.now(),
  };
  return sysRepo(d).sessionCallSegments.insert(segment);
}

/** Transcribe un trozo de audio del micrófono de quien llama y lo agrega a la llamada. */
export async function transcribeCallAudio(
  d: ServiceDeps,
  callId: string,
  chunk: AudioChunk,
  offsetMs: number,
  transcriber: Transcriber = getTranscriber(),
): Promise<SessionCallSegment | null> {
  const { call } = await activeCallFor(d, callId);
  if (call.status !== "active") throw validation("La llamada ya terminó.");
  if (!transcriber.available) throw new TranscriptionUnavailableError();
  if (chunk.data.size === 0) return null;
  if (chunk.data.size > 4 * 1024 * 1024) throw validation("El fragmento de audio es demasiado grande.");
  await enforceAiQuota(d, "audio_chunk");
  const text = await transcriber.transcribe(chunk);
  return addCallSegment(d, callId, text, offsetMs);
}

/** Fragmentos de una llamada con el nombre de quien habló (para ver la transcripción en vivo o después). */
export async function getCallTranscript(d: ServiceDeps, callId: string) {
  const call = await loadCall(d, callId);
  const session = isB2BFlow() ? await loadSessionForAccessCheck(d, call.sessionId) : undefined;
  if (!session || (await b2bViewer(d, session)) !== "client") await guard(d, call.projectId, "project.read");
  const segments = (await d.repo.sessionCallSegments.list({ callId })).sort(bySpeech);
  const people = await names(d, segments.map((s) => s.speakerId));
  return {
    call,
    segments: segments.map((s) => ({ ...s, speakerName: people.get(s.speakerId) ?? "Otra persona" })),
  };
}

export interface EndCallResult {
  call: SessionCall;
  documentId?: string;
  synthesis?: PostSessionSynthesis;
  segments: number;
  synthesisError?: string;
  /** La síntesis se genera aparte (synthesizeEndedCall) para que colgar sea inmediato. */
  synthesisPending?: boolean;
}

/**
 * Cuelga la llamada. Con transcripción: la guarda como documento del proyecto (lo lee el agente
 * con el resto del conocimiento) y genera la síntesis pos-sesión con compromisos y próximos pasos.
 */
export async function endCall(d: ServiceDeps, callId: string, opts: { synthesize?: boolean } = {}): Promise<EndCallResult> {
  const synthesize = opts.synthesize ?? true;
  const { call, session, isB2BClient } = await activeCallFor(d, callId);
  // En B2B la transcripción es material del mentor (mentor_only): el cliente sale, no cierra.
  if (isB2BClient) throw forbidden("Solo el mentor termina la llamada para todos. Puedes salir cuando quieras.");
  if (call.status === "ended") {
    return { call, documentId: call.transcriptDocumentId, synthesis: session.postSessionSynthesis, segments: 0 };
  }
  const now = d.now();
  let ended = await sysRepo(d).sessionCalls.update(callId, { status: "ended", endedAt: now, endedBy: d.actor.id });

  const segments = (await d.repo.sessionCallSegments.list({ callId })).sort(bySpeech);
  const result: EndCallResult = { call: ended, segments: segments.length };

  if (segments.length) {
    const people = await names(d, [...segments.map((s) => s.speakerId), session.mentorId, d.actor.id]);
    const speaker = (id: string) => people.get(id) ?? "Otra persona";
    const day = now.slice(0, 10);
    const minutes = Math.max(1, Math.round((Date.parse(now) - Date.parse(call.startedAt)) / 60000));
    const kind = SESSION_KIND_LABEL[session.kind] ?? "Sesión de mentoría";
    const participants = [...new Set(segments.map((s) => s.speakerId))].map(speaker).join(", ");
    const content = [
      `# Transcripción de llamada · ${kind} · ${day}`,
      "",
      `Participantes: ${participants}`,
      `Duración aproximada: ${minutes} min`,
      `Sesión de mentoría: ${session.id}`,
      "",
      "Transcripción automática (puede tener errores). Cada línea indica el minuto y quién habló.",
      "",
      ...transcriptLines(segments, speaker),
    ].join("\n");
    const doc = await addProjectDocument(d, call.projectId, {
      title: `Transcripción de llamada · ${kind} · ${day}`,
      filename: `llamada-${day}-${callId.slice(0, 8)}.md`,
      content,
      fileType: "markdown",
      source: "note",
    });
    ended = await sysRepo(d).sessionCalls.update(callId, { transcriptDocumentId: doc.id });
    result.call = ended;
    result.documentId = doc.id;

    if (synthesize) {
      try {
        result.synthesis = await generatePostSessionSynthesis(d, session.id);
      } catch (err) {
        result.synthesisError = err instanceof Error ? err.message : "No se pudo generar la síntesis.";
        console.warn("[session-calls] No se pudo generar la síntesis pos-llamada:", result.synthesisError);
      }
    } else {
      result.synthesisPending = true;
    }
  }

  await audit(d, "session.call_ended", {
    projectId: call.projectId,
    targetId: callId,
    meta: { sessionId: session.id, segments: segments.length, minutes: Math.round((Date.parse(now) - Date.parse(call.startedAt)) / 60000) },
  });
  await touch(d, call.projectId);
  return result;
}

/**
 * Síntesis pos-sesión de una llamada ya colgada que dejó transcripción. Va en su propio pedido para
 * que colgar no espere a la IA: la pantalla muestra «generando síntesis» mientras tanto.
 */
export async function synthesizeEndedCall(d: ServiceDeps, callId: string): Promise<PostSessionSynthesis> {
  const { call, session, isB2BClient } = await activeCallFor(d, callId);
  if (isB2BClient) throw forbidden("La síntesis la prepara el mentor de la sesión.");
  if (call.status !== "ended") throw validation("La llamada todavía no terminó.");
  if (!call.transcriptDocumentId) throw validation("Esta llamada no tiene transcripción para sintetizar.");
  return generatePostSessionSynthesis(d, session.id);
}
