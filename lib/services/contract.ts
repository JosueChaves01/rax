import { notImplemented } from "@/lib/errors";

/**
 * Cuerpo de los servicios del pivot B2B que la Fase 0 deja como contrato (firma acordada, sin
 * implementación). Recibe los argumentos solo para que la firma quede completa y lanza
 * `notImplemented`. Cada dev reemplaza la llamada por la implementación real en su archivo.
 */
export function pendingContract(name: string, ...args: unknown[]): never {
  void args;
  throw notImplemented(name);
}
