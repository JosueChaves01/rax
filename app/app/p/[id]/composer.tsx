"use client";

import { useState } from "react";
import Link from "next/link";
import { sendMessageAction } from "@/app/actions";
import { Button, Notice, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";

const QUICK = ["No sé todavía.", "Todavía no lo investigué.", "Es algo que supongo, no lo confirmé.", "Quiero cambiar el enfoque."];

export function Composer({ projectId }: { projectId: string }) {
  const [text, setText] = useState("");
  const [info, setInfo] = useState<{ aiError: string | null; proposals: number; summaryDrafted: boolean } | null>(null);
  const { run, pending, error } = useAction();

  function send(value: string) {
    const content = value.trim();
    if (!content) return;
    setInfo(null);
    run(
      () => sendMessageAction(projectId, content),
      (r) => {
        setText("");
        if (r.ok && r.data) setInfo(r.data as typeof info);
      },
    );
  }

  return (
    <div className="space-y-3 border-t border-line px-5 py-4">
      {pending && (
        <p role="status" className="text-xs text-cyan">
          RAX está ordenando lo que dijiste…
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {info?.aiError && <Notice tone="error">{info.aiError}</Notice>}
      {info && !info.aiError && (info.proposals > 0 || info.summaryDrafted) && (
        <Notice tone="success">
          {info.summaryDrafted ? "Hay un resumen inicial listo para que lo revises. " : ""}
          {info.proposals > 0 ? `${info.proposals} propuesta(s) nueva(s) en el diagnóstico, pendientes de tu confirmación. ` : ""}
          <Link href={`/app/p/${projectId}/diagnostico`} className="font-semibold underline">
            Revisar
          </Link>
        </Notice>
      )}
      <div className="flex flex-wrap gap-2" aria-label="Respuestas rápidas">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            disabled={pending}
            onClick={() => send(q)}
            className="rounded-full border border-line-strong px-3 py-1 text-xs text-muted hover:border-highlight hover:text-ink disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor="composer" className="sr-only">
          Tu mensaje
        </label>
        <textarea
          id="composer"
          rows={2}
          maxLength={4000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Contalo con tus palabras. Enter envía, Shift+Enter hace un salto de línea."
          className={`${inputClass} resize-y`}
        />
        <Button variant="primary" type="submit" disabled={pending || !text.trim()}>
          Enviar
        </Button>
      </form>
    </div>
  );
}
