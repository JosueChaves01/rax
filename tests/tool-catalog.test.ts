import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TOOL_CATALOG, catalogFor, missingFields, readableDateTime, REQUESTABLE_TOOLS } from "@/lib/ai/tool-catalog";

const source = ["lib/ai/claude-orchestrator.ts", "lib/ai/research-tools.ts", "lib/ai/workflow-tools.ts"]
  .map((f) => readFileSync(path.join(__dirname, "..", f), "utf8"))
  .join("\n");

describe("catálogo de herramientas del asistente", () => {
  it("solo nombra herramientas que el agente define", () => {
    for (const entry of TOOL_CATALOG) {
      expect(entry.tools).toContain(entry.primaryTool);
      for (const tool of entry.tools) expect(source, `${entry.id} → ${tool}`).toContain(`name: "${tool}"`);
    }
  });

  it("ids únicos", () => {
    expect(new Set(TOOL_CATALOG.map((t) => t.id)).size).toBe(TOOL_CATALOG.length);
  });

  it("filtra por rol", () => {
    const mentor = catalogFor("mentor").map((t) => t.id);
    const entrepreneur = catalogFor("entrepreneur").map((t) => t.id);
    expect(mentor).toContain("save_mentor_note");
    expect(mentor).not.toContain("request_review");
    expect(entrepreneur).toContain("request_review");
    expect(entrepreneur).not.toContain("save_mentor_note");
  });

  it("arma mensajes legibles con lo elegido", () => {
    const doc = TOOL_CATALOG.find((t) => t.id === "generate_document")!;
    expect(missingFields(doc, {})).toEqual(["Título", "¿Qué debe cubrir?"]);
    const text = doc.prompt({ values: { title: "Plan", topic: "metas y métricas", format: "docx", save: "yes" }, labels: {} });
    expect(text).toContain("Word");
    expect(text).toContain("«Plan»");
    expect(text).toContain("documentos del proyecto");

    const read = TOOL_CATALOG.find((t) => t.id === "read_project_document")!;
    expect(read.prompt({ values: { document: "doc-1" }, labels: { document: "Ventas Q3" } })).toContain("«Ventas Q3»");
  });

  it("fecha y hora en palabras", () => {
    expect(readableDateTime("2026-11-05T15:00")).toMatch(/5 de noviembre a las 15:00/);
  });

  it("todas las herramientas pedibles existen", () => {
    expect(REQUESTABLE_TOOLS.has("web_search")).toBe(true);
    expect(REQUESTABLE_TOOLS.has("draft_field_value")).toBe(false);
  });
});
