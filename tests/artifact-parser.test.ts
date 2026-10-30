import { describe, expect, it } from "vitest";
import { extractArtifacts } from "@/lib/ai/artifact-parser";

describe("artifact-parser (Claude Projects Style)", () => {
  it("extrae artefactos de código y HTML correctamente, limpiando el texto del chat", () => {
    const raw = `He preparado la interfaz solicitada.

<antArtifact identifier="roi-calculator" type="application/vnd.ant.react" title="Calculadora de ROI" language="tsx">
export default function Calculator() {
  return <div>Calculadora</div>;
}
</antArtifact>

Por favor revisa el componente en la ventana lateral.`;

    const result = extractArtifacts(raw);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0].identifier).toBe("roi-calculator");
    expect(result.artifacts[0].type).toBe("application/vnd.ant.react");
    expect(result.artifacts[0].title).toBe("Calculadora de ROI");
    expect(result.artifacts[0].language).toBe("tsx");
    expect(result.artifacts[0].content).toContain("export default function Calculator()");

    expect(result.cleanText).toContain("He preparado la interfaz solicitada.");
    expect(result.cleanText).toContain("Por favor revisa el componente en la ventana lateral.");
    expect(result.cleanText).not.toContain("<antArtifact");
  });

  it("reconoce diagramas Mermaid como tipo específico", () => {
    const raw = `Aquí tienes el diagrama de flujo:
<antArtifact identifier="workflow" type="application/vnd.ant.mermaid" title="Flujo de Validación">
graph TD
  A --> B
</antArtifact>`;

    const result = extractArtifacts(raw);
    expect(result.artifacts[0].type).toBe("application/vnd.ant.mermaid");
    expect(result.artifacts[0].title).toBe("Flujo de Validación");
  });

  it("devuelve el texto intacto si no hay etiquetas de artefacto", () => {
    const raw = "Solo una respuesta en texto plano sin artefactos.";
    const result = extractArtifacts(raw);
    expect(result.artifacts).toHaveLength(0);
    expect(result.cleanText).toBe(raw);
  });
});

