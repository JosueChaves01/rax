import PDFDocument from "pdfkit";
import { dropLeadingTitle, parseMarkdown, type DocBlock, type InlineRun } from "./markdown-blocks";
import type { DocumentSource } from "./types";

const INK = "#1C1D20";
const MUTED = "#6B6F76";
const ACCENT = "#FF4A1C";
const LINE = "#D9DBDF";
const MARGIN = 60;

// Las fuentes estándar del PDF usan WinAnsi: los acentos y la ñ entran, los emojis y flechas no.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const REPLACEMENTS: Record<string, string> = { "→": "->", "←": "<-", "⇒": "=>", "≥": ">=", "≤": "<=", "≠": "!=", "✓": "(ok)", "✔": "(ok)", "✅": "(ok)", "❌": "(x)", "✗": "(x)", "▪": "•", "◦": "•", "●": "•" };

export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code === 0x09) out += "  ";
    else if ((code >= 0x20 && code < 0x7f) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(ch) || ch === "\n") out += ch;
    else if (REPLACEMENTS[ch]) out += REPLACEMENTS[ch];
  }
  return out;
}

function fontFor(run: InlineRun): string {
  if (run.code) return "Courier";
  if (run.bold && run.italic) return "Helvetica-BoldOblique";
  if (run.bold) return "Helvetica-Bold";
  if (run.italic) return "Helvetica-Oblique";
  return "Helvetica";
}

type Doc = InstanceType<typeof PDFDocument>;

function writeRuns(doc: Doc, runs: InlineRun[], opts: { size: number; color?: string; x?: number; width?: number; bold?: boolean; lineGap?: number }) {
  const list = runs.length ? runs : [{ text: " " }];
  doc.fillColor(opts.color ?? INK).fontSize(opts.size);
  list.forEach((run, i) => {
    doc.font(fontFor(opts.bold ? { ...run, bold: true } : run));
    const text = toWinAnsi(run.text) || " ";
    const last = i === list.length - 1;
    const base = { continued: !last, lineGap: opts.lineGap ?? 3, ...(opts.width ? { width: opts.width } : {}) };
    if (i === 0 && opts.x !== undefined) doc.text(text, opts.x, doc.y, base);
    else doc.text(text, base);
  });
}

function ensureSpace(doc: Doc, height: number) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

function renderTable(doc: Doc, header: InlineRun[][], rows: InlineRun[][][]) {
  const cols = Math.max(header.length, ...rows.map((r) => r.length), 1);
  const width = doc.page.width - MARGIN * 2;
  const colW = width / cols;
  const pad = 5;
  const cellText = (cell?: InlineRun[]) => toWinAnsi((cell ?? []).map((r) => r.text).join("")) || " ";

  const drawRow = (cells: InlineRun[][], isHeader: boolean) => {
    doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    const heights = Array.from({ length: cols }, (_, c) => doc.heightOfString(cellText(cells[c]), { width: colW - pad * 2 }));
    const h = Math.max(...heights) + pad * 2;
    ensureSpace(doc, h);
    const y = doc.y;
    if (isHeader) doc.rect(MARGIN, y, width, h).fill("#F3F4F6");
    for (let c = 0; c < cols; c++) {
      doc.fillColor(INK).font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      doc.text(cellText(cells[c]), MARGIN + c * colW + pad, y + pad, { width: colW - pad * 2 });
    }
    doc.lineWidth(0.5).strokeColor(LINE).rect(MARGIN, y, width, h).stroke();
    for (let c = 1; c < cols; c++) doc.moveTo(MARGIN + c * colW, y).lineTo(MARGIN + c * colW, y + h).stroke();
    doc.x = MARGIN;
    doc.y = y + h;
  };

  if (header.length) drawRow(header, true);
  for (const row of rows) drawRow(row, false);
  doc.moveDown(0.8);
}

function renderBlock(doc: Doc, block: DocBlock) {
  const textWidth = doc.page.width - MARGIN * 2;
  switch (block.type) {
    case "heading": {
      const size = block.level === 1 ? 17 : block.level === 2 ? 14 : 12;
      ensureSpace(doc, size * 3);
      doc.moveDown(block.level === 1 ? 0.8 : 0.5);
      writeRuns(doc, block.runs, { size, bold: true, x: MARGIN, width: textWidth, color: block.level === 1 ? ACCENT : INK });
      doc.moveDown(0.3);
      break;
    }
    case "paragraph":
      writeRuns(doc, block.runs, { size: 10.5, x: MARGIN, width: textWidth });
      doc.moveDown(0.6);
      break;
    case "list": {
      let n = 0;
      block.items.forEach((item) => {
        const indent = MARGIN + 6 + item.depth * 16;
        if (item.depth === 0) n++;
        const marker = block.ordered && item.depth === 0 ? `${n}.` : "•";
        ensureSpace(doc, 16);
        const y = doc.y;
        doc.font("Helvetica").fontSize(10.5).fillColor(INK).text(marker, indent, y, { width: 16 });
        doc.y = y;
        writeRuns(doc, item.runs, { size: 10.5, x: indent + 16, width: textWidth - (indent - MARGIN) - 16, lineGap: 2 });
        doc.moveDown(0.2);
      });
      doc.x = MARGIN;
      doc.moveDown(0.4);
      break;
    }
    case "quote": {
      ensureSpace(doc, 24);
      const y = doc.y;
      writeRuns(doc, block.runs.map((r) => ({ ...r, italic: true })), { size: 10.5, x: MARGIN + 14, width: textWidth - 14, color: MUTED });
      doc.lineWidth(2).strokeColor(ACCENT).moveTo(MARGIN + 4, y).lineTo(MARGIN + 4, doc.y).stroke();
      doc.x = MARGIN;
      doc.moveDown(0.6);
      break;
    }
    case "code": {
      doc.font("Courier").fontSize(9);
      const text = toWinAnsi(block.text) || " ";
      const h = doc.heightOfString(text, { width: textWidth - 16 }) + 12;
      ensureSpace(doc, Math.min(h, 200));
      const y = doc.y;
      doc.rect(MARGIN, y, textWidth, h).fill("#F3F4F6");
      doc.fillColor(INK).font("Courier").fontSize(9).text(text, MARGIN + 8, y + 6, { width: textWidth - 16 });
      doc.x = MARGIN;
      doc.y = Math.max(doc.y, y + h);
      doc.moveDown(0.6);
      break;
    }
    case "table":
      renderTable(doc, block.header, block.rows);
      break;
    case "rule":
      doc.moveDown(0.3);
      doc.lineWidth(0.5).strokeColor(LINE).moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).stroke();
      doc.moveDown(0.6);
      break;
  }
}

/** Arma un PDF A4 con encabezado, el contenido en Markdown y el número de página al pie. */
export function renderPdf(source: DocumentSource): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: toWinAnsi(source.title), Author: "RAX", Subject: toWinAnsi(source.subtitle ?? ""), Creator: "Agente de RAX" },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Helvetica-Bold").fontSize(9).fillColor(ACCENT).text("RAX", MARGIN, MARGIN, { characterSpacing: 2 });
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(22).fillColor(INK).text(toWinAnsi(source.title), { width: doc.page.width - MARGIN * 2 });
  if (source.subtitle) {
    doc.moveDown(0.2);
    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(toWinAnsi(source.subtitle));
  }
  doc.moveDown(0.6);
  doc.lineWidth(1.5).strokeColor(ACCENT).moveTo(MARGIN, doc.y).lineTo(MARGIN + 60, doc.y).stroke();
  doc.moveDown(1);

  for (const block of dropLeadingTitle(parseMarkdown(source.content), source.title)) renderBlock(doc, block);

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(MUTED)
      .text(`${toWinAnsi(source.title).slice(0, 80)}  ·  Página ${i + 1} de ${range.count}`, MARGIN, doc.page.height - 40, {
        width: doc.page.width - MARGIN * 2,
        align: "center",
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }

  doc.end();
  return done;
}
