import { afterAll, describe, expect, it } from "vitest";
import { closeWorlds, world } from "./helpers";
import { createProject, getWorkspace } from "@/lib/services/projects";
import { assignMentor } from "@/lib/services/admin";
import { scheduleSession } from "@/lib/services/mentoring";
import { endCall, getCallTranscript, getSessionCallState, iceServers, startCall, transcribeCallAudio } from "@/lib/services/session-calls";
import { cleanTranscript, GroqTranscriber, TranscriptionUnavailableError, type Transcriber } from "@/lib/ai/transcription";
import { buildProjectState, renderProjectState } from "@/lib/ai/project-state";

afterAll(closeWorlds);

/** Transcriptor de prueba: devuelve lo que diga la cola, en orden. */
function fakeTranscriber(lines: string[]): Transcriber {
  return { available: true, transcribe: async () => lines.shift() ?? "" };
}

const audio = () => ({ data: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }), filename: "fragmento.webm" });

async function setup() {
  const w = await world();
  const ent = w.as("ent1");
  const mentor = w.as("men1");
  const p = await createProject(ent, { name: "CaféRuta", description: "Café de especialidad en ruta", nature: "operating_business" });
  await assignMentor(w.as("adm"), p.id, w.id("men1"));
  const session = await scheduleSession(ent, p.id, { kind: "follow_up", scheduledAt: "2026-11-05T15:00:00.000Z" });
  return { ...w, ent, mentor, p, session };
}

describe("Llamadas con transcripción entre mentor y emprendedor", () => {
  it("abre una sola llamada por sesión y solo para mentor y equipo del proyecto", async () => {
    const { ent, mentor, session, as } = await setup();
    await expect(startCall(as("ent2"), session.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(startCall(as("men2"), session.id)).rejects.toMatchObject({ code: "not_found" });

    const call = await startCall(mentor, session.id);
    const joined = await startCall(ent, session.id);
    expect(joined.id).toBe(call.id);

    const state = await getSessionCallState(ent, session.id, fakeTranscriber([]));
    expect(state.canCall).toBe(true);
    expect(state.activeCall?.id).toBe(call.id);
    expect(state.transcriptionAvailable).toBe(true);
  });

  it("transcribe la voz de cada persona, la guarda como documento del proyecto y propone próximos pasos", async () => {
    const { ent, mentor, session, p, repo } = await setup();
    const call = await startCall(mentor, session.id);

    const t = fakeTranscriber([
      "¿Cómo te fue con los clientes de oficina?",
      "Hablé con cinco, a tres les interesa una suscripción semanal.",
      "Subtítulos realizados por la comunidad de Amara.org",
      "Voy a entrevistar a diez oficinas más antes del viernes.",
    ]);
    await transcribeCallAudio(mentor, call.id, audio(), 0, t);
    await transcribeCallAudio(ent, call.id, audio(), 15_000, t);
    // Frase inventada por Whisper en un silencio: se descarta.
    expect(await transcribeCallAudio(mentor, call.id, audio(), 30_000, t)).toBeNull();
    await transcribeCallAudio(ent, call.id, audio(), 45_000, t);

    const live = await getCallTranscript(ent, call.id);
    expect(live.segments.map((s) => s.speakerName)).toEqual(["Mentora Asignada", "Emprendedora Uno", "Emprendedora Uno"]);

    const res = await endCall(ent, call.id);
    expect(res.call.status).toBe("ended");
    expect(res.segments).toBe(3);
    expect(res.documentId).toBeDefined();

    const doc = await repo.projectDocuments.get(res.documentId!);
    expect(doc?.projectId).toBe(p.id);
    expect(doc?.title).toContain("Transcripción de llamada");
    expect(doc?.content).toContain("[00:15] Emprendedora Uno: Hablé con cinco");
    expect(doc?.content).not.toContain("Amara");
    expect((await repo.projectDocumentChunks.list({ documentId: doc!.id })).length).toBeGreaterThan(0);

    // La síntesis pos-sesión se arma con la transcripción y sus compromisos se pueden adoptar como tareas.
    expect(res.synthesis?.entrepreneurCommitments.map((c) => c.title).join(" ")).toContain("Voy a entrevistar a diez oficinas");
    const saved = await repo.mentorSessions.get(session.id);
    expect(saved?.postSessionSynthesis?.summary).toContain("De la llamada");

    // El agente ve la síntesis en el estado del proyecto.
    const ws = await getWorkspace(ent, p.id);
    const state = renderProjectState(buildProjectState(ws, "entrepreneur", "2026-11-05T00:00:00.000Z"));
    expect(state).toContain("Última síntesis pos-sesión");
    expect(state).toContain("Voy a entrevistar a diez oficinas");

    // Ya colgada, no se agregan más fragmentos.
    await expect(transcribeCallAudio(ent, call.id, audio(), 60_000, fakeTranscriber(["hola"]))).rejects.toMatchObject({ code: "validation" });
    const after = await getSessionCallState(mentor, session.id, fakeTranscriber([]));
    expect(after.activeCall).toBeNull();
    expect(after.pastCalls[0]?.transcriptDocumentId).toBe(res.documentId);
  });

  it("sin transcripción la llamada cierra igual y no crea documento", async () => {
    const { ent, mentor, session } = await setup();
    const call = await startCall(ent, session.id);
    await expect(transcribeCallAudio(mentor, call.id, audio(), 0, { available: false, transcribe: async () => "" })).rejects.toBeInstanceOf(
      TranscriptionUnavailableError,
    );
    const res = await endCall(mentor, call.id);
    expect(res.call.status).toBe("ended");
    expect(res.documentId).toBeUndefined();
    expect(res.synthesis).toBeUndefined();
  });

  it("Groq: manda el audio en español y limpia la respuesta", async () => {
    let sent: FormData | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = init.body as FormData;
      return new Response(JSON.stringify({ text: "  Hola,   ¿cómo vas?  " }), { status: 200 });
    }) as unknown as typeof fetch;
    const t = new GroqTranscriber("key", "whisper-large-v3-turbo", fetchImpl);
    expect(await t.transcribe(audio())).toBe("Hola, ¿cómo vas?");
    expect(sent?.get("language")).toBe("es");
    expect(sent?.get("model")).toBe("whisper-large-v3-turbo");
    expect(new GroqTranscriber(undefined).available).toBe(false);
    expect(cleanTranscript("¡Gracias por ver el video!")).toBe("");
  });

  it("agrega TURN solo si está configurado", () => {
    expect(iceServers({} as NodeJS.ProcessEnv)).toHaveLength(1);
    const withTurn = iceServers({ TURN_URLS: "turn:a.example:3478, turns:a.example:443", TURN_USERNAME: "u", TURN_CREDENTIAL: "c" } as unknown as NodeJS.ProcessEnv);
    expect(withTurn[1]).toEqual({ urls: ["turn:a.example:3478", "turns:a.example:443"], username: "u", credential: "c" });
  });
});

describe("Síntesis pos-sesión con modelos gratuitos", () => {
  it("acepta próximos pasos devueltos como lista", async () => {
    const { PostSessionSynthesisSchema } = await import("@/lib/ai/schema");
    const r = PostSessionSynthesisSchema.parse({ summary: "Resumen de la llamada.", nextSteps: ["Entrevistar oficinas", "Medir costos"] });
    expect(r.nextSteps).toBe("Entrevistar oficinas\nMedir costos");
  });
});

describe("Briefing del mentor y síntesis editable", () => {
  it("solo el mentor de la sesión prepara el briefing", async () => {
    const { ent, mentor, session } = await setup();
    const { generatePreSessionBriefing } = await import("@/lib/services/mentoring");
    await expect(generatePreSessionBriefing(ent, session.id)).rejects.toMatchObject({ code: "forbidden" });
    const b = await generatePreSessionBriefing(mentor, session.id);
    expect(b.suggestedAgenda.length).toBeGreaterThan(0);
  });

  it("la síntesis sale de la transcripción y se puede editar o escribir a mano", async () => {
    const { ent, mentor, session, as, repo } = await setup();
    const { generatePostSessionSynthesis, updatePostSessionSynthesis } = await import("@/lib/services/mentoring");
    // Sin llamada ni notas no hay de dónde sacar la síntesis.
    await expect(generatePostSessionSynthesis(ent, session.id)).rejects.toMatchObject({ code: "validation" });

    const call = await startCall(mentor, session.id);
    await transcribeCallAudio(ent, call.id, audio(), 0, fakeTranscriber(["Voy a llamar a tres proveedores de café."]));
    const res = await endCall(mentor, call.id);
    expect(res.synthesis?.basedOn).toBe("transcript");

    await expect(updatePostSessionSynthesis(as("ent2"), session.id, { summary: "x", agreedDecisions: [], entrepreneurCommitments: [], mentorCommitments: [] })).rejects.toMatchObject({ code: "not_found" });
    const edited = await updatePostSessionSynthesis(ent, session.id, {
      summary: "Resumen corregido por la emprendedora.",
      agreedDecisions: ["Priorizar oficinas", "  "],
      entrepreneurCommitments: [...res.synthesis!.entrepreneurCommitments, { title: "Armar precio de suscripción", actionType: "financial_review" }],
      mentorCommitments: [{ title: "Pasar contactos" }],
      nextSteps: "Revisar en dos semanas",
      suggestedNextSessionInDays: 14,
    });
    expect(edited.basedOn).toBe("transcript");
    expect(edited.agreedDecisions).toEqual(["Priorizar oficinas"]);
    expect(edited.editedBy).toBe(ent.actor.id);
    expect((await repo.mentorSessions.get(session.id))?.postSessionSynthesis?.summary).toBe("Resumen corregido por la emprendedora.");
    expect(edited.entrepreneurCommitments.map((c) => c.title)).toContain("Armar precio de suscripción");
  });
});
