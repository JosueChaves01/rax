/** Zona horaria de presentación (Costa Rica, UTC−6 sin horario de verano). Determinista en servidor y navegador. */
export const DISPLAY_UTC_OFFSET_HOURS = -6;

const HOUR = 3_600_000;
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const local = (iso: string) => new Date(Date.parse(iso) + DISPLAY_UTC_OFFSET_HOURS * HOUR);
const pad = (n: number) => String(n).padStart(2, "0");
const offsetLabel = () => {
  const sign = DISPLAY_UTC_OFFSET_HOURS < 0 ? "-" : "+";
  return `${sign}${pad(Math.abs(DISPLAY_UTC_OFFSET_HOURS))}:00`;
};

/** «jueves 5 de noviembre de 2026, 15:00» en la hora de la plataforma. */
export function longLocalDateTime(iso: string): string {
  const d = local(iso);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** «2026-11-05T15:00-06:00»: la hora local con su desfase, para que el modelo la copie tal cual. */
export function localIsoWithOffset(iso: string): string {
  const d = local(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${offsetLabel()}`;
}

export class SessionDateError extends Error {}

/**
 * Fecha y hora de una sesión escrita por el agente (o una persona): ISO con desfase o «Z», o una hora
 * local sin desfase («2026-11-05T15:00»), que se interpreta en la hora de la plataforma. Una fecha sin
 * hora no alcanza para agendar: se rechaza en vez de inventar la hora.
 */
export function parseSessionDateTime(raw?: string): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new SessionDateError("Falta la hora de la sesión: indicá fecha y hora.");
  const naive = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v);
  const ms = Date.parse(naive ? `${v.replace(" ", "T")}Z` : v);
  if (Number.isNaN(ms)) throw new SessionDateError("No se entendió la fecha de la sesión. Usá el formato AAAA-MM-DDTHH:MM.");
  return new Date(naive ? ms - DISPLAY_UTC_OFFSET_HOURS * HOUR : ms).toISOString();
}

export const PLATFORM_TIMEZONE_LABEL = `hora de Costa Rica, UTC${offsetLabel()}`;
