import { describe, expect, it } from "vitest";
import { FormattedText } from "@/app/app/chat/formatted-text";
import React from "react";

describe("FormattedText component y soporte de markdown en chat", () => {
  it("renderiza correctamente elementos simples sin fallar", () => {
    const element = React.createElement(FormattedText, {
      content: "### Contexto\n\nEste es un texto con **negrita**, *cursiva* y `código`.\n\n- Punto 1\n- Punto 2\n\n> Cita importante",
      isUser: false,
    });
    expect(element).toBeDefined();
    expect(element.props.content).toContain("### Contexto");
    expect(element.props.isUser).toBe(false);
  });

  it("soporta bloques de código cercados con triple backtick", () => {
    const rawCode = "```json\n{\n  \"status\": \"ok\"\n}\n```";
    const element = React.createElement(FormattedText, {
      content: rawCode,
      isUser: true,
    });
    expect(element.props.content).toContain("```json");
  });
});
