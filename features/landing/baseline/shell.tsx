"use client";

import { motion, useReducedMotion } from "framer-motion";
import Lenis from "lenis";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowIcon, CloseIcon, EASE_IN_OUT_CUBIC, Eyebrow, PillButton, RaxMark, spring, StackedLines, useHoverEnabled } from "./motion";

/* ───────────── Contexto de la landing ───────────── */

type LandingCtx = {
  /** true cuando el loader termina: dispara las entradas del hero. */
  ready: boolean;
  openMenu: () => void;
  openStart: () => void;
  scrollTo: (href: string) => void;
};

const Ctx = createContext<LandingCtx>({ ready: true, openMenu() {}, openStart() {}, scrollTo() {} });
export const useLanding = () => useContext(Ctx);

const MIN_VISIBLE_MS = 1400;
const MAX_VISIBLE_MS = 2600;
const EXIT_MS = 850;

const FONT_BASE = 16;
const BASE_W = 1920;
const COEF = 0.6666;

export function LandingShell({ children, fontClass }: { children: ReactNode; fontClass: string }) {
  const reduced = useReducedMotion();
  const lenisRef = useRef<Lenis | null>(null);
  const [ready, setReady] = useState(false);
  const [loader, setLoader] = useState<"show" | "exit" | "gone">("show");
  const [menuOpen, setMenuOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Lenis (scroll suave) con su propio bucle rAF.
  useEffect(() => {
    setMounted(true);
    window.scrollTo(0, 0);
    const lenis = new Lenis({ smoothWheel: true });
    lenisRef.current = lenis;
    let id = 0;
    const raf = (t: number) => {
      lenis.raf(t);
      id = requestAnimationFrame(raf);
    };
    id = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(id);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Escala hacia arriba por encima de 1920px (por debajo mandan las media queries del CSS).
  useEffect(() => {
    const html = document.documentElement;
    const apply = () => {
      const reduction = ((BASE_W - window.innerWidth) / BASE_W) * 100 * COEF;
      const size = FONT_BASE - (FONT_BASE * reduction) / 100;
      if (size > FONT_BASE) html.style.fontSize = `${size}px`;
      else html.style.removeProperty("font-size");
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      html.style.removeProperty("font-size");
    };
  }, []);

  // Loader: visible al menos MIN_VISIBLE_MS después de `load` (o MAX_VISIBLE_MS si `load` no llega).
  useEffect(() => {
    const min = reduced ? 200 : MIN_VISIBLE_MS;
    const exit = reduced ? 0 : EXIT_MS;
    let countdown: ReturnType<typeof setTimeout> | undefined;
    let gone: ReturnType<typeof setTimeout> | undefined;
    let started = false;
    const finish = () => {
      setReady(true);
      setLoader("exit");
      gone = setTimeout(() => setLoader("gone"), exit);
    };
    const start = () => {
      if (started) return;
      started = true;
      countdown = setTimeout(finish, min);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    const force = setTimeout(start, MAX_VISIBLE_MS);
    return () => {
      window.removeEventListener("load", start);
      clearTimeout(force);
      clearTimeout(countdown);
      clearTimeout(gone);
    };
  }, [reduced]);

  // Bloqueo de scroll: loader, menú o modal abiertos.
  const locked = !ready || menuOpen || startOpen;
  useEffect(() => {
    const html = document.documentElement;
    if (locked) {
      lenisRef.current?.stop();
      html.classList.add("bl-locked");
    } else {
      lenisRef.current?.start();
      html.classList.remove("bl-locked");
    }
    return () => html.classList.remove("bl-locked");
  }, [locked, mounted]);

  const scrollTo = useCallback((href: string) => {
    const el = href.startsWith("#") ? document.querySelector(href) : null;
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el as HTMLElement);
    else el.scrollIntoView({ behavior: "smooth" });
  }, []);

  const ctx: LandingCtx = { ready, openMenu: () => setMenuOpen(true), openStart: () => setStartOpen(true), scrollTo };

  return (
    <Ctx.Provider value={ctx}>
      <div className={`bl-root ${fontClass}`}>
        <main className="w-full overflow-x-clip p-2 sm:p-3">{children}</main>
        {loader !== "gone" && <Loader exiting={loader === "exit"} />}
      </div>
      {mounted &&
        createPortal(
          <div className={`bl-portal ${fontClass}`}>
            <MenuOverlay
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              onNavigate={(href) => {
                setMenuOpen(false);
                // Espera a que Lenis se reactive antes de desplazarse.
                setTimeout(() => scrollTo(href), 30);
              }}
              onStart={() => {
                setMenuOpen(false);
                setStartOpen(true);
              }}
            />
            <StartModal open={startOpen} onClose={() => setStartOpen(false)} />
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}

/* ───────────── Loader ───────────── */

function Loader({ exiting }: { exiting: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="bl-loader fixed inset-0 z-[200] flex flex-col items-center justify-center gap-8 bg-(--bl-deep) text-white"
      initial={{ y: "0%" }}
      animate={{ y: exiting ? "-105%" : "0%" }}
      transition={{ duration: reduced ? 0 : 0.85, ease: EASE_IN_OUT_CUBIC }}
      aria-hidden
    >
      <motion.div className="flex items-center gap-3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={spring(200, 22)}>
        <RaxMark className="size-7" />
        <span className="text-2xl font-medium uppercase tracking-[0.2em]">RAX</span>
      </motion.div>
      <div className="h-px w-40 overflow-hidden rounded-(--bl-r-pill) bg-white/20">
        <motion.div
          className="h-full w-full origin-left bg-white"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.12, duration: (MIN_VISIBLE_MS - 120) / 1000, ease: EASE_IN_OUT_CUBIC }}
        />
      </div>
    </motion.div>
  );
}

/* ───────────── Escape para cerrar ───────────── */

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

function CloseButton({ onClick, label, tone }: { onClick: () => void; label: string; tone: "light" | "dark" }) {
  const hoverOn = useHoverEnabled();
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      onPointerEnter={() => hoverOn && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={`grid size-10 place-items-center rounded-(--bl-r-pill) transition-colors ${
        tone === "light" ? "bg-white/15 text-white backdrop-blur hover:bg-white/25" : "bg-(--bl-surface) text-(--bl-ink) hover:bg-(--bl-hair)"
      }`}
    >
      <CloseIcon hovered={hovered} />
    </button>
  );
}

/* ───────────── Menú a pantalla completa ───────────── */

export const MENU_LINKS: [string, string][] = [
  ["Cómo funciona", "#como-funciona"],
  ["Producto", "#producto"],
  ["Para quién", "#para-quien"],
  ["Preguntas", "#preguntas"],
];

function MenuOverlay({ open, onClose, onNavigate, onStart }: { open: boolean; onClose: () => void; onNavigate: (href: string) => void; onStart: () => void }) {
  useEscape(open, onClose);
  return (
    <div className={`fixed inset-0 z-[70] flex flex-col ${open ? "" : "pointer-events-none"}`} inert={!open} aria-hidden={!open}>
      <motion.div className="absolute inset-0 bg-(--bl-deep)" initial={{ opacity: 0 }} animate={{ opacity: open ? 1 : 0 }} transition={spring(260, 30)} onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        className="relative flex h-full flex-col p-2 text-white sm:p-3"
        initial={{ opacity: 0, y: -24 }}
        animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: -24 }}
        transition={spring(220, 28)}
      >
        <div className="flex h-full flex-col px-6 pb-6 pt-6 sm:px-10 sm:pb-10 sm:pt-8">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-base font-medium uppercase tracking-[0.2em]">
              <RaxMark />
              RAX
            </span>
            <CloseButton onClick={onClose} label="Cerrar menú" tone="light" />
          </div>
          <nav aria-label="Menú principal" className="flex flex-1 flex-col justify-center gap-2">
            {MENU_LINKS.map(([label, href], i) => (
              <motion.a
                key={href}
                href={href}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(href);
                }}
                className="block w-fit text-5xl font-medium tracking-tight transition-colors hover:text-(--bl-light) sm:text-7xl"
                initial={{ opacity: 0, y: 28 }}
                animate={open ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
                transition={spring(200, 26, open ? 120 + i * 70 : 0)}
              >
                {label}
              </motion.a>
            ))}
          </nav>
          <div className="flex flex-col gap-6 border-t border-white/15 pt-8 sm:flex-row sm:items-center sm:justify-between">
            <PillButton variant="light" onClick={onStart} className="w-fit">
              Crear cuenta
            </PillButton>
            <nav aria-label="Cuenta" className="flex gap-5 text-sm text-white/70">
              <Link href="/entrar" className="hover:text-white">
                Entrar
              </Link>
              <a
                href="#video"
                className="hover:text-white"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("#video");
                }}
              >
                Ver video
              </a>
            </nav>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

/* ───────────── Modal «Empieza con RAX» ───────────── */

const START_OPTIONS = [
  { title: "Soy emprendedor/a", body: "Ordena tu idea con el asistente y avanza por las etapas con un mentor.", href: "/entrar?modo=registro" },
  { title: "Quiero ser mentor/a", body: "Crea tu cuenta, elige «Mentor» en la bienvenida y un administrador revisa tu postulación.", href: "/entrar?modo=registro" },
];

function StartModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEscape(open, onClose);
  const firstRef = useRef<HTMLAnchorElement>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (open) {
      setRound((r) => r + 1);
      const t = setTimeout(() => firstRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <div className={`fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-6 ${open ? "" : "pointer-events-none"}`} inert={!open} aria-hidden={!open}>
      <motion.div className="absolute inset-0 bg-(--bl-deep)/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: open ? 1 : 0 }} transition={spring(240, 30)} onClick={onClose} />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-title"
        data-lenis-prevent
        className="relative max-h-[92svh] w-full overflow-y-auto rounded-(--bl-r-card-lg) bg-(--bl-card) p-6 text-(--bl-ink) shadow-[0_40px_120px_-20px_rgb(15_47_99/0.45)] sm:max-w-lg sm:p-8"
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 28, scale: 0.96 }}
        transition={spring(240, 26)}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <Eyebrow>Crear cuenta</Eyebrow>
            <StackedLines
              key={round}
              id="start-title"
              lines={["Empieza", "con tu idea"]}
              gate={open}
              stagger={90}
              duration={800}
              className="mt-3 text-4xl font-medium uppercase leading-[0.95] tracking-tight sm:text-5xl"
            />
          </div>
          <CloseButton onClick={onClose} label="Cerrar" tone="dark" />
        </div>
        <ul className="mt-7 flex flex-col gap-3">
          {START_OPTIONS.map((o, i) => (
            <li key={o.title}>
              <StartOption ref={i === 0 ? firstRef : undefined} {...o} />
            </li>
          ))}
        </ul>
        <p className="mt-6 text-center text-sm text-(--bl-soft)">
          ¿Ya tienes cuenta?{" "}
          <Link href="/entrar" className="font-medium text-(--bl-ink) underline underline-offset-4 hover:text-(--bl-brand)">
            Entrar
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

function StartOption({ title, body, href, ref }: { title: string; body: string; href: string; ref?: React.Ref<HTMLAnchorElement> }) {
  const hover = useHoverEnabled();
  return (
    <motion.div initial="rest" animate="rest" whileHover={hover ? "hover" : undefined}>
      <Link ref={ref} href={href} className="flex items-center gap-4 rounded-xl border border-(--bl-hair) bg-(--bl-bg) px-4 py-4 transition-colors hover:border-(--bl-ink)">
        <span className="flex-1">
          <span className="block text-base font-medium">{title}</span>
          <span className="mt-1 block text-sm leading-relaxed text-(--bl-soft)">{body}</span>
        </span>
        <motion.span
          className="grid size-10 shrink-0 place-items-center rounded-(--bl-r-pill) border border-(--bl-hair)"
          variants={{ rest: { x: 0, opacity: 0.55 }, hover: { x: 6, opacity: 1 } }}
          transition={spring(300, 20)}
        >
          <ArrowIcon />
        </motion.span>
      </Link>
    </motion.div>
  );
}

