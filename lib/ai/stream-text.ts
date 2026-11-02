/**
 * Texto visible mientras la respuesta del agente llega por partes. Los bloques que el servidor quita al
 * final (sugerencias y artefactos) no se muestran a medias: se corta donde empiezan, y también si el
 * último trozo termina con el comienzo de una de esas etiquetas.
 */
const HIDDEN_TAGS = ["<sugerencias", "<antArtifact"];

export function visibleStreamText(raw: string): string {
  let cut = raw.length;
  for (const tag of HIDDEN_TAGS) {
    const i = raw.indexOf(tag);
    if (i >= 0) cut = Math.min(cut, i);
  }
  const lt = raw.lastIndexOf("<", cut - 1);
  if (lt >= 0) {
    const tail = raw.slice(lt, cut);
    if (!tail.includes(">") && HIDDEN_TAGS.some((tag) => tag.startsWith(tail))) cut = lt;
  }
  return raw.slice(0, cut).trimEnd();
}
