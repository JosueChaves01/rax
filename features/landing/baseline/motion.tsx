"use client";

import { motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

/* ───────────── Curvas y resortes ───────────── */

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;
export const EASE_IN_OUT_CUBIC = [0.65, 0, 0.35, 1] as const;

/** Resorte con el modelo { tension, friction } (masa 1), equivalente al de react-spring. */
export function spring(tension: number, friction: number, delayMs = 0) {
  return { type: "spring" as const, stiffness: tension, damping: friction, mass: 1, delay: delayMs / 1000 };
}

/** Hover solo en pantallas > 768px con puntero fino (en celular no hay efectos hover). */
export function useHoverEnabled() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 769px) and (hover: hover)");
    const update = () => setOn(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return on;
}

/* ───────────── Inview: aparece una sola vez al entrar en pantalla ───────────── */

type MotionState = { opacity?: number; x?: number | string; y?: number | string; scale?: number; rotate?: number };

export function Inview({
  children,
  from,
  to,
  delayIn = 0,
  config = [200, 26],
  gate = true,
  className,
  as = "div",
  style,
}: {
  children?: ReactNode;
  from: MotionState;
  to: MotionState;
  delayIn?: number;
  config?: [number, number];
  /** Si es false, espera (p. ej. al loader) aunque ya esté en pantalla. */
  gate?: boolean;
  className?: string;
  as?: "div" | "li" | "article" | "figure" | "span";
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const reduced = useReducedMotion();
  const play = inView && gate;
  const Comp = motion[as] as ElementType;
  return (
    <Comp
      ref={ref}
      className={className}
      style={style}
      initial={reduced ? to : from}
      animate={play || reduced ? to : from}
      transition={spring(config[0], config[1], delayIn)}
    >
      {children}
    </Comp>
  );
}

/* ───────────── Revelado con máscara: palabras ───────────── */

export function ClipWords({
  text,
  play,
  stagger = 140,
  duration = 1100,
  delay = 0,
  className,
}: {
  text: string;
  play: boolean;
  stagger?: number;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const words = text.split(" ");
  return (
    <span className={className}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`}>
          <span className="bl-clip-word">
            <motion.span
              className="inline-block"
              initial={reduced ? false : { y: "115%", opacity: 0 }}
              animate={play || reduced ? { y: "0%", opacity: 1 } : { y: "115%", opacity: 0 }}
              transition={{ duration: duration / 1000, ease: EASE_OUT_EXPO, delay: (delay + i * stagger) / 1000 }}
            >
              {w}
            </motion.span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

/* ───────────── Revelado con máscara: líneas apiladas ───────────── */

export function StackedLines({
  lines,
  as = "h2",
  id,
  className,
  stagger = 120,
  baseDelay = 0,
  duration = 950,
  gate = true,
}: {
  lines: ReactNode[];
  as?: "h1" | "h2" | "h3" | "p";
  id?: string;
  className?: string;
  stagger?: number;
  baseDelay?: number;
  duration?: number;
  gate?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const reduced = useReducedMotion();
  const play = (inView && gate) || !!reduced;
  const Tag = as as ElementType;
  return (
    <Tag ref={ref} id={id} className={className}>
      {lines.map((line, i) => (
        <span key={i} className="bl-clip-line">
          <motion.span
            className="block"
            initial={reduced ? false : { y: "115%", opacity: 0 }}
            animate={play ? { y: "0%", opacity: 1 } : { y: "115%", opacity: 0 }}
            transition={{ duration: duration / 1000, ease: EASE_OUT_EXPO, delay: (baseDelay + i * stagger) / 1000 }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/* ───────────── Palabras que aparecen con fundido y subida ───────────── */

export function FadeWords({ text, className, stagger = 28, delayIn = 250, duration = 700 }: { text: string; className?: string; stagger?: number; delayIn?: number; duration?: number }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const reduced = useReducedMotion();
  const words = text.split(" ");
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i}>
          <motion.span
            className="inline-block"
            initial={reduced ? false : { y: 18, opacity: 0 }}
            animate={inView || reduced ? { y: 0, opacity: 1 } : { y: 18, opacity: 0 }}
            transition={{ duration: duration / 1000, ease: EASE_OUT_QUART, delay: (delayIn + i * stagger) / 1000 }}
          >
            {w}
          </motion.span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </p>
  );
}

/* ───────────── Paralaje ligado al progreso de scroll de una sección ───────────── */

export function useSectionProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  return { ref, progress: scrollYProgress };
}

export function useParallax(progress: ReturnType<typeof useScroll>["scrollYProgress"], from: string, to: string) {
  return useTransform(progress, [0, 1], [from, to]);
}

/* ───────────── Componentes compartidos ───────────── */

export function Eyebrow({ children, tone = "dark", className = "" }: { children: ReactNode; tone?: "dark" | "light"; className?: string }) {
  return (
    <p className={`inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.22em] ${tone === "dark" ? "text-(--bl-soft)" : "text-white/70"} ${className}`}>
      <span className={`size-1.5 rounded-(--bl-r-pill) ${tone === "dark" ? "bg-(--bl-brand)" : "bg-(--bl-light)"}`} aria-hidden />
      {children}
    </p>
  );
}

export function ArrowIcon({ className = "size-4", flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function CloseIcon({ hovered }: { hovered: boolean }) {
  return (
    <motion.svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="size-4" animate={{ rotate: hovered ? 90 : 0 }} transition={spring(300, 18)} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </motion.svg>
  );
}

const PILL_VARIANTS = {
  light: "bg-white text-(--bl-deep) hover:bg-(--bl-light) hover:text-white",
  solid: "bg-(--bl-ink) text-white hover:bg-(--bl-deep)",
  outline: "border border-current text-(--bl-ink) hover:bg-(--bl-ink) hover:text-white hover:border-(--bl-ink)",
};

const MotionLink = motion.create(Link);

/** Botón píldora con flecha que se desplaza en hover. Con href es un enlace; sin href, un botón. */
export function PillButton({ children, variant = "solid", href, onClick, className = "" }: { children: ReactNode; variant?: keyof typeof PILL_VARIANTS; href?: string; onClick?: () => void; className?: string }) {
  const hover = useHoverEnabled();
  const cls = `inline-flex items-center gap-2 rounded-(--bl-r-pill) px-7 py-3.5 text-sm font-medium uppercase tracking-wide transition-colors ${PILL_VARIANTS[variant]} ${className}`;
  const inner = (
    <>
      {children}
      <motion.span className="inline-flex" variants={{ rest: { x: 0 }, hover: { x: 5 } }} transition={spring(320, 20)}>
        <ArrowIcon />
      </motion.span>
    </>
  );
  const hoverProps = { initial: "rest", animate: "rest", whileHover: hover ? "hover" : undefined } as const;
  if (href)
    return (
      <MotionLink href={href} className={cls} onClick={onClick} {...hoverProps}>
        {inner}
      </MotionLink>
    );
  return (
    <motion.button type="button" className={cls} onClick={onClick} {...hoverProps}>
      {inner}
    </motion.button>
  );
}

export function ArrowButton({ dir, variant, onClick, label }: { dir: "prev" | "next"; variant: "outline" | "solid"; onClick: () => void; label: string }) {
  const hover = useHoverEnabled();
  const cls =
    variant === "outline"
      ? "border-(--bl-hair) bg-transparent text-(--bl-ink) hover:border-(--bl-ink)"
      : "border-(--bl-ink) bg-(--bl-ink) text-white hover:bg-(--bl-deep) hover:border-(--bl-deep)";
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`grid size-12 place-items-center rounded-(--bl-r-pill) border transition-colors sm:size-14 ${cls}`}
      initial="rest"
      animate="rest"
      whileHover={hover ? "hover" : undefined}
    >
      <motion.span className="inline-flex" variants={{ rest: { scale: 1 }, hover: { scale: 1.15 } }} transition={spring(320, 18)}>
        <ArrowIcon className="size-5" flip={dir === "prev"} />
      </motion.span>
    </motion.button>
  );
}

export function CarouselDots({ count, active, onSelect, tone = "dark", label }: { count: number; active: number; onSelect?: (i: number) => void; tone?: "dark" | "light"; label: string }) {
  return (
    <div className="flex gap-2" role="group" aria-label={label}>
      {Array.from({ length: count }, (_, i) => {
        const on = i === active;
        const color = on ? (tone === "dark" ? "bg-(--bl-ink)" : "bg-white") : tone === "dark" ? "bg-(--bl-ghost)" : "bg-white/40";
        return (
          <button key={i} type="button" className="p-1.5" aria-label={`Ir a ${i + 1}`} aria-current={on ? "true" : undefined} onClick={() => onSelect?.(i)}>
            <span className={`block h-1.5 rounded-(--bl-r-pill) transition-all duration-300 ${on ? "w-5" : "w-1.5"} ${color}`} />
          </button>
        );
      })}
    </div>
  );
}

/** Marca de RAX: círculo con una flecha de avance (de la duda a la decisión). */
export function RaxMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 15l6-6M10 9h5v5" />
    </svg>
  );
}

