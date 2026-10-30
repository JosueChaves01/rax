import { estimateTokens } from "./token-counter";

export interface TextChunk {
  chunkIndex: number;
  content: string;
  tokenCount: number;
}

/**
 * Fragmenta texto en pasajes semánticos preservando límites de párrafos o saltos de línea.
 * Tamaño objetivo por chunk: ~400-600 tokens con ~80 tokens de solapamiento.
 */
export function chunkDocumentText(
  text: string,
  options: { targetTokens?: number; overlapTokens?: number } = {},
): TextChunk[] {
  const targetTokens = options.targetTokens ?? 500;
  const overlapTokens = options.overlapTokens ?? 80;

  const clean = text.trim();
  if (!clean) return [];

  const initialTokens = estimateTokens(clean);
  if (initialTokens <= targetTokens) {
    return [{ chunkIndex: 0, content: clean, tokenCount: initialTokens }];
  }

  // Dividir inicialmente por doble salto de línea (párrafos)
  const paragraphs = clean.split(/\n\s*\n/);
  const chunks: TextChunk[] = [];
  let currentParagraphs: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const p = para.trim();
    if (!p) continue;
    const pTokens = estimateTokens(p);

    if (currentTokens + pTokens > targetTokens && currentParagraphs.length > 0) {
      const content = currentParagraphs.join("\n\n");
      chunks.push({
        chunkIndex,
        content,
        tokenCount: estimateTokens(content),
      });
      chunkIndex++;

      // Guardar últimos párrafos para solapamiento
      let overlapCollected = 0;
      const overlapParas: string[] = [];
      for (let i = currentParagraphs.length - 1; i >= 0; i--) {
        const op = currentParagraphs[i];
        const ot = estimateTokens(op);
        if (overlapCollected + ot <= overlapTokens) {
          overlapParas.unshift(op);
          overlapCollected += ot;
        } else {
          break;
        }
      }

      currentParagraphs = [...overlapParas, p];
      currentTokens = overlapCollected + pTokens;
    } else {
      currentParagraphs.push(p);
      currentTokens += pTokens;
    }
  }

  if (currentParagraphs.length > 0) {
    const content = currentParagraphs.join("\n\n");
    chunks.push({
      chunkIndex,
      content,
      tokenCount: estimateTokens(content),
    });
  }

  return chunks;
}

