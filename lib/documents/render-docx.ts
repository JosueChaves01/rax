import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { dropLeadingTitle, parseMarkdown, type DocBlock, type InlineRun } from "./markdown-blocks";
import type { DocumentSource } from "./types";

const INK = "1C1D20";
const MUTED = "6B6F76";
const ACCENT = "FF4A1C";

const runsOf = (runs: InlineRun[], extra: { color?: string; italics?: boolean; bold?: boolean } = {}) =>
  (runs.length ? runs : [{ text: "" }]).map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold || extra.bold,
        italics: r.italic || extra.italics,
        color: extra.color,
        ...(r.code ? { font: "Consolas", shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F4F6" } } : {}),
      }),
  );

const HEADING = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 } as const;

function blockToDocx(block: DocBlock, listInstance: () => number): Array<Paragraph | Table> {
  switch (block.type) {
    case "heading":
      return [new Paragraph({ heading: HEADING[block.level], children: runsOf(block.runs) })];
    case "paragraph":
      return [new Paragraph({ children: runsOf(block.runs), spacing: { after: 160 } })];
    case "list": {
      const instance = listInstance();
      return block.items.map(
        (item) =>
          new Paragraph({
            children: runsOf(item.runs),
            ...(block.ordered ? { numbering: { reference: "rax-ordered", level: item.depth, instance } } : { bullet: { level: item.depth } }),
            spacing: { after: 60 },
          }),
      );
    }
    case "quote":
      return [
        new Paragraph({
          children: runsOf(block.runs, { italics: true, color: MUTED }),
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 8 } },
          spacing: { after: 160 },
        }),
      ];
    case "code":
      return block.text.split("\n").map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line || " ", font: "Consolas", size: 18 })],
            shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F4F6" },
          }),
      );
    case "rule":
      return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "D9DBDF", space: 4 } }, spacing: { after: 160 } })];
    case "table": {
      const cols = Math.max(block.header.length, ...block.rows.map((r) => r.length), 1);
      const row = (cells: InlineRun[][], header: boolean) =>
        new TableRow({
          tableHeader: header,
          children: Array.from(
            { length: cols },
            (_, c) =>
              new TableCell({
                width: { size: Math.floor(100 / cols), type: WidthType.PERCENTAGE },
                ...(header ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F4F6" } } : {}),
                children: [new Paragraph({ children: runsOf(cells[c] ?? [], { bold: header }) })],
              }),
          ),
        });
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [...(block.header.length ? [row(block.header, true)] : []), ...block.rows.map((r) => row(r, false))],
        }),
        new Paragraph({ children: [] }),
      ];
    }
  }
}

/** Arma un .docx con estilos de título reales (navegables en Word), listas, tablas y pie con página. */
export async function renderDocx(source: DocumentSource): Promise<Buffer> {
  let instances = 0;
  const body = dropLeadingTitle(parseMarkdown(source.content), source.title).flatMap((b) => blockToDocx(b, () => ++instances));

  const doc = new Document({
    creator: "Agente de RAX",
    title: source.title,
    description: source.subtitle,
    styles: {
      default: { document: { run: { font: "Calibri", size: 22, color: INK } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { size: 44, bold: true, color: INK }, paragraph: { spacing: { after: 80 } } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, color: ACCENT }, paragraph: { spacing: { before: 320, after: 120 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, color: INK }, paragraph: { spacing: { before: 240, after: 100 } } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, color: INK }, paragraph: { spacing: { before: 200, after: 80 } } },
      ],
    },
    numbering: {
      config: [
        {
          reference: "rax-ordered",
          levels: [
            { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
            { level: 1, format: LevelFormat.LOWER_LETTER, text: "%2)", alignment: AlignmentType.START, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
          ],
        },
      ],
    },
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `${source.title}  ·  Página `, size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED }),
                  new TextRun({ text: " de ", size: 16, color: MUTED }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ children: [new TextRun({ text: "RAX", bold: true, color: ACCENT, size: 18, characterSpacing: 40 })] }),
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(source.title)] }),
          ...(source.subtitle ? [new Paragraph({ children: [new TextRun({ text: source.subtitle, color: MUTED, size: 20 })], spacing: { after: 240 } })] : []),
          new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 4 } }, spacing: { after: 240 } }),
          ...body,
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
