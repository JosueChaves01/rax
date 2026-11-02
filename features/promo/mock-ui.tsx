"use client";

import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { navFor, NavGlyph, type NavIcon } from "@/shared/ui/nav-items";
import { cx } from "@/shared/ui/primitives";

/**
 * Piezas de interfaz simuladas para el video promocional. Copian el aspecto de la app real
 * (barra lateral navy, lienzo claro, tarjetas blancas, acento azul) sin depender de datos.
 */

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Escribe un texto letra por letra a partir de un retraso, en milisegundos. */
export function useTyped(text: string, delay = 0, speed = 38) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let i = 0;
    let iv: ReturnType<typeof setInterval> | undefined;
    const to = setTimeout(() => {
      iv = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length && iv) clearInterval(iv);
      }, speed);
    }, delay);
    return () => {
      clearTimeout(to);
      if (iv) clearInterval(iv);
    };
  }, [text, delay, speed]);
  return text.slice(0, n);
}

export function Typed({ text, delay, speed, caret = true }: { text: string; delay?: number; speed?: number; caret?: boolean }) {
  const shown = useTyped(text, delay, speed);
  const done = shown.length >= text.length;
  return (
    <>
      {shown}
      {caret && !done && <motion.span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-blue-600" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.9, repeat: Infinity }} />}
    </>
  );
}

/** Ventana de la app: barra lateral real según el rol y un lienzo claro a la derecha. */
export function AppFrame({
  role = "entrepreneur",
  active,
  children,
  delay = 0.15,
}: {
  role?: "entrepreneur" | "mentor";
  active: string;
  children: ReactNode;
  delay?: number;
}) {
  const nav = navFor(role);
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.98 }}
      transition={{ duration: 0.8, delay, ease: EASE }}
      className="flex h-[760px] w-[1120px] overflow-hidden rounded-[28px] border border-slate-200 bg-[#f8fafc] shadow-[0_40px_120px_-30px_rgb(15_23_42/0.35)]"
    >
      <aside className="flex w-[232px] shrink-0 flex-col bg-[#0b132b] text-white">
        <div className="flex h-[68px] items-center gap-2 border-b border-slate-800/80 px-5">
          <span className="text-2xl font-black tracking-tight">
            <span className="text-blue-500">R</span>AX
          </span>
          <span className="rounded border border-blue-500/30 bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-blue-400">
            {role === "mentor" ? "Mentor" : "Emprendedor"}
          </span>
        </div>
        <nav className="flex-1 px-3 py-4">
          <NavGroup title="Tu trabajo" items={nav.main} active={active} />
          <NavGroup title="Apoyo" items={nav.support} active={active} className="mt-6" />
        </nav>
        <div className="border-t border-slate-800/80 p-3">
          <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600/30 text-[10px] font-bold text-blue-400">RAX</div>
            <div>
              <p className="text-xs font-semibold">Asistente IA</p>
              <p className="text-[10px] text-slate-400">Te guía paso a paso</p>
            </div>
          </div>
        </div>
      </aside>
      <div className="relative min-w-0 flex-1 overflow-hidden">{children}</div>
    </motion.div>
  );
}

function NavGroup({ title, items, active, className }: { title: string; items: { label: string; icon: NavIcon }[]; active: string; className?: string }) {
  return (
    <div className={className}>
      <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{title}</p>
      <ul className="space-y-1">
        {items.map((it) => {
          const on = it.label === active;
          return (
            <li key={it.label} className="relative">
              {on && (
                <motion.span
                  layoutId="promo-nav-active"
                  className="absolute inset-0 rounded-lg bg-blue-600"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <span className={cx("relative flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium", on ? "font-semibold text-white" : "text-slate-400")}>
                <NavGlyph icon={it.icon} />
                {it.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Cabecera del lienzo, como la de la app. */
export function CanvasHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: ReactNode }) {
  return (
    <div className="flex h-[68px] items-center justify-between border-b border-slate-200 bg-white/80 px-8">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p>
        <p className="text-[17px] font-bold tracking-tight text-slate-900">{title}</p>
      </div>
      {right}
    </div>
  );
}

export function Pill({ children, color = "#2563eb", className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", className)}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 9%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function Avatar({ initials, color, size = 36 }: { initials: string; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

/** Cursor simulado que se mueve hasta un punto y "hace clic". */
export function FakeCursor({ path, clickAt }: { path: { x: number; y: number; t: number }[]; clickAt?: number[] }) {
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const total = path[path.length - 1].t;
  const times = path.map((p) => p.t / total);
  return (
    <motion.div
      className="pointer-events-none absolute left-0 top-0 z-50"
      initial={{ x: xs[0], y: ys[0], opacity: 0 }}
      animate={{ x: xs, y: ys, opacity: 1 }}
      transition={{ duration: total, times, ease: "easeInOut", opacity: { duration: 0.3 } }}
    >
      {clickAt?.map((t) => (
        <motion.span
          key={t}
          className="absolute -left-4 -top-4 h-8 w-8 rounded-full bg-blue-500/40"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.6], opacity: [0.8, 0] }}
          transition={{ delay: t, duration: 0.5 }}
        />
      ))}
      <svg width="26" height="26" viewBox="0 0 24 24" className="drop-shadow-[0_2px_4px_rgb(0_0_0/0.35)]">
        <path d="M4 2l16 9.5-7 1.6-3.6 6.4z" fill="#0f172a" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </motion.div>
  );
}

/** Tres puntos de "escribiendo". */
export function TypingDots() {
  return (
    <span className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-slate-400"
          animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}
