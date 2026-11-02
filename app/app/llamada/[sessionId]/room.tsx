"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SessionCallPanel } from "@/shared/ui/session-call";
import { cx } from "@/shared/ui/primitives";

/**
 * Distribución de la pantalla de la llamada: en escritorio, la llamada y el panel de contexto lado a
 * lado; en el celular, dos pestañas. El contexto se refresca solo cada minuto (notas, tareas o la
 * síntesis que aparece al colgar) sin cortar la llamada.
 */
export function CallRoom({ sessionId, context }: { sessionId: string; context: ReactNode }) {
  const router = useRouter();
  const [tab, setTab] = useState<"call" | "context">("call");
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = window.setInterval(() => router.refresh(), 60_000);
    return () => window.clearInterval(t);
  }, [router]);

  const tabBtn = (id: "call" | "context", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={cx(
        "flex-1 cursor-pointer rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        tab === id ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-800",
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      <div role="tablist" aria-label="Vista" className="mb-4 flex gap-1 rounded-full bg-slate-100 p-1 lg:hidden">
        {tabBtn("call", "Llamada")}
        {tabBtn("context", "Contexto del proyecto")}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* La llamada siempre queda montada (solo se oculta en el celular) para no cortarla al cambiar de pestaña. */}
        <div className={cx("min-w-0", tab !== "call" && "hidden lg:block")}>
          <SessionCallPanel sessionId={sessionId} mode="room" />
        </div>

        <aside
          aria-label="Contexto del proyecto"
          className={cx(
            "min-w-0 lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1",
            tab !== "context" && "hidden",
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="eyebrow text-slate-500">Contexto del proyecto</p>
            <button
              type="button"
              onClick={() => start(() => router.refresh())}
              disabled={pending}
              className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline disabled:opacity-50"
            >
              {pending ? "Actualizando…" : "↻ Actualizar"}
            </button>
          </div>
          {context}
        </aside>
      </div>
    </>
  );
}
