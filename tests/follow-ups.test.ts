import { describe, expect, it } from "vitest";
import { extractFollowUps, MAX_FOLLOW_UPS } from "@/lib/ai/follow-ups";

describe("extractFollowUps", () => {
  it("quita el bloque del texto y devuelve las sugerencias", () => {
    const raw = "¿Ya hablaste con algún cliente?\n\n<sugerencias>\n- Sí, con dos\n- Todavía no\n</sugerencias>";
    const { cleanText, followUps } = extractFollowUps(raw);
    expect(cleanText).toBe("¿Ya hablaste con algún cliente?");
    expect(followUps).toEqual(["Sí, con dos", "Todavía no"]);
  });

  it("sin bloque no hay sugerencias y el texto queda igual", () => {
    expect(extractFollowUps("Hola")).toEqual({ cleanText: "Hola", followUps: [] });
  });

  it("acepta un bloque sin cerrar, numerado y con comillas, sin repetir ni pasarse del máximo", () => {
    const raw = 'Texto\n<sugerencias>\n1. «Uno»\n2) Dos\n* dos\n- Tres\n- Cuatro\n';
    const { cleanText, followUps } = extractFollowUps(raw);
    expect(cleanText).toBe("Texto");
    expect(followUps).toEqual(["Uno", "Dos", "Tres"]);
    expect(followUps.length).toBe(MAX_FOLLOW_UPS);
  });

  it("descarta sugerencias demasiado largas", () => {
    const { followUps } = extractFollowUps(`a<sugerencias>\n- ${"x".repeat(120)}\n- Corta\n</sugerencias>`);
    expect(followUps).toEqual(["Corta"]);
  });
});
