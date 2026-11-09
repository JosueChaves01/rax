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

/** STUN público y, si se configuró, un TURN (TURN_URLS, TURN_USERNAME, TURN_CREDENTIAL). */
export function iceServers(env: NodeJS.ProcessEnv = process.env): IceServer[] {
  const servers: IceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const turn = (env.TURN_URLS ?? "").split(",").map((u) => u.trim()).filter(Boolean);
  if (turn.length) servers.push({ urls: turn, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  return servers;
}

async function loadSession(d: ServiceDeps, sessionId: string) {
  const s = await d.repo.mentorSessions.get(sessionId);
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
    iceServers: canCall ? iceServers() : [],
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
  const [open] = await d.repo.sessionCalls.list({ sessionId, status: "active" });
  if (open) return open;
  const now = d.now();
  const call: SessionCall = {
    id: d.newId("call"),
    sessionId,
    projectId: s.projectId,
    startedBy: d.actor.id,
    status: "active",
    startedAt: now,
    createdAt: now,
  };
  const saved = await sysRepo(d).sessionCalls.insert(call);
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
  const session = isB2BFlow() ? await d.repo.mentorSessions.get(call.sessionId) : undefined;
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
