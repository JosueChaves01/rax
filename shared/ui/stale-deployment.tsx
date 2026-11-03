"use client";

import { useEffect, useState } from "react";
import { unstable_isUnrecognizedActionError } from "next/navigation";

/** Texto para la persona cuando su pestaña quedó de un despliegue anterior. */
export const STALE_DEPLOYMENT_MESSAGE = "RAX se actualizó mientras tenías esta página abierta. Recarga la página para seguir; lo que ya se guardó no se pierde.";

/**
 * Una server action falló porque el navegador tiene la página de un despliegue anterior: el servidor
 * nuevo ya no reconoce el id de la acción («Failed to find Server Action»). Recargar lo resuelve.
 */
export function isStaleDeploymentError(err: unknown): boolean {
  if (unstable_isUnrecognizedActionError(err)) return true;
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return /Server Action .* was not found on the server|failed-to-find-server-action/i.test(message);
}

/**
 * Aviso fijo con botón de recarga cuando una acción falla por una pestaña vieja y nadie atrapó el
 * error (p. ej. una recarga de datos en segundo plano). Así no queda un error suelto en la consola
 * mientras la pantalla parece funcionar.
 */
export function StaleDeploymentGuard() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (!isStaleDeploymentError(e.reason)) return;
      e.preventDefault();
      setStale(true);
    };
    const onError = (e: ErrorEvent) => {
      if (isStaleDeploymentError(e.error ?? e.message)) setStale(true);
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  if (!stale) return null;
  return (
    <div role="alert" className="fixed inset-x-0 bottom-20 md:bottom-6 z-[60] flex justify-center px-4">
      <div className="flex max-w-lg items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-xs text-white shadow-lg">
        <span>{STALE_DEPLOYMENT_MESSAGE}</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 cursor-pointer rounded-lg bg-orange-600 px-3 py-1.5 font-semibold hover:bg-orange-700"
        >
          Recargar
        </button>
      </div>
    </div>
  );
}
