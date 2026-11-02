"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { getSessionCallStateAction } from "@/app/actions";
import { CallErrorBoundary, PastCall, Result, TranscriptList, clock, type CallState } from "@/shared/ui/session-call";
import { useSessionCall } from "@/shared/ui/use-session-call";
import { Notice, cx } from "@/shared/ui/primitives";

/** Sección del contexto ya serializada desde el servidor. */
export interface RoomSection {
  id: string;
  title: string;
  short: string;
  count?: number;
  node: ReactNode;
}

/* ───────────── Íconos (trazos simples, sin dependencias) ───────────── */

const ICON: Record<string, string> = {
  proyecto: "M5 21V4h10l-1 3h5v9h-8l1-3H5",
  sesion: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  diagnostico: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z",
  hipotesis: "M9 3h6M10 3v6L4.5 19.5A1 1 0 0 0 5.4 21h13.2a1 1 0 0 0 .9-1.5L14 9V3M7 15h10",
  acuerdos: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9",
  tareas: "M3.5 6.5l1.5 1.5 3-3M3.5 13.5l1.5 1.5 3-3M11 7h10M11 14h10M11 20h10",
  sintesis: "M12 8v4l3 2M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5M3.5 4v4.5H8",
  notas: "M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4",
  documentos: "M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8l-5-5zM14 3v5h5M8.5 13h7M8.5 17h5",
  transcripcion: "M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zM7 10.5h4M7 14h6M14.5 10.5H17M15.5 14H17",
  llamadas: "M4 5a2 2 0 0 1 2-2h2.5l2 5-2.5 1.5a11 11 0 0 0 5.5 5.5L15 12.5l5 2V17a2 2 0 0 1-2 2A15 15 0 0 1 4 5z",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21",
  cam: "M3 7.5A1.5 1.5 0 0 1 4.5 6h9A1.5 1.5 0 0 1 15 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 3 16.5zM15 10.5l6-3.5v10l-6-3.5",
  slash: "M3.5 3.5l17 17",
  grid: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z",
  x: "M6 6l12 12M18 6L6 18",
  back: "M15 18l-6-6 6-6",
};

function Icon({ name, off, className }: { name: string; off?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cx("h-5 w-5", className)}>
      <path d={ICON[name] ?? ICON.notas} />
      {off && <path d={ICON.slash} />}
    </svg>
  );
}

/* ───────────── Video que llena su contenedor ───────────── */

function StageVideo({ stream, muted, label, off, className }: { stream: MediaStream | null; muted?: boolean; label: string; off?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  const hasVideo = Boolean(stream?.getVideoTracks().some((t) => t.readyState === "live")) && !off;
  return (
    <div className={cx("relative overflow-hidden bg-slate-900", className)}>
      <video ref={ref} autoPlay playsInline muted={muted} className={cx("h-full w-full object-cover", !hasVideo && "invisible")} />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700 text-xl font-bold text-white">{label.slice(0, 1).toUpperCase()}</span>
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">{label}</span>
    </div>
  );
}

/* ───────────── Ventanas (varias abiertas a la vez, movibles) ───────────── */

interface Win {
  id: string;
  x: number;
  y: number;
  z: number;
}

const WIN_W = 360;
const GAP = 12;

function useWindows(stage: React.RefObject<HTMLDivElement | null>) {
  const [wins, setWins] = useState<Win[]>([]);
  const z = useRef(1);

  const place = useCallback(
    (n: number) => {
      const el = stage.current;
      const W = el?.clientWidth ?? 1200;
      const w = Math.min(WIN_W, W - GAP * 2);
      // Se acomodan en columnas desde la derecha; cuando no caben más, se escalonan encima.
      const cols = Math.max(1, Math.floor((W - GAP) / (w + GAP)) - 1 || 1);
      const col = n % cols;
      const row = Math.floor(n / cols);
      return { x: Math.max(GAP, W - GAP - (col + 1) * w - col * GAP - row * 24), y: GAP + row * 32 };
    },
    [stage],
  );

  const isOpen = (id: string) => wins.some((w) => w.id === id);
  const focus = (id: string) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z: ++z.current } : w)));
  const close = (id: string) => setWins((ws) => ws.filter((w) => w.id !== id));
  const open = useCallback(
    (id: string) =>
      setWins((ws) => (ws.some((w) => w.id === id) ? ws.map((w) => (w.id === id ? { ...w, z: ++z.current } : w)) : [...ws, { id, ...place(ws.length), z: ++z.current }])),
    [place],
  );
  /** Desde la barra: si ya está al frente se cierra; si no, se abre o se trae al frente. */
  const toggle = (id: string) => {
    const w = wins.find((x) => x.id === id);
    if (w && w.z === z.current) close(id);
    else open(id);
  };
  const move = (id: string, x: number, y: number) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, x, y } : w)));
  const top = wins.reduce<Win | null>((a, w) => (!a || w.z > a.z ? w : a), null);

  return { wins, isOpen, focus, close, open, toggle, move, top };
}

function Window({
  win,
  title,
  count,
  icon,
  compact,
  stage,
  onFocus,
  onClose,
  onMove,
  children,
}: {
  win: Win;
  title: string;
  count?: number;
  icon: string;
  compact: boolean;
  stage: React.RefObject<HTMLDivElement | null>;
  onFocus: () => void;
  onClose: () => void;
  onMove: (x: number, y: number) => void;
  children: ReactNode;
}) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const W = stage.current?.clientWidth ?? 1200;
  const H = stage.current?.clientHeight ?? 800;
  const width = Math.min(WIN_W, W - GAP * 2);

  const onDown = (e: ReactPointerEvent) => {
    onFocus();
    if (compact || (e.target as HTMLElement).closest("button")) return;
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDrag = (e: ReactPointerEvent) => {
    if (!drag.current) return;
    const x = Math.min(Math.max(GAP, e.clientX - drag.current.dx), W - width - GAP);
    const y = Math.min(Math.max(GAP, e.clientY - drag.current.dy), H - 56);
    onMove(x, y);
  };

  return (
    <motion.section
      role="dialog"
      aria-label={title}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.16 }}
      onPointerDown={onFocus}
      style={compact ? { zIndex: win.z } : { zIndex: win.z, left: win.x, top: win.y, width, maxHeight: H - win.y - GAP }}
      className={cx(
        "absolute flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl shadow-slate-900/10 backdrop-blur",
        compact && "inset-x-2 bottom-2 max-h-[70%]",
      )}
    >
      <header
        onPointerDown={onDown}
        onPointerMove={onDrag}
        onPointerUp={() => (drag.current = null)}
        className={cx("flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2.5", !compact && "cursor-grab active:cursor-grabbing")}
      >
        <Icon name={icon} className="h-4 w-4 text-blue-600" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
          {title}
          {count !== undefined && <span className="ml-1.5 font-mono text-xs font-semibold text-slate-400">{count}</span>}
        </h2>
        <button type="button" onClick={onClose} aria-label={`Cerrar ${title}`} className="cursor-pointer rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <Icon name="x" className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </motion.section>
  );
}

/* ───────────── Pantalla ───────────── */

export function CallRoom(props: { sessionId: string; title: string; subtitle: string; backHref: string; sections: RoomSection[] }) {
  return (
    <CallErrorBoundary>
      <RoomLoader {...props} />
    </CallErrorBoundary>
  );
}

function RoomLoader(props: { sessionId: string; title: string; subtitle: string; backHref: string; sections: RoomSection[] }) {
  const [state, setState] = useState<CallState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getSessionCallStateAction(props.sessionId);
    if (res.ok && res.data) {
      setState(res.data);
      setError(null);
    } else if (!res.ok) setError(res.error);
  }, [props.sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  return <Room {...props} state={state} error={error} reload={load} />;
}

function Room({
  title,
  subtitle,
  backHref,
  sections,
  state,
  error,
  reload,
}: {
  title: string;
  subtitle: string;
  backHref: string;
  sections: RoomSection[];
  state: CallState | null;
  error: string | null;
  reload: () => Promise<void>;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const w = useWindows(stage);
  const [menuOpen, setMenuOpen] = useState(false);
  const opened = useRef(false);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCompact(el.clientWidth < 640));
    ro.observe(el);
    setCompact(el.clientWidth < 640);
    return () => ro.disconnect();
  }, []);

  // En pantallas grandes la agenda de la sesión arranca abierta.
  const { open: openWin } = w;
  useEffect(() => {
    if (opened.current || !stage.current) return;
    opened.current = true;
    if (stage.current.clientWidth >= 1024) openWin("sesion");
  }, [openWin]);

  const content: Record<string, { title: string; short: string; count?: number; node: ReactNode }> = Object.fromEntries(sections.map((s) => [s.id, s]));

  return (
    <div className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-slate-100 text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
        <Link href={backHref} aria-label="Salir de la pantalla de llamada" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
          <Icon name="back" />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{title}</p>
          <p className="truncate text-[11px] text-slate-500">{subtitle}</p>
        </div>
      </header>

      {state && state.ready ? (
        <Live state={state} reload={reload} stage={stage} compact={compact} windows={w} content={content} sections={sections} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      ) : (
        <div ref={stage} className="flex min-h-0 flex-1 items-center justify-center p-4">
          {error ? (
            <Notice tone="error">{error}</Notice>
          ) : state && !state.ready ? (
            <Notice tone="warn">Las llamadas necesitan la migración 20261101000003_session_calls.sql en Supabase.</Notice>
          ) : (
            <p className="text-sm text-slate-500">Preparando la llamada…</p>
          )}
        </div>
      )}
    </div>
  );
}

function Live({
  state,
  reload,
  stage,
  compact,
  windows: w,
  content,
  sections,
  menuOpen,
  setMenuOpen,
}: {
  state: CallState;
  reload: () => Promise<void>;
  stage: React.RefObject<HTMLDivElement | null>;
  compact: boolean;
  windows: ReturnType<typeof useWindows>;
  content: Record<string, { title: string; short: string; count?: number; node: ReactNode }>;
  sections: RoomSection[];
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
}) {
  const router = useRouter();
  const c = useSessionCall({
    sessionId: state.sessionId,
    projectId: state.projectId,
    me: state.me,
    iceServers: state.iceServers,
    transcriptionAvailable: state.transcriptionAvailable,
  });
  const live = c.phase === "in_call" || c.phase === "joining" || c.phase === "ending";
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!c.call || c.phase !== "in_call") return;
    const t = window.setInterval(() => setElapsed(Date.now() - Date.parse(c.call!.startedAt)), 1000);
    return () => window.clearInterval(t);
  }, [c.call, c.phase]);

  // Fuera de la llamada se revisa cada 15 s si la otra persona ya entró; el contexto se refresca cada minuto.
  useEffect(() => {
    if (c.phase !== "idle") return;
    const t = window.setInterval(reload, 15_000);
    return () => window.clearInterval(t);
  }, [c.phase, reload]);
  useEffect(() => {
    const t = window.setInterval(() => router.refresh(), 60_000);
    return () => window.clearInterval(t);
  }, [router]);

  // Al colgar se recarga el estado y el contexto (aparece la síntesis nueva).
  useEffect(() => {
    if (c.phase !== "ended") return;
    const t = window.setTimeout(() => {
      reload();
      router.refresh();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [c.phase, reload, router]);

  // Al entrar, la transcripción en vivo se abre sola en pantallas grandes.
  const { open } = w;
  useEffect(() => {
    if (c.phase === "in_call" && c.transcribing && !compact) open("transcripcion");
  }, [c.phase, c.transcribing, compact, open]);

  const extra: Record<string, { title: string; short: string; count?: number; node: ReactNode }> = {
    transcripcion: {
      title: "Transcripción en vivo",
      short: "Transcripción",
      count: c.segments.length || undefined,
      node: (
        <TranscriptList
          segments={c.segments}
          meId={state.me.id}
          tall
          empty={
            !live ? "La transcripción aparece aquí durante la llamada." : c.transcribing ? "Lo que digan aparecerá aquí cada 15 segundos aproximadamente." : "Sin transcripción en esta llamada."
          }
        />
      ),
    },
    llamadas: {
      title: "Llamadas anteriores",
      short: "Llamadas",
      count: state.pastCalls.length || undefined,
      node: state.pastCalls.length ? (
        <ul className="space-y-2">
          {state.pastCalls.map((p) => (
            <PastCall key={p.id} call={p} projectId={state.projectId} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">Todavía no hay llamadas anteriores en esta sesión.</p>
      ),
    },
  };
  const all = { ...content, ...extra };
  const navSections = [...sections.map((s) => s.id), ...(state.pastCalls.length ? ["llamadas"] : [])];

  const status =
    c.phase === "joining" ? "Conectando…"
    : c.phase === "ending" ? "Guardando la transcripción…"
    : c.phase === "ended" ? "Llamada terminada"
    : !live ? (state.activeCall ? "La otra persona ya está en la llamada" : state.canCall ? "Sin iniciar" : "Sesión cerrada")
    : !c.peer ? "Esperando a la otra persona…"
    : c.connection === "connected" ? `En llamada con ${c.peer.name}`
    : c.connection === "failed" ? "No se pudo conectar el audio y video"
    : `Conectando con ${c.peer.name}…`;

  const ctrl = "flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <>
      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
        {/* Escenario */}
        {live ? (
          <div className="relative h-full w-full">
            <StageVideo stream={c.remoteStream} label={c.peer?.name ?? "Otra persona"} className="h-full w-full rounded-2xl" />
            <StageVideo
              stream={c.localStream}
              muted
              off={!c.camOn}
              label={`${state.me.name} (tú)`}
              className={cx("absolute aspect-video rounded-xl shadow-lg ring-2 ring-white", compact ? "right-2 top-2 w-28" : "bottom-3 left-3 w-56")}
            />
            <span className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold text-white" aria-live="polite">
              {status}
            </span>
          </div>
        ) : c.phase === "ended" ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-h-full w-full max-w-xl space-y-3 overflow-y-auto">
              {c.result ? (
                <Result projectId={state.projectId} sessionId={state.sessionId} result={c.result} />
              ) : (
                <Notice tone="info">La llamada terminó. La transcripción y la síntesis se guardan en la sesión en unos segundos.</Notice>
              )}
              <button type="button" onClick={c.reset} className="cursor-pointer text-xs font-semibold text-blue-600 hover:underline">
                ← Volver a la sala
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xs">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Icon name="llamadas" className="h-7 w-7" />
              </span>
              <p className="mt-4 text-lg font-bold text-slate-900">
                {state.activeCall ? "La llamada ya empezó" : state.canCall ? "Todo listo para la llamada" : "Esta sesión ya está cerrada"}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500">
                {!state.canCall
                  ? "Podés revisar el contexto del proyecto y las llamadas anteriores desde la barra de abajo."
                  : state.transcriptionAvailable
                    ? "Al unirte aceptás que tu voz se transcriba. La transcripción queda en el proyecto y el agente la usa para proponer los siguientes pasos."
                    : "La llamada funciona, pero la transcripción está apagada: falta configurar GROQ_API_KEY en el servidor."}
              </p>
              {state.canCall && (
                <button
                  type="button"
                  onClick={c.join}
                  className="mt-5 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-blue-600 px-6 text-sm font-semibold text-white shadow-xs hover:bg-blue-700"
                >
                  <Icon name="llamadas" className="h-4 w-4" />
                  {state.activeCall ? "Unirme a la llamada" : "Iniciar llamada"}
                </button>
              )}
              <p className="mt-4 text-[11px] text-slate-400">Abrí el contexto que necesités desde la barra inferior; podés tener varias ventanas a la vez.</p>
            </div>
          </div>
        )}

        {/* Ventanas de contexto */}
        <AnimatePresence>
          {w.wins
            .filter((win) => !compact || win.id === w.top?.id)
            .map((win) => {
              const s = all[win.id];
              if (!s) return null;
              return (
                <Window
                  key={win.id}
                  win={win}
                  title={s.title}
                  count={s.count}
                  icon={win.id}
                  compact={compact}
                  stage={stage}
                  onFocus={() => w.focus(win.id)}
                  onClose={() => w.close(win.id)}
                  onMove={(x, y) => w.move(win.id, x, y)}
                >
                  {s.node}
                </Window>
              );
            })}
        </AnimatePresence>

        {c.error && (
          <div role="alert" className="absolute left-1/2 top-3 z-[999] flex max-w-[90%] -translate-x-1/2 items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 shadow-lg">
            <span>{c.error}</span>
            <button type="button" className="cursor-pointer font-bold" onClick={c.dismissError} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        )}
      </div>

      {/* Barra inferior */}
      <nav aria-label="Controles de la llamada" className="relative flex h-[72px] shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-2 sm:px-4">
        {/* Contexto */}
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <div className="relative lg:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-expanded={menuOpen}
              className={cx("flex cursor-pointer flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[10px] font-semibold", menuOpen ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100")}
            >
              <Icon name="grid" />
              Contexto
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 z-[999] mb-3 grid w-[min(92vw,360px)] grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                {navSections.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      w.open(id);
                      setMenuOpen(false);
                    }}
                    className={cx("flex cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-[11px] font-semibold", w.isOpen(id) ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50")}
                  >
                    <Icon name={id} />
                    {all[id].short}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="hidden min-w-0 items-center gap-0.5 lg:flex">
            {navSections.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => w.toggle(id)}
                title={all[id].title}
                aria-pressed={w.isOpen(id)}
                className={cx(
                  "relative flex cursor-pointer flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-semibold transition-colors",
                  w.isOpen(id) ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
                )}
              >
                <Icon name={id} />
                <span className="hidden xl:block">{all[id].short}</span>
                {all[id].count !== undefined && (
                  <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-slate-200 px-1 text-center font-mono text-[9px] leading-4 text-slate-700">{all[id].count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Llamada */}
        <div className="flex shrink-0 items-center gap-2">
          {live && (
            <>
              <button
                type="button"
                onClick={c.toggleMic}
                disabled={c.phase !== "in_call"}
                aria-label={c.micOn ? "Silenciar micrófono" : "Activar micrófono"}
                className={cx(ctrl, c.micOn ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-rose-200 bg-rose-50 text-rose-600")}
              >
                <Icon name="mic" off={!c.micOn} />
              </button>
              {c.hasVideo && (
                <button
                  type="button"
                  onClick={c.toggleCam}
                  disabled={c.phase !== "in_call"}
                  aria-label={c.camOn ? "Apagar cámara" : "Encender cámara"}
                  className={cx(ctrl, c.camOn ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-rose-200 bg-rose-50 text-rose-600")}
                >
                  <Icon name="cam" off={!c.camOn} />
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => (compact ? w.open("transcripcion") : w.toggle("transcripcion"))}
            aria-label="Transcripción en vivo"
            aria-pressed={w.isOpen("transcripcion")}
            className={cx(ctrl, w.isOpen("transcripcion") ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}
          >
            <Icon name="transcripcion" />
          </button>
          {live ? (
            <button
              type="button"
              onClick={c.hangUp}
              disabled={c.phase !== "in_call"}
              className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-rose-600 px-4 text-xs font-semibold text-white shadow-xs hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
            >
              <Icon name="llamadas" className="h-4 w-4 rotate-[135deg]" />
              <span className="hidden sm:inline">{c.phase === "ending" ? "Guardando…" : "Colgar y guardar"}</span>
            </button>
          ) : (
            state.canCall &&
            c.phase === "idle" && (
              <button type="button" onClick={c.join} className="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-blue-600 px-4 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 sm:px-5">
                <Icon name="llamadas" className="h-4 w-4" />
                <span className="hidden sm:inline">{state.activeCall ? "Unirme" : "Iniciar"}</span>
              </button>
            )
          )}
        </div>

        {/* Estado */}
        <div className="hidden flex-1 items-center justify-end gap-3 text-right sm:flex">
          {live && c.phase === "in_call" && <span className="font-mono text-sm font-semibold text-slate-800">{clock(elapsed)}</span>}
          <span className={cx("text-[11px] font-semibold", live && c.transcribing ? "text-emerald-700" : "text-slate-400")}>
            {live ? (c.transcribing ? "● Transcribiendo" : "Transcripción apagada") : status}
          </span>
        </div>
      </nav>
    </>
  );
}
