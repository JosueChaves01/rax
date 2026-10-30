"use client";

import { useState, useId } from "react";
import { cx } from "@/shared/ui/primitives";

interface FormattedTextProps {
  content: string;
  isUser?: boolean;
  className?: string;
}

/**
 * Renderiza texto enriquecido con soporte para Markdown (títulos, negrita, cursiva, listas, citas y código)
 * de forma nativa y segura sin dependencias externas.
 */
export function FormattedText({ content, isUser = false, className }: FormattedTextProps) {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div
      className={cx(
        "space-y-2.5 text-xs leading-relaxed break-words",
        isUser ? "text-white" : "text-slate-800",
        className
      )}
    >
      {blocks.map((block, idx) => (
        <BlockRenderer key={idx} block={block} isUser={isUser} />
      ))}
    </div>
  );
}

type MarkdownBlock =
  | { type: "code"; language: string; content: string }
  | { type: "heading"; level: number; text: string }
  | { type: "blockquote"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "paragraph"; text: string };

function parseMarkdownBlocks(rawText: string): MarkdownBlock[] {
  if (!rawText) return [];

  const blocks: MarkdownBlock[] = [];
  const lines = rawText.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Bloque de código con ```
    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith("```")) {
        i++; // saltar el cierre de ```
      }
      blocks.push({
        type: "code",
        language: language || "código",
        content: codeLines.join("\n"),
      });
      continue;
    }

    // Líneas vacías: continuar
    if (!line.trim()) {
      i++;
      continue;
    }

    // 2. Encabezados (#, ##, ###, ####)
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // 3. Citas (> ...)
    if (line.trim().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        lines: quoteLines,
      });
      continue;
    }

    // 4. Listas no ordenadas (- o *)
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({
        type: "ul",
        items,
      });
      continue;
    }

    // 5. Listas numeradas (1. 2. etc)
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({
        type: "ol",
        items,
      });
      continue;
    }

    // 6. Párrafos normales (acumula líneas hasta línea vacía, encabezado o lista)
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].match(/^(#{1,4})\s+/) &&
      !lines[i].trim().startsWith(">") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }

    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        text: paragraphLines.join("\n"),
      });
    }
  }

  return blocks;
}

function BlockRenderer({ block, isUser }: { block: MarkdownBlock; isUser: boolean }) {
  const codeId = useId();

  if (block.type === "code") {
    return <CodeBlock block={block} isUser={isUser} key={codeId} />;
  }

  if (block.type === "heading") {
    const HLevel = (
      block.level === 1
        ? "h2"
        : block.level === 2
          ? "h3"
          : "h4"
    ) as "h2" | "h3" | "h4";

    const headingStyles =
      block.level === 1
        ? "text-base font-bold tracking-tight mt-1 border-b pb-1"
        : block.level === 2
          ? "text-sm font-bold tracking-tight mt-1"
          : "text-xs font-semibold uppercase tracking-wider mt-0.5";

    return (
      <HLevel
        className={cx(
          headingStyles,
          isUser ? "text-white border-blue-400/40" : "text-slate-900 border-slate-200"
        )}
      >
        <InlineRenderer text={block.text} isUser={isUser} />
      </HLevel>
    );
  }

  if (block.type === "blockquote") {
    return (
      <blockquote
        className={cx(
          "pl-3 border-l-2 py-1 my-1 italic rounded-r",
          isUser
            ? "border-blue-300 bg-blue-700/30 text-blue-50"
            : "border-blue-500 bg-blue-50/50 text-slate-700"
        )}
      >
        {block.lines.map((line, idx) => (
          <div key={idx}>
            <InlineRenderer text={line} isUser={isUser} />
          </div>
        ))}
      </blockquote>
    );
  }

  if (block.type === "ul") {
    return (
      <ul className="space-y-1 my-1 pl-4 list-disc list-outside marker:text-blue-500">
        {block.items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            <InlineRenderer text={item} isUser={isUser} />
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "ol") {
    return (
      <ol className="space-y-1 my-1 pl-4 list-decimal list-outside marker:font-semibold marker:text-blue-500">
        {block.items.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            <InlineRenderer text={item} isUser={isUser} />
          </li>
        ))}
      </ol>
    );
  }

  // Párrafo
  return (
    <p className="leading-relaxed whitespace-pre-wrap">
      <InlineRenderer text={block.text} isUser={isUser} />
    </p>
  );
}

function CodeBlock({
  block,
  isUser,
}: {
  block: { language: string; content: string };
  isUser: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(block.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignorar fallback
    }
  };

  return (
    <div
      className={cx(
        "rounded-xl overflow-hidden my-2 border text-[11px] font-mono",
        isUser
          ? "bg-blue-950/80 border-blue-400/40 text-blue-100"
          : "bg-slate-900 border-slate-800 text-slate-100"
      )}
    >
      <div
        className={cx(
          "flex items-center justify-between px-3 py-1.5 border-b text-[10px]",
          isUser
            ? "bg-blue-900/60 border-blue-400/30 text-blue-200"
            : "bg-slate-800/80 border-slate-700/60 text-slate-400"
        )}
      >
        <span className="font-semibold uppercase tracking-wider">{block.language}</span>
        <button
          type="button"
          onClick={handleCopy}
          className={cx(
            "px-2 py-0.5 rounded text-[10px] font-sans font-medium transition-colors cursor-pointer",
            isUser
              ? "hover:bg-blue-800 text-blue-200"
              : "hover:bg-slate-700 text-slate-300"
          )}
        >
          {copied ? "✓ Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto whitespace-pre font-mono leading-relaxed">
        <code>{block.content}</code>
      </pre>
    </div>
  );
}

/**
 * Renderiza negrita, cursiva, código en línea y enlaces.
 */
function InlineRenderer({ text, isUser }: { text: string; isUser: boolean }) {
  // Expresión regular para separar tokens inline:
  // - Enlaces: [texto](url)
  // - Inline code: `código`
  // - Negrita: **texto**
  // - Cursiva: *texto* o _texto_
  // - Tachado: ~~texto~~
  const tokenRegex =
    /(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|~~[^~]+~~)/g;

  const parts = text.split(tokenRegex);

  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;

        // Enlace [texto](url)
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const [, label, href] = linkMatch;
          return (
            <a
              key={idx}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cx(
                "underline font-medium hover:opacity-80 transition-opacity",
                isUser ? "text-blue-100 underline-offset-2" : "text-blue-600 underline-offset-2"
              )}
            >
              {label}
            </a>
          );
        }

        // Inline code `...`
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={idx}
              className={cx(
                "px-1.5 py-0.5 rounded font-mono text-[11px] mx-0.5 border",
                isUser
                  ? "bg-blue-800/80 text-blue-100 border-blue-400/40"
                  : "bg-slate-100 text-slate-800 border-slate-200"
              )}
            >
              {part.slice(1, -1)}
            </code>
          );
        }

        // Negrita **...** o __...__
        if (
          (part.startsWith("**") && part.endsWith("**") && part.length >= 4) ||
          (part.startsWith("__") && part.endsWith("__") && part.length >= 4)
        ) {
          return (
            <strong key={idx} className="font-bold">
              {part.slice(2, -2)}
            </strong>
          );
        }

        // Cursiva *...* o _..._
        if (
          (part.startsWith("*") && part.endsWith("*") && part.length >= 2) ||
          (part.startsWith("_") && part.endsWith("_") && part.length >= 2)
        ) {
          return (
            <em key={idx} className="italic">
              {part.slice(1, -1)}
            </em>
          );
        }

        // Tachado ~~...~~
        if (part.startsWith("~~") && part.endsWith("~~") && part.length >= 4) {
          return (
            <del key={idx} className="line-through opacity-75">
              {part.slice(2, -2)}
            </del>
          );
        }

        return <span key={idx}>{part}</span>;
      })}
    </>
  );
}
