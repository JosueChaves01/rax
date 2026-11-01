/**
 * Markdown sencillo → bloques para armar PDF y Word. Cubre lo que escribe el agente en un documento:
 * títulos, párrafos, listas (con viñetas y numeradas, un nivel de anidación), citas, tablas, código y
 * separadores; en línea, **negrita**, *cursiva* y `código`. Lo demás se trata como texto plano.
 */

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

export type DocBlock =
  | { type: "heading"; level: 1 | 2 | 3; runs: InlineRun[] }
  | { type: "paragraph"; runs: InlineRun[] }
  | { type: "list"; ordered: boolean; items: Array<{ runs: InlineRun[]; depth: number }> }
  | { type: "quote"; runs: InlineRun[] }
  | { type: "table"; header: InlineRun[][]; rows: InlineRun[][][] }
  | { type: "code"; text: string }
  | { type: "rule" };

/** Divide una línea en tramos con formato. Los marcadores sin cerrar quedan como texto. */
export function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  const re = /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) runs.push({ text: text.slice(last, i) });
    if (m[2]) runs.push({ text: m[2], bold: true, italic: true });
    else if (m[3] || m[4]) runs.push({ text: (m[3] ?? m[4])!, bold: true });
    else if (m[5] || m[6]) runs.push({ text: (m[5] ?? m[6])!, italic: true });
    else if (m[7]) runs.push({ text: m[7], code: true });
    else if (m[8]) runs.push({ text: `${m[8]} (${m[9]})` });
    last = i + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.filter((r) => r.text !== "");
}

const plain = (runs: InlineRun[]) => runs.map((r) => r.text).join("");

const tableCells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => parseInline(c.trim()));

const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const LIST_RE = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/;

export function parseMarkdown(markdown: string): DocBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: DocBlock[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", runs: parseInline(paragraph.join(" ")) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      flush();
      continue;
    }

    if (trimmed.startsWith("```")) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (heading) {
      flush();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, runs: parseInline(heading[2]) });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }

    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flush();
      const header = tableCells(trimmed);
      const rows: InlineRun[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(tableCells(lines[i++]));
      i--;
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flush();
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) quote.push(lines[i++].trim().replace(/^>\s?/, ""));
      i--;
      blocks.push({ type: "quote", runs: parseInline(quote.join(" ")) });
      continue;
    }

    const item = line.match(LIST_RE);
    if (item) {
      flush();
      const ordered = /\d/.test(item[2]);
      const items: Array<{ runs: InlineRun[]; depth: number }> = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_RE);
        if (m) {
          items.push({ runs: parseInline(m[3]), depth: m[1].replace(/\t/g, "  ").length >= 2 ? 1 : 0 });
          i++;
        } else if (lines[i].trim() !== "" && /^\s{2,}/.test(lines[i]) && items.length) {
          // Continuación de la línea anterior del ítem.
          const prev = items[items.length - 1];
          prev.runs = parseInline(`${plain(prev.runs)} ${lines[i].trim()}`);
          i++;
        } else break;
      }
      i--;
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    paragraph.push(trimmed);
  }
  flush();
  return blocks;
}

/** Quita el primer título si repite el título del documento (la portada ya lo muestra). */
export function dropLeadingTitle(blocks: DocBlock[], title: string): DocBlock[] {
  const first = blocks[0];
  if (first?.type === "heading" && first.level === 1 && normalize(plain(first.runs)) === normalize(title)) return blocks.slice(1);
  return blocks;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const runsText = plain;
