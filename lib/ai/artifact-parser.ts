import type { AgentArtifact, ArtifactType } from "@/types/domain";

/**
 * Parser para detectar y extraer bloques de artefactos estilo Claude (<antArtifact ...>...</antArtifact>).
 */
export function extractArtifacts(rawText: string): {
  cleanText: string;
  artifacts: AgentArtifact[];
} {
  const artifacts: AgentArtifact[] = [];
  if (!rawText) return { cleanText: "", artifacts };

  const regex = /<antArtifact\s+([^>]+)>([\s\S]*?)<\/antArtifact>/gi;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let cleanText = "";
  let artifactIndex = 1;

  while ((match = regex.exec(rawText)) !== null) {
    cleanText += rawText.slice(lastIndex, match.index);
    lastIndex = match.index + match[0].length;

    const attrString = match[1];
    const content = match[2].trim();

    // Extraer atributos: identifier, type, title, language
    const identifier = getAttribute(attrString, "identifier") || `artifact-${Date.now()}-${artifactIndex}`;
    const rawType = getAttribute(attrString, "type") || "text/html";
    const title = getAttribute(attrString, "title") || `Artefacto ${artifactIndex}`;
    const language = getAttribute(attrString, "language") || undefined;

    const type = normalizeArtifactType(rawType);

    artifacts.push({
      id: `art_${Date.now()}_${artifactIndex}`,
      identifier,
      title,
      type,
      language,
      content,
    });

    artifactIndex++;
  }

  cleanText += rawText.slice(lastIndex);
  cleanText = cleanText.trim();

  return { cleanText, artifacts };
}

function getAttribute(attrString: string, attrName: string): string | null {
  const regex = new RegExp(`${attrName}=["']([^"']+)["']`, "i");
  const match = regex.exec(attrString);
  return match ? match[1] : null;
}

function normalizeArtifactType(raw: string): ArtifactType {
  const lower = raw.toLowerCase().trim();
  if (lower.includes("react") || lower.includes("jsx") || lower.includes("tsx")) {
    return "application/vnd.ant.react";
  }
  if (lower.includes("mermaid")) {
    return "application/vnd.ant.mermaid";
  }
  if (lower.includes("svg")) {
    return "image/svg+xml";
  }
  if (lower.includes("markdown") || lower === "md") {
    return "application/vnd.ant.markdown";
  }
  if (lower.includes("code") || lower.includes("python") || lower.includes("javascript") || lower.includes("typescript")) {
    return "application/vnd.ant.code";
  }
  return "text/html";
}

