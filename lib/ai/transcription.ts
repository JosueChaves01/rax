/**
 * Transcripción de audio para las llamadas de mentoría. Usa Groq Whisper (API compatible con
 * OpenAI, plan gratuito) desde el servidor: la clave nunca llega al navegador.
 * Variables: GROQ_API_KEY (obligatoria para transcribir), GROQ_TRANSCRIPTION_MODEL (opcional).
 */

export interface AudioChunk {
  data: Blob;
  filename: string;
}

export interface Transcriber {
  readonly available: boolean;
  transcribe(chunk: AudioChunk): Promise<string>;
}

export class TranscriptionUnavailableError extends Error {
  constructor(message = "La transcripción no está configurada: falta GROQ_API_KEY.") {
    super(message);
    this.name = "TranscriptionUnavailableError";
  }
}

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
export const DEFAULT_TRANSCRIPTION_MODEL = "whisper-large-v3-turbo";

/**
 * Whisper a veces "alucina" frases de cierre de video cuando el fragmento es casi silencio.
 * Se descartan para no ensuciar la transcripción ni el contexto del agente.
 */
const HALLUCINATIONS = [
  /subt[ií]tulos (realizados|por) /i,
  /amara\.org/i,
  /^(¡)?gracias por (ver|mirar)( el video)?[.!]*$/i,
  /^suscr[ií]bete/i,
  /^\[?(m[uú]sica|silencio|aplausos)\]?\.?$/i,
];

export function cleanTranscript(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (HALLUCINATIONS.some((re) => re.test(t))) return "";
  return t.slice(0, 8000);
}

export class GroqTranscriber implements Transcriber {
  readonly available: boolean;
  constructor(
    private readonly apiKey = process.env.GROQ_API_KEY,
    private readonly model = process.env.GROQ_TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.available = Boolean(apiKey);
  }

  async transcribe(chunk: AudioChunk): Promise<string> {
    if (!this.apiKey) throw new TranscriptionUnavailableError();
    const form = new FormData();
    form.append("file", chunk.data, chunk.filename);
    form.append("model", this.model);
    form.append("language", "es");
    form.append("response_format", "json");
    form.append("temperature", "0");
    const res = await this.fetchImpl(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429) throw new TranscriptionUnavailableError("Se alcanzó el límite gratuito de transcripción por ahora. Reintenta en unos minutos.");
      throw new Error(`Groq respondió ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as { text?: string };
    return cleanTranscript(json.text ?? "");
  }
}

export function getTranscriber(): Transcriber {
  return new GroqTranscriber();
}
