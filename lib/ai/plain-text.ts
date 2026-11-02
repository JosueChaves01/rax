/**
 * Convierte texto del chat (markdown) en una frase legible para briefings y resúmenes:
 * sin negritas, encabezados, listas ni enlaces, y recortado en un límite de palabra.
 */
export function plainText(md: string, max = 220): string {
  const t = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+•]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(\S(?:.*?\S)?)\1/g, "$2")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : max).trimEnd()}…`;
}

/** Respuestas cortas que no aportan un tema («sí», «ok», «si porfavor», «gracias»). */
export function isFiller(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-záéíóúñü ]/g, "").trim();
  if (t.length < 12) return true;
  return /^(s[ií]|ok|okay|dale|listo|gracias|perfecto|de acuerdo|si por ?favor|bueno)( (por ?favor|gracias|muchas gracias))?$/.test(t);
}
