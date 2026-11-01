/**
 * Sugerencias de respuesta que el agente deja al final de su mensaje:
 *
 *   <sugerencias>
 *   - ¿Cómo lo pruebo esta semana?
 *   - Anótalo como decisión
 *   </sugerencias>
 *
 * El bloque se quita del texto visible y las sugerencias se muestran como botones bajo la última
 * respuesta. Si el modelo no lo incluye, o lo deja a medias, simplemente no hay sugerencias.
 */

export const MAX_FOLLOW_UPS = 3;
const MAX_FOLLOW_UP_LENGTH = 90;

const BLOCK = /<sugerencias>([\s\S]*?)(?:<\/sugerencias>|$)/gi;

export function extractFollowUps(rawText: string): { cleanText: string; followUps: string[] } {
  if (!rawText) return { cleanText: "", followUps: [] };
  const found: string[] = [];
  const cleanText = rawText
    .replace(BLOCK, (_, body: string) => {
      found.push(...body.split("\n"));
      return "";
    })
    .trim();

  const seen = new Set<string>();
  const followUps: string[] = [];
  for (const line of found) {
    const text = line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/^["«“]|["»”]$/g, "")
      .trim();
    if (!text || text.length > MAX_FOLLOW_UP_LENGTH) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    followUps.push(text);
    if (followUps.length === MAX_FOLLOW_UPS) break;
  }
  return { cleanText, followUps };
}

export const FOLLOW_UP_INSTRUCTIONS = `<follow_up_suggestions>
Al final de tu respuesta puedes añadir hasta ${MAX_FOLLOW_UPS} sugerencias de lo que la persona podría escribirte a continuación, en este formato exacto:
<sugerencias>
- primera sugerencia
- segunda sugerencia
</sugerencias>
- Deben responder a lo que acabas de decir: si hiciste una pregunta, ofrece respuestas cortas posibles o «No lo sé todavía»; si propusiste algo, ofrece seguir, profundizar o anotarlo.
- Escríbelas en primera persona, como si las dijera la persona, de menos de 60 caracteres cada una.
- Si la pregunta pide datos que solo la persona conoce (su meta, su contexto) no las inventes: omite el bloque.
- Omite el bloque cuando no aporten nada. No las menciones en el texto.
</follow_up_suggestions>`;
