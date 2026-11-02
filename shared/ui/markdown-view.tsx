"use client";

import { useMemo, useState } from "react";
import { parseMarkdown, type DocBlock, type InlineRun } from "@/lib/documents/markdown-blocks";
import { parseMarkdownTables, parseNumber, type DataTable } from "@/lib/documents/tables";
import { cx } from "@/shared/ui/primitives";

/**
 * Markdown de un documento con el mismo lector que arma el PDF y el Word: lo que se ve acá es lo que
 * sale al descargarlo (títulos, listas, citas, tablas, código).
 */
export function MarkdownView({ content, className }: { content: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);
  return (
    <div className={cx("space-y-3 text-sm leading-relaxed text-slate-800 break-words", className)}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

function Runs({ runs }: { runs: InlineRun[] }) {
  return (
    <>
      {runs.map((r, i) => {
        if (r.code)
          return (
            <code key={i} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.8125em] text-slate-800">
              {r.text}
            </code>
          );
        const cls = cx(r.bold && "font-semibold text-slate-900", r.italic && "italic");
        return cls ? (
          <span key={i} className={cls}>
            {r.text}
          </span>
        ) : (
          <span key={i}>{r.text}</span>
        );
      })}
    </>
  );
}

function Block({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "heading":
      return block.level === 1 ? (
        <h2 className="pt-2 text-lg font-bold text-slate-900">
          <Runs runs={block.runs} />
        </h2>
      ) : block.level === 2 ? (
        <h3 className="pt-2 text-base font-bold text-slate-900">
          <Runs runs={block.runs} />
        </h3>
      ) : (
        <h4 className="pt-1 text-sm font-bold text-slate-900">
          <Runs runs={block.runs} />
        </h4>
      );
    case "paragraph":
      return (
        <p>
          <Runs runs={block.runs} />
        </p>
      );
    case "list": {
      // Los subítems van dentro del ítem anterior para no romper la numeración.
      const groups: Array<{ runs: InlineRun[]; children: InlineRun[][] }> = [];
      for (const it of block.items) {
        if (it.depth && groups.length) groups[groups.length - 1].children.push(it.runs);
        else groups.push({ runs: it.runs, children: [] });
      }
      const List = block.ordered ? "ol" : "ul";
      return (
        <List className={cx("space-y-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
          {groups.map((g, i) => (
            <li key={i}>
              <Runs runs={g.runs} />
              {g.children.length > 0 && (
                <ul className="mt-1 list-[circle] space-y-1 pl-5">
                  {g.children.map((c, j) => (
                    <li key={j}>
                      <Runs runs={c} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </List>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-2 border-orange-400 pl-3 italic text-slate-600">
          <Runs runs={block.runs} />
        </blockquote>
      );
    case "code":
      return <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 font-mono text-xs leading-relaxed text-slate-800">{block.text}</pre>;
    case "rule":
      return <hr className="border-slate-200" />;
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-xs">
            {block.header.length > 0 && (
              <thead className="bg-slate-50">
                <tr>
                  {block.header.map((c, i) => (
                    <th key={i} className="border-b border-slate-200 px-3 py-2 font-semibold text-slate-900">
                      <Runs runs={c} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody className="divide-y divide-slate-100">
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, i) => (
                    <td key={i} className="px-3 py-1.5 align-top text-slate-700">
                      <Runs runs={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/* ───────────── Tablas de Excel y CSV ───────────── */

/** Cuántas filas se dibujan a la vez: una hoja puede traer miles y la página se pondría lenta. */
const PAGE_ROWS = 200;

const csvCell = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV de una tabla, listo para abrir en Excel (con BOM para que respete los acentos). */
export function tableToCsv(table: DataTable): string {
  return "﻿" + [table.columns, ...table.rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Tablas que vienen de un Excel o CSV subido: una pestaña por hoja, búsqueda y descarga en CSV. */
export function DataTablesView({ content, title }: { content: string; title: string }) {
  const tables = useMemo(() => parseMarkdownTables(content).filter((t) => t.columns.length), [content]);
  const [sheet, setSheet] = useState(0);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_ROWS);
  const table = tables[Math.min(sheet, tables.length - 1)];

  const numeric = useMemo(() => {
    if (!table) return [];
    return table.columns.map((_, c) => {
      const filled = table.rows.filter((r) => r[c] !== null && String(r[c]).trim() !== "");
      return filled.length > 0 && filled.every((r) => parseNumber(r[c]) !== null);
    });
  }, [table]);

  const q = query.trim().toLowerCase();
  const rows = useMemo(
    () => (table ? (q ? table.rows.filter((r) => r.some((c) => c !== null && String(c).toLowerCase().includes(q))) : table.rows) : []),
    [table, q],
  );

  // Sin tablas reconocibles (p. ej. un CSV guardado a mano): se muestra como texto.
  if (!table) return <MarkdownView content={content} />;

  const downloadCsv = () => {
    const blob = new Blob([tableToCsv(table)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const name = tables.length > 1 ? `${title} - ${table.name}` : title;
    a.download = `${name.replace(/[\\/:*?"<>|]+/g, " ").trim() || "tabla"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {tables.length > 1 && (
        <div role="tablist" aria-label="Hojas" className="flex flex-wrap gap-1.5">
          {tables.map((t, i) => (
            <button
              key={`${t.name}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === sheet}
              onClick={() => {
                setSheet(i);
                setLimit(PAGE_ROWS);
              }}
              className={cx(
                "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                i === sheet ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600 hover:border-slate-400",
              )}
            >
              {t.name || `Hoja ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE_ROWS);
          }}
          placeholder="Buscar en la tabla…"
          aria-label="Buscar en la tabla"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-64"
        />
        <span className="text-xs text-slate-500">
          {q ? `${rows.length} de ${table.rows.length} filas` : `${table.rows.length} filas`} · {table.columns.length} columnas
        </span>
        <button type="button" onClick={downloadCsv} className="ml-auto cursor-pointer text-xs font-semibold text-blue-600 hover:underline">
          ↓ CSV
        </button>
      </div>

      <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="border-b border-slate-200 px-2 py-2 text-right font-medium text-slate-400">#</th>
              {table.columns.map((c, i) => (
                <th key={i} className={cx("whitespace-nowrap border-b border-slate-200 px-3 py-2 font-semibold text-slate-900", numeric[i] && "text-right")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.slice(0, limit).map((r, ri) => (
              <tr key={ri} className="hover:bg-slate-50/70">
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{ri + 1}</td>
                {table.columns.map((_, ci) => (
                  <td key={ci} className={cx("px-3 py-1.5 align-top text-slate-700", numeric[ci] ? "whitespace-nowrap text-right tabular-nums" : "max-w-xs")}>
                    {r[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={table.columns.length + 1} className="px-3 py-6 text-center text-slate-500">
                  Ninguna fila coincide con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE_ROWS * 5)} className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline">
          Mostrar más filas ({rows.length - limit} restantes)
        </button>
      )}
    </div>
  );
}
