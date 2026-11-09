/**
 * Banderas de funciones. Sin dependencias de servidor para poder usarlas en servicios y pruebas.
 */

const ON = new Set(["1", "true", "on", "yes"]);

/**
 * Flujo B2B centrado en el mentor (plan técnico del pivot). Apagado por defecto: con la bandera
 * apagada la app actual sigue igual. Se enciende con `RAX_B2B_FLOW=on` (o 1 / true / yes).
 */
export function isB2BFlow(env: Record<string, string | undefined> = process.env): boolean {
  return ON.has((env.RAX_B2B_FLOW ?? "").trim().toLowerCase());
}
