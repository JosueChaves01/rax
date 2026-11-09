import "server-only";
import { revalidatePath } from "next/cache";
import { getDeps } from "@/lib/runtime";
import { isDomainError } from "@/lib/errors";
import type { ServiceDeps } from "@/lib/services/base";

/**
 * Envoltorios comunes de las Server Actions (app/actions.ts y app/actions/*.ts).
 * Este archivo NO lleva "use server": exporta helpers, no acciones. Los archivos de acciones
 * los importan y solo exportan funciones async.
 */

export type ActionResult<T = undefined> = { ok: true; data?: T; notice?: string } | { ok: false; error: string; code?: string };

/**
 * Envoltorio común: exige sesión, traduce errores de dominio a mensajes seguros
 * (sin detalles internos) y revalida el espacio de trabajo.
 */
export async function run<T>(projectId: string | null, fn: (d: ServiceDeps) => Promise<T>, opts: { revalidate?: boolean } = {}): Promise<ActionResult<T>> {
  const d = await getDeps();
  if (!d) return { ok: false, error: "Tu sesión terminó. Volvé a entrar.", code: "unauthenticated" };
  try {
    const data = await fn(d);
    if (opts.revalidate !== false) {
      if (projectId) revalidatePath(`/app/p/${projectId}`, "layout");
      revalidatePath("/app", "layout");
    }
    return { ok: true, data };
  } catch (e) {
    if (isDomainError(e)) return { ok: false, error: e.message, code: e.code };
    console.error("[rax] acción fallida", e);
    return { ok: false, error: "Algo salió mal. Tus datos guardados no se perdieron; probá de nuevo." };
  }
}

/** Lecturas sin revalidar la página: se consultan seguido durante una llamada. */
export async function read<T>(fn: (d: ServiceDeps) => Promise<T>): Promise<ActionResult<T>> {
  const d = await getDeps();
  if (!d) return { ok: false, error: "Tu sesión terminó. Volvé a entrar.", code: "unauthenticated" };
  try {
    return { ok: true, data: await fn(d) };
  } catch (e) {
    if (isDomainError(e)) return { ok: false, error: e.message, code: e.code };
    console.error("[rax] lectura fallida", e);
    return { ok: false, error: "Algo salió mal. Probá de nuevo." };
  }
}
