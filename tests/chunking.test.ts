import { describe, expect, it } from "vitest";
import { chunkDocumentText } from "@/lib/ai/chunking";

describe("chunking semántico de documentos", () => {
  it("mantiene textos breves como un único chunk", () => {
    const text = "Este es un documento breve sobre el modelo de negocio.";
    const chunks = chunkDocumentText(text, { targetTokens: 500 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].content).toBe(text);
  });

  it("fragmenta documentos largos preservando párrafos y generando solapamiento", () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) => `Párrafo ${i + 1}: Detalle extenso sobre validación de hipótesis número ${i + 1} con evidencia recopilada.`);
    const fullText = paragraphs.join("\n\n");

    const chunks = chunkDocumentText(fullText, { targetTokens: 50, overlapTokens: 15 });
    expect(chunks.length).toBeGreaterThan(1);

    // Verificar que los chunks están numerados consecutivamente
    chunks.forEach((c, idx) => {
      expect(c.chunkIndex).toBe(idx);
      expect(c.tokenCount).toBeGreaterThan(0);
    });
  });
});

