/**
 * Estimación y gestión de tokens para la estrategia híbrida In-Context vs. RAG.
 * 
 * En Claude y modelos LLM estándar, 1 token equivale aproximadamente a 3.5 - 4 caracteres en inglés/código
 * y a ~3 caracteres en español debido a tildes y caracteres especiales.
 */

/**
 * Umbral por defecto para mandar los documentos completos: 12.000 tokens (~40 KB de texto). Los modelos
 * gratis tienen ventanas chicas y se vuelven lentos con prompts grandes; por encima, se buscan los
 * fragmentos relevantes. Se ajusta con RAX_KNOWLEDGE_IN_CONTEXT_TOKENS (p. ej. con un modelo pagado).
 */
export const DEFAULT_IN_CONTEXT_TOKEN_LIMIT = (() => {
  const n = Number(process.env.RAX_KNOWLEDGE_IN_CONTEXT_TOKENS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 12_000;
})();

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Conteo ponderado: palabras + caracteres especiales / 3.3
  const len = text.length;
  const words = text.trim().split(/\s+/).length;
  // Promedio armónico entre longitud de caracteres y conteo de palabras
  const estByChars = Math.ceil(len / 3.4);
  const estByWords = Math.ceil(words * 1.3);
  return Math.max(estByChars, estByWords, 1);
}

export type KnowledgeMode = "in_context" | "rag";

export interface KnowledgeEvaluation {
  mode: KnowledgeMode;
  totalTokens: number;
  threshold: number;
  percentOfLimit: number;
  exceedsThreshold: boolean;
}

export function evaluateKnowledgeMode(
  totalTokens: number,
  threshold: number = DEFAULT_IN_CONTEXT_TOKEN_LIMIT,
): KnowledgeEvaluation {
  const safeThreshold = Math.max(threshold, 1);
  const exceedsThreshold = totalTokens > safeThreshold;
  const percentOfLimit = Math.min(Math.round((totalTokens / safeThreshold) * 100), 100);

  return {
    mode: exceedsThreshold ? "rag" : "in_context",
    totalTokens,
    threshold: safeThreshold,
    percentOfLimit,
    exceedsThreshold,
  };
}
