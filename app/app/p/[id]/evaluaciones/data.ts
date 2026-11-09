import "server-only";
import { notFound, redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { isDomainError } from "@/lib/errors";
import type { ServiceDeps } from "@/lib/services/base";

/**
 * Lectura de una pantalla B2B (evaluaciones, material): exige sesión y traduce «no existe / sin
 * acceso» a la página 404, sin revelar si el proyecto o la evaluación existen.
 */
export async function loadB2B<T>(fn: (d: ServiceDeps) => Promise<T>): Promise<T> {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  try {
    return await fn(d);
  } catch (e) {
    if (isDomainError(e) && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  }
}

export const ASSESSMENT_STATUS_TAG = {
  draft: { label: "Borrador", color: "#64748b" },
  published: { label: "Abierta", color: "#0284c7" },
  closed: { label: "Cerrada", color: "#059669" },
} as const;
