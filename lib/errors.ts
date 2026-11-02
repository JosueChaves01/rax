/** Errores de dominio. La UI los traduce a mensajes comprensibles sin exponer detalles internos. */
export class DomainError extends Error {
  constructor(
    readonly code: "forbidden" | "not_found" | "conflict" | "validation" | "invalid_transition" | "ai_unavailable" | "rate_limited",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const forbidden = (msg = "No tenés permiso para esta acción.") => new DomainError("forbidden", msg);
export const notFound = (msg = "No encontramos lo que buscás.") => new DomainError("not_found", msg);
export const conflict = (msg = "Otra persona modificó este elemento mientras lo editabas.") =>
  new DomainError("conflict", msg);
export const validation = (msg: string) => new DomainError("validation", msg);
export const invalidTransition = (from: string, to: string) =>
  new DomainError("invalid_transition", `No se puede pasar de «${from}» a «${to}».`);

export const rateLimited = (msg: string) => new DomainError("rate_limited", msg);

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
