"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: true; data?: unknown } | { ok: false; error: string; code?: string };

/**
 * Ejecuta una server action con estado de carga y error. Los errores de dominio llegan como texto seguro.
 * En un conflicto de versión se conserva lo que la persona escribió y se ofrece recargar.
 */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const router = useRouter();

  function run<R extends Result>(fn: () => Promise<R>, onOk?: (r: R) => void) {
    setError(null);
    setCode(null);
    start(async () => {
      const r = await fn();
      if (r.ok) {
        onOk?.(r);
        router.refresh();
      } else {
        setError(r.error);
        setCode(r.code ?? null);
      }
    });
  }

  return { run, pending, error, code, clear: () => (setError(null), setCode(null)), reload: () => router.refresh() };
}
