"use client";

import { useEffect } from "react";

/**
 * Si una pantalla privada falla en el navegador, se muestra este aviso en vez de la página en blanco
 * de Next, con el detalle técnico para poder reportarlo. Los datos guardados no se pierden.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[rax] Error en la pantalla:", error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-2xl border border-rose-200 bg-white p-6 shadow-xs">
      <h2 className="text-base font-bold text-slate-900">Algo falló al mostrar esta pantalla</h2>
      <p className="text-sm text-slate-600">Tus datos guardados no se perdieron. Prueba de nuevo; si se repite, comparte el detalle de abajo.</p>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[11px] text-slate-700">
        {error.message || "Error desconocido"}
        {error.digest ? `\nCódigo: ${error.digest}` : ""}
      </pre>
      <div className="flex gap-2">
        <button type="button" onClick={reset} className="cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Reintentar
        </button>
        <button type="button" onClick={() => window.location.reload()} className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Recargar la página
        </button>
      </div>
    </div>
  );
}
