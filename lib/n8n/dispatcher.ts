import "server-only";
import { generateHmacSignature } from "./security";
import { RaxEvent, RaxEventSchema, ChatSyncRequest, ChatSyncResponse, ChatSyncResponseSchema } from "./contracts";

export interface DispatchResult {
  ok: boolean;
  status: number;
  correlationId: string;
  error?: string;
  responseBody?: unknown;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export function getN8nBaseUrl(): string | null {
  return process.env.N8N_WEBHOOK_BASE_URL || null;
}

/**
 * Despacha un evento asíncrono desde RAX hacia el workflow de ingesta de n8n (RAX-01).
 */
export async function dispatchEventToN8n(
  eventInput: RaxEvent,
  overrideUrl?: string
): Promise<DispatchResult> {
  const parsedEvent = RaxEventSchema.safeParse(eventInput);
  if (!parsedEvent.success) {
    return {
      ok: false,
      status: 400,
      correlationId: eventInput.correlationId || "unknown",
      error: `Evento inválido: ${parsedEvent.error.message}`,
    };
  }

  const event = parsedEvent.data;
  const baseUrl = overrideUrl ?? getN8nBaseUrl();

  if (!baseUrl) {
    // Si n8n no está configurado, no bloqueamos la app, pero reportamos no configurado
    return {
      ok: false,
      status: 503,
      correlationId: event.correlationId,
      error: "N8N_WEBHOOK_BASE_URL no está configurado en las variables de entorno.",
    };
  }

  const targetUrl = baseUrl.endsWith("/")
    ? `${baseUrl}webhook/rax-events`
    : `${baseUrl}/webhook/rax-events`;

  const bodyString = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateHmacSignature(bodyString, timestamp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rax-signature": signature,
        "x-rax-timestamp": timestamp,
        "x-rax-correlation-id": event.correlationId,
      },
      body: bodyString,
      signal: controller.signal,
    });

    clearTimeout(timer);

    let responseBody: unknown = null;
    try {
      responseBody = await res.json();
    } catch {
      // Puede responder sin body o texto plano
    }

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        correlationId: event.correlationId,
        error: `n8n respondió con estado HTTP ${res.status}`,
        responseBody,
      };
    }

    return {
      ok: true,
      status: res.status,
      correlationId: event.correlationId,
      responseBody,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 500,
      correlationId: event.correlationId,
      error: `Fallo al despachar evento a n8n: ${message}`,
    };
  }
}

/**
 * Invoca el chat conversacional síncrono en n8n (RAX-02).
 */
export async function invokeSyncChatN8n(
  request: ChatSyncRequest,
  overrideUrl?: string
): Promise<{ ok: boolean; response?: ChatSyncResponse; error?: string }> {
  const baseUrl = overrideUrl ?? getN8nBaseUrl();
  if (!baseUrl) {
    return { ok: false, error: "N8N_WEBHOOK_BASE_URL no configurado" };
  }

  const targetUrl = baseUrl.endsWith("/")
    ? `${baseUrl}webhook/rax-chat`
    : `${baseUrl}/webhook/rax-chat`;

  const bodyString = JSON.stringify(request);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = generateHmacSignature(bodyString, timestamp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000); // 45s para generación de modelo

  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rax-signature": signature,
        "x-rax-timestamp": timestamp,
        "x-rax-correlation-id": request.correlationId,
      },
      body: bodyString,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, error: `Error de n8n: HTTP ${res.status}` };
    }

    const json = await res.json();
    const parsed = ChatSyncResponseSchema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, error: `Salida de n8n no conforme al esquema: ${parsed.error.message}` };
    }

    return { ok: true, response: parsed.data };
  } catch (err: unknown) {
    clearTimeout(timer);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

