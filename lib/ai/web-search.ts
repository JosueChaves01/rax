import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Búsqueda web para el agente. Usa Tavily (TAVILY_API_KEY) o Brave Search (BRAVE_SEARCH_API_KEY), el
 * primero que esté configurado; sin ninguno, la herramienta no se ofrece al modelo.
 */

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  published?: string;
}

export type WebSearchProvider = "tavily" | "brave";

export function webSearchProvider(): WebSearchProvider | null {
  if (process.env.TAVILY_API_KEY?.trim()) return "tavily";
  if (process.env.BRAVE_SEARCH_API_KEY?.trim()) return "brave";
  return null;
}

const SEARCH_TIMEOUT_MS = 12_000;
const PAGE_TIMEOUT_MS = 12_000;
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
/** Texto de una página que se le pasa al modelo. */
export const MAX_PAGE_CHARS = 9_000;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function timeoutSignal(ms: number, deadline?: number): AbortSignal {
  const left = deadline ? Math.max(1_000, Math.min(ms, deadline - Date.now() - 4_000)) : ms;
  return AbortSignal.timeout(left);
}

export async function webSearch(query: string, opts: { maxResults?: number; country?: string; deadline?: number } = {}): Promise<{ provider: WebSearchProvider; results: WebResult[] }> {
  const provider = webSearchProvider();
  if (!provider) throw new Error("La búsqueda web no está configurada.");
  const max = Math.min(Math.max(opts.maxResults ?? 5, 1), 8);
  const signal = timeoutSignal(SEARCH_TIMEOUT_MS, opts.deadline);

  if (provider === "tavily") {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY!.trim()}` },
      body: JSON.stringify({ query, max_results: max, search_depth: "basic", include_answer: false, include_raw_content: false }),
      signal,
    });
    if (!res.ok) throw new Error(`Tavily respondió ${res.status}`);
    const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> };
    return {
      provider,
      results: (json.results ?? [])
        .filter((r) => r.url)
        .map((r) => ({ title: clip(r.title ?? r.url!, 200), url: r.url!, snippet: clip(r.content ?? "", 700), ...(r.published_date ? { published: r.published_date } : {}) })),
    };
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(max));
  url.searchParams.set("search_lang", "es");
  if (opts.country) url.searchParams.set("country", opts.country);
  const res = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!.trim() }, signal });
  if (!res.ok) throw new Error(`Brave respondió ${res.status}`);
  const json = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string; extra_snippets?: string[]; age?: string }> } };
  return {
    provider,
    results: (json.web?.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({
        title: clip(stripTags(r.title ?? r.url!), 200),
        url: r.url!,
        snippet: clip(stripTags([r.description, ...(r.extra_snippets ?? [])].filter(Boolean).join(" ")), 700),
        ...(r.age ? { published: r.age } : {}),
      })),
  };
}

/* ───────────── Leer una página ───────────── */

/** Direcciones a las que el servidor nunca debe conectarse por pedido del modelo (red interna, metadatos de la nube). */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || s.startsWith("ff");
  }
  return true;
}

export class UnsafeUrlError extends Error {}

/** Solo http(s) a puertos estándar y a hosts públicos. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("La dirección no es válida.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UnsafeUrlError("Solo se pueden leer páginas http o https.");
  if (url.username || url.password) throw new UnsafeUrlError("La dirección no puede llevar usuario ni contraseña.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new UnsafeUrlError("Solo se pueden leer páginas en puertos estándar.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !isIP(host)) {
    throw new UnsafeUrlError("Esa dirección no es pública.");
  }
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new UnsafeUrlError("No se encontró ese sitio.");
  if (addresses.some(isPrivateAddress)) throw new UnsafeUrlError("Esa dirección no es pública.");
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ntilde: "ñ", Ntilde: "Ñ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", uuml: "ü", iexcl: "¡", iquest: "¿" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const stripTags = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, "")).trim();

/** Texto legible de una página HTML: sin scripts, estilos ni menús, con saltos donde había bloques. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200);
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const main = body.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] ?? body;
  const text = decodeEntities(
    main
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|header|form|aside)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(h[1-6])[^>]*>/gi, "\n\n## ")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section|\/table)[^>]*>/gi, "\n")
      .replace(/<(td|th)[^>]*>/gi, " | ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title, text };
}

async function readLimited(res: Response, max: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(Math.min(size, max));
  let offset = 0;
  for (const c of chunks) {
    out.set(c.subarray(0, out.length - offset), offset);
    offset += c.byteLength;
    if (offset >= out.length) break;
  }
  return out;
}

export interface WebPage {
  url: string;
  title: string;
  text: string;
  truncated: boolean;
}

/** Lee el texto de una página pública (HTML, texto o PDF). Sigue hasta 3 redirecciones, validando cada destino. */
export async function readWebPage(raw: string, opts: { deadline?: number; extractPdf?: (bytes: Uint8Array) => Promise<string> } = {}): Promise<WebPage> {
  let url = await assertPublicUrl(raw);
  const signal = timeoutSignal(PAGE_TIMEOUT_MS, opts.deadline);
  let res: Response | undefined;
  for (let hop = 0; hop <= 3; hop++) {
    res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RAX-Asistente/1.0)", Accept: "text/html,text/plain,application/pdf;q=0.9,*/*;q=0.5", "Accept-Language": "es,en;q=0.8" },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop === 3) throw new Error("La página redirige demasiadas veces.");
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    break;
  }
  if (!res || !res.ok) throw new Error(`La página respondió ${res?.status ?? "sin respuesta"}.`);
  const type = res.headers.get("content-type")?.toLowerCase() ?? "";
  const bytes = await readLimited(res, MAX_PAGE_BYTES);

  let title = url.hostname;
  let text: string;
  if (type.includes("application/pdf")) {
    if (!opts.extractPdf) throw new Error("No se pueden leer PDF aquí.");
    text = await opts.extractPdf(bytes);
  } else if (type.includes("html") || type.includes("xml") || type.startsWith("text/") || type === "") {
    const decoded = new TextDecoder("utf-8").decode(bytes);
    if (type.includes("html") || /<html[\s>]/i.test(decoded.slice(0, 2000))) {
      const page = htmlToText(decoded);
      title = page.title || title;
      text = page.text;
    } else text = decoded.trim();
  } else throw new Error("Ese enlace no es una página de texto.");

  if (!text) throw new Error("La página no tiene texto legible (puede necesitar JavaScript).");
  return { url: url.toString(), title, text: clip(text, MAX_PAGE_CHARS), truncated: text.length > MAX_PAGE_CHARS };
}
