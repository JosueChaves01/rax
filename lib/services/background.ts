import "server-only";
import { after } from "next/server";

/**
 * Corre una tarea después de responder (Next `after`, que en Vercel mantiene viva la función con
 * `waitUntil`). Así la persona no espera trabajo que no necesita ver: plegar la memoria del hilo,
 * métricas, etc. Fuera de un pedido (pruebas, scripts) la tarea se espera en el momento.
 * Un fallo se registra y no rompe nada: estas tareas son optimizaciones.
 */
export async function inBackground(label: string, task: () => Promise<unknown>): Promise<void> {
  const safe = () =>
    task().then(
      () => undefined,
      (e) => console.warn(`[${label}]`, e instanceof Error ? e.message : e),
    );
  try {
    after(safe);
  } catch {
    await safe();
  }
}
