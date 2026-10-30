import { describe, expect, it } from "vitest";
import { estimateTokens, evaluateKnowledgeMode } from "@/lib/ai/token-counter";

describe("token-counter y evaluación híbrida", () => {
  it("estima correctamente la cantidad de tokens para textos cortos y largos", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("Hola mundo")).toBeGreaterThan(1);
    
    const sample = "Este es un párrafo de prueba para verificar la estimación de tokens en español.";
    const count = estimateTokens(sample);
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(50);
  });

  it("determina modo in_context cuando los tokens están por debajo del umbral", () => {
    const res = evaluateKnowledgeMode(20_000, 80_000);
    expect(res.mode).toBe("in_context");
    expect(res.exceedsThreshold).toBe(false);
    expect(res.percentOfLimit).toBe(25);
  });

  it("conmuta automáticamente a modo RAG cuando los tokens superan el umbral", () => {
    const res = evaluateKnowledgeMode(95_000, 80_000);
    expect(res.mode).toBe("rag");
    expect(res.exceedsThreshold).toBe(true);
    expect(res.percentOfLimit).toBe(100);
  });
});

