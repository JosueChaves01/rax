import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

const MAX_CLOCK_DRIFT_SECONDS = 300; // 5 minutos de tolerancia para mitigar replay attacks

export interface SignatureValidationResult {
  valid: boolean;
  reason?: "missing_headers" | "timestamp_expired" | "invalid_signature" | "missing_secret";
}

/**
 * Obtiene el secreto compartido para firmar solicitudes entre RAX y n8n.
 */
export function getN8nSharedSecret(): string {
  const secret = process.env.RAX_N8N_SHARED_SECRET;
  if (!secret) {
    throw new Error("RAX_N8N_SHARED_SECRET no está configurado en el entorno.");
  }
  return secret;
}

/**
 * Genera la firma HMAC-SHA256 para un cuerpo de solicitud y marca de tiempo.
 * Formato: sha256=<hex_digest>
 */
export function generateHmacSignature(body: string, timestamp: string, secret?: string): string {
  const effectiveSecret = secret ?? getN8nSharedSecret();
  const payload = `${timestamp}.${body}`;
  const hmac = createHmac("sha256", effectiveSecret).update(payload).digest("hex");
  return `sha256=${hmac}`;
}

/**
 * Valida la firma HMAC-SHA256 y la marca de tiempo de una solicitud entrante.
 */
export function verifyHmacSignature(
  body: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  secret?: string
): SignatureValidationResult {
  if (!signatureHeader || !timestampHeader) {
    return { valid: false, reason: "missing_headers" };
  }

  const timestampNum = parseInt(timestampHeader, 10);
  if (isNaN(timestampNum)) {
    return { valid: false, reason: "timestamp_expired" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestampNum) > MAX_CLOCK_DRIFT_SECONDS) {
    return { valid: false, reason: "timestamp_expired" };
  }

  let effectiveSecret: string;
  try {
    effectiveSecret = secret ?? getN8nSharedSecret();
  } catch {
    return { valid: false, reason: "missing_secret" };
  }

  const expectedSignature = generateHmacSignature(body, timestampHeader, effectiveSecret);

  try {
    const expectedBuffer = Buffer.from(expectedSignature, "utf-8");
    const actualBuffer = Buffer.from(signatureHeader, "utf-8");

    if (expectedBuffer.length !== actualBuffer.length) {
      return { valid: false, reason: "invalid_signature" };
    }

    const matches = timingSafeEqual(expectedBuffer, actualBuffer);
    if (!matches) {
      return { valid: false, reason: "invalid_signature" };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: "invalid_signature" };
  }
}

