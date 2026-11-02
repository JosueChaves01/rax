"use client";

import { AnimatePresence, motion, useInView, useReducedMotion, useTransform } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { STAGES } from "@/features/projects/stages";
import {
  ArrowButton,
  ArrowIcon,
  CarouselDots,
  ClipWords,
  Eyebrow,
  FadeWords,
  Inview,
  PillButton,
  RaxMark,
  spring,
  StackedLines,
  useHoverEnabled,
  useSectionProgress,
} from "./motion";
import { useLanding } from "./shell";

/* ═════════════════════════════ Contenido ═════════════════════════════ */

const HERO_SLIDES = [
  { img: "/landing/asistente.webp", brand: "Asistente IA", title: "Ordena hechos y supuestos", cta: "Ver producto", href: "#producto", alt: "Chat del asistente de RAX clasificando un hecho, un supuesto y una duda" },
  { img: "/landing/mentor.webp", brand: "Mentoría", title: "Bandeja del mentor", cta: "Ver cómo funciona", href: "#como-funciona", alt: "Bandeja del mentor con proyectos pendientes" },
  { img: "/landing/llamada.webp", brand: "Sesiones", title: "Llamadas transcritas", cta: "Ver el video", href: "#video", alt: "Videollamada entre emprendedora y mentora con transcripción" },
];

const PRINCIPLE_SLIDES = [
  { headline: ["Primero", "Pregunta", "Después", "Opina"], img: "/landing/asistente.webp", name: "Asistente IA", role: "Una pregunta a la vez", alt: "El asistente de RAX haciendo una pregunta" },
  { headline: ["Mentor", "Humano", "Contexto", "Completo"], img: "/landing/mentor.webp", name: "Tu mentor", role: "Ve todo tu proyecto", alt: "Bandeja del mentor con los proyectos asignados" },
  { headline: ["Prueba", "Pequeño", "Decide", "Mejor"], img: "/landing/notas.webp", name: "Notas de sesión", role: "Acuerdos y experimentos", alt: "Notas de sesión con acuerdos, experimento y tareas" },
];

const STAGE_COPY: Record<string, string> = {
  entender: "Conversas con el asistente y separas lo que es un hecho, lo que es un supuesto y lo que todavía no sabes.",
  orientar: "Tu mentor revisa el contexto y te ayuda a decidir qué conviene investigar primero.",
  probar: "Conviertes la duda principal en una hipótesis y un experimento pequeño, con el criterio de éxito definido antes de empezar.",
  decidir: "Con resultados en la mano decides con tu mentor: continuar, reformular, profundizar, pausar o descartar.",
};

const FEATURES = [
  { eyebrow: "Asistente IA", title: "Un asistente que pregunta antes de opinar.", points: ["«No sé» también es una respuesta válida", "Separa hechos, supuestos y dudas abiertas", "Redacta resúmenes y documentos en PDF o Word"] },
  { eyebrow: "Mentoría", title: "Un mentor de verdad, con todo el contexto.", points: ["Bandeja con lo que necesita su revisión", "Sesiones agendadas dentro del proyecto", "Aprueba hipótesis y resultados contigo"] },
  { eyebrow: "Sesiones", title: "Llamadas con transcripción automática.", points: ["Videollamada integrada", "Transcripción con IA por persona", "Todo queda en el historial del proyecto"] },
  { eyebrow: "Notas", title: "Notas que se convierten en acción.", points: ["Acuerdos, experimentos y tareas separados", "Respuestas en hilo con tu mentor", "El asistente recuerda lo acordado"] },
];

const COURT_TILES = [
  { img: "/landing/llamada.webp", name: "Llamadas", desc: "Videollamada con tu mentor, transcrita automáticamente.", tone: "deep" as const, alt: "Videollamada con transcripción en vivo" },
  { img: "/landing/notas.webp", name: "Notas con IA", desc: "Acuerdos, experimentos y tareas de cada sesión.", tone: "teal" as const, alt: "Notas de sesión generadas con IA" },
];

const STATS = [
  ["4", "Etapas, de la idea a la decisión"],
  ["1", "Pregunta a la vez del asistente"],
  ["5", "Decisiones posibles al cerrar el ciclo"],
  ["2", "Formatos de documento: PDF y Word"],
];

const AUDIENCES = [
  {
    title: "Emprendedores y estudiantes",
    body: "Valida tu idea antes de invertir tiempo y dinero. Sabes en qué etapa estás y cuál es el siguiente paso.",
    cta: { label: "Crear mi cuenta", href: "/entrar?modo=registro" },
    icon: "M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2zM9 21h6",
  },
  {
    title: "Mentores",
    body: "Acompaña varios proyectos con el contexto completo: conversaciones, hipótesis, transcripciones y notas en un solo lugar.",
    cta: { label: "Postular como mentor", href: "/entrar?modo=registro" },
    icon: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  },
  {
    title: "Programas e incubadoras",
    body: "Un administrador aprueba mentores, los asigna a cada proyecto y ve el avance de todos en las mismas cuatro etapas.",
    cta: { label: "Ver cómo funciona", href: "#como-funciona" },
    icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
  },
];

const FAQ = [
  { q: "¿Necesito tener la idea clara para empezar?", a: "No. RAX está pensado para ideas en etapa temprana. Empiezas contando lo que tienes, aunque sea poco, y el asistente te ayuda a ordenarlo. «No sé» también es una respuesta válida." },
  { q: "¿La IA decide por mí?", a: "No. La IA ordena y sugiere, pero tú confirmas o corriges cada interpretación y las decisiones importantes las tomas con tu mentor. Una sugerencia de IA no es validación." },
  { q: "¿Cómo se asigna mi mentor?", a: "Un administrador del programa asigna un mentor a tu proyecto. Mientras tanto puedes avanzar en la etapa Entender con el asistente." },
  { q: "¿Puedo ser mentor?", a: "Sí. Crea tu cuenta y elige «Mentor» en la bienvenida. Un administrador revisa tu postulación y, al aprobarla, empiezas a recibir proyectos." },
  { q: "¿Qué pasa con las llamadas y las notas?", a: "Las transcripciones y notas quedan guardadas dentro del proyecto para que tú y tu mentor puedan volver a ellas cuando lo necesiten." },
];

const H2 = "text-4xl sm:text-5xl font-medium uppercase leading-[0.95] tracking-tight";

/** Enlace a un ancla de la página que se desplaza con Lenis. */
function AnchorLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const { scrollTo } = useLanding();
  if (!href.startsWith("#"))
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        scrollTo(href);
      }}
    >
      {children}
    </a>
  );
}

/* ═════════════════════════════ 1-2) Encabezado + Hero ═════════════════════════════ */

function SiteHeader() {
  const { openMenu, openStart } = useLanding();
  return (
    <header className="relative z-10 flex items-center px-6 pt-6 text-xs text-white sm:px-10 sm:pt-8">
      <nav aria-label="Secciones" className="hidden flex-1 gap-8 lg:flex">
        <AnchorLink href="#como-funciona" className="uppercase tracking-wide text-white/90 transition-opacity hover:text-white">
          Cómo funciona
        </AnchorLink>
        <AnchorLink href="#producto" className="uppercase tracking-wide text-white/90 transition-opacity hover:text-white">
          Producto
        </AnchorLink>
      </nav>
      <Link href="/" aria-label="RAX, inicio" className="flex flex-1 items-center gap-2 text-base font-medium uppercase tracking-[0.2em] lg:justify-center">
        <RaxMark />
        RAX
      </Link>
      <div className="flex flex-1 items-center justify-end gap-4 sm:gap-5">
        <Link href="/entrar" className="hidden uppercase tracking-wide underline-offset-4 hover:underline sm:inline">
          Entrar
        </Link>
        <button type="button" onClick={openStart} className="hidden uppercase tracking-wide underline-offset-4 hover:underline sm:inline">
          Crear cuenta
        </button>
        <button
          type="button"
          onClick={openMenu}
          aria-label="Abrir menú"
          className="grid size-10 place-items-center rounded-(--bl-r-pill) bg-white/15 backdrop-blur transition-colors hover:bg-white/25"
        >
          <span className="flex flex-col gap-[5px]">
            <span className="block h-px w-4 bg-white" />
            <span className="block h-px w-4 bg-white" />
          </span>
        </button>
      </div>
    </header>
  );
}

function Hero() {
  const { ready } = useLanding();
  const { ref, progress } = useSectionProgress<HTMLElement>();
  const plateY = useTransform(progress, [0, 1], ["0%", "12%"]);
  return (
    <section
      ref={ref}
      aria-labelledby="hero-title"
      className="relative isolate flex h-[calc(100svh-1rem)] min-h-[36rem] flex-col overflow-hidden rounded-(--bl-r-card-lg) bg-(--bl-deep) text-white sm:h-[calc(100svh-1.5rem)]"
    >
      {/* Placa de fondo con paralaje: el producto, teñido de navy. */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        <motion.div className="absolute inset-x-0 top-[-16%] h-[132%] w-full" style={{ y: plateY }}>
          <Image src="/landing/asistente.webp" alt="" fill priority sizes="100vw" className="object-cover opacity-30 mix-blend-luminosity blur-[3px]" />
        </motion.div>
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(15,47,99,0.65), rgba(15,47,99,0.35), rgba(15,47,99,0.75))" }} />
      </div>

      <SiteHeader />

      <div className="pointer-events-none px-6 pt-4 sm:px-10">
        <h1 id="hero-title" className="whitespace-nowrap text-[10vw] font-medium uppercase sm:text-[11.6vw] leading-[0.85] tracking-[-0.02em]">
          <ClipWords text="Ordena tu idea" play={ready} stagger={140} duration={1100} />
        </h1>
      </div>

      <div className="mt-auto flex flex-col gap-6 px-6 pb-8 sm:flex-row sm:items-end sm:justify-between sm:px-10 sm:pb-10">
        <StackedLines
          as="p"
          lines={["Duda menos,", "decide mejor"]}
          gate={ready}
          baseDelay={350}
          stagger={110}
          duration={900}
          className="text-[2.4rem] font-medium uppercase leading-[0.95] tracking-tight text-white/85"
        />
        <div className="flex items-end gap-4">
          <Inview from={{ opacity: 0, y: 28 }} to={{ opacity: 1, y: 0 }} delayIn={650} gate={ready} className="hidden w-64 flex-col gap-3 md:flex">
            <ProductSlider />
          </Inview>
          <Inview from={{ opacity: 0, y: 28 }} to={{ opacity: 1, y: 0 }} delayIn={780} gate={ready} as="article" className="w-full max-w-80 sm:max-w-60">
            <StagesCard />
          </Inview>
        </div>
      </div>
    </section>
  );
}

const GLASS = "rounded-(--bl-r-card) border border-white/15 bg-white/10 p-3 shadow-[0_20px_50px_-20px_rgb(15_47_99/0.2)] backdrop-blur-md";

function ProductSlider() {
  const { ready } = useLanding();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => setI((n) => (n + 1) % HERO_SLIDES.length), 3800);
    return () => clearInterval(t);
  }, [ready]);
  const s = HERO_SLIDES[i];
  return (
    <>
      <div className="relative h-[5rem]">
        <AnimatePresence initial={false}>
          <motion.div
            key={i}
            className={`absolute inset-0 flex gap-3 ${GLASS}`}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={spring(210, 24)}
          >
            <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white">
              <Image src={s.img} alt={s.alt} fill sizes="56px" className="object-cover object-left-top" />
            </span>
            <span className="flex min-w-0 flex-col justify-center">
              <span className="text-[0.7rem] font-medium uppercase tracking-wide">{s.brand}</span>
              <span className="truncate text-[0.7rem] uppercase opacity-80">{s.title}</span>
              <AnchorLink href={s.href} className="mt-1 text-[0.65rem] underline underline-offset-2">
                {s.cta} →
              </AnchorLink>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
      <CarouselDots count={HERO_SLIDES.length} active={i} onSelect={setI} tone="light" label="Vistas del producto" />
    </>
  );
}

function StagesCard() {
  return (
    <div className={`flex items-stretch gap-3 ${GLASS}`}>
      <div className="flex flex-1 flex-col justify-between gap-2">
        <p className="text-3xl font-medium leading-none">4 etapas</p>
        <div className="flex -space-x-2" aria-hidden>
          {["#5790e6", "#c2e029", "#0b6e97", "#ffffff"].map((c) => (
            <span key={c} className="size-5 rounded-(--bl-r-pill) border border-(--bl-deep)/40" style={{ background: c }} />
          ))}
        </div>
        <p className="text-[0.65rem] opacity-80">{STAGES.map((s) => s.label).join(" · ")}</p>
      </div>
      <span className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-xl bg-white">
        <Image src="/landing/notas.webp" alt="Notas de sesión con acuerdos y experimentos" fill sizes="64px" className="object-cover object-left-top" />
      </span>
    </div>
  );
}

/* ═════════════════════════════ 3) Principios (carrusel con palabras fantasma) ═════════════════════════════ */

function GhostWord({ word, ink, from, to, progress, slide, play }: { word: string; ink?: boolean; from: string; to: string; progress: ReturnType<typeof useSectionProgress>["progress"]; slide: number; play: boolean }) {
  const x = useTransform(progress, [0, 1], [from, to]);
  const reduced = useReducedMotion();
  return (
    <motion.span className={`bl-clip-word ${ink ? "text-(--bl-ink)" : "text-(--bl-ghost)"}`} style={{ x }}>
      <motion.span
        key={`${slide}-${word}`}
        className="inline-block"
        initial={reduced ? false : { y: "115%", opacity: 0 }}
        animate={play || reduced ? { y: "0%", opacity: 1 } : { y: "115%", opacity: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        {word}
      </motion.span>
    </motion.span>
  );
}

function Principles() {
  const [i, setI] = useState(0);
  const { ref, progress } = useSectionProgress<HTMLElement>();
  const s = PRINCIPLE_SLIDES[i];
  const n = PRINCIPLE_SLIDES.length;
  const [w1, w2, w3, w4] = s.headline;
  // Se observa el h2 (no cada palabra: la máscara las oculta y el observer nunca las vería).
  const titleRef = useRef<HTMLHeadingElement>(null);
  const play = useInView(titleRef, { once: true, margin: "0px 0px -8% 0px" });
  return (
    <section ref={ref} aria-labelledby="trust-title" className="relative isolate overflow-hidden bg-(--bl-bg) px-6 py-16 sm:px-10 sm:py-20">
      <div className="relative z-20 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <Inview from={{ opacity: 0, scale: 0.9 }} to={{ opacity: 1, scale: 1 }} config={[220, 22]} className="grid size-28 place-items-center rounded-(--bl-r-pill) bg-(--bl-surface) text-center sm:size-32">
          <div>
            <p className="text-2xl font-medium">1 a 1</p>
            <p className="mx-auto max-w-[7em] text-[0.6rem] text-(--bl-soft)">Un mentor humano por proyecto</p>
          </div>
        </Inview>
        <Inview from={{ opacity: 0, y: 24 }} to={{ opacity: 1, y: 0 }} delayIn={120} as="article" className="flex max-w-md gap-4 rounded-(--bl-r-card) bg-(--bl-surface) p-5 sm:gap-5 sm:p-6">
          <span className="h-fit rounded-xl bg-(--bl-bg) px-4 py-2 text-xl font-medium">#01</span>
          <div>
            <h3 className="text-lg font-medium">La IA ordena, tú decides</h3>
            <p className="mt-1 text-xs leading-relaxed text-(--bl-soft)">
              Una sugerencia de IA no es validación. RAX ordena lo que sabes y tu mentor te ayuda a decidir con evidencia, no con intuiciones.
            </p>
          </div>
        </Inview>
      </div>

      <h2 ref={titleRef} id="trust-title" className="pointer-events-none relative z-0 mx-auto mt-12 max-w-[88rem] select-none text-[8.2vw] font-medium uppercase leading-[1.02] tracking-tight">
        <span className="sr-only">{s.headline.join(" ")}</span>
        <span aria-hidden className="flex justify-between">
          <GhostWord word={w1} from="-3%" to="3%" progress={progress} slide={i} play={play} />
          <GhostWord word={w2} from="3%" to="-3%" progress={progress} slide={i} play={play} />
        </span>
        <span aria-hidden className="flex justify-between">
          <GhostWord word={w3} ink from="-2%" to="4%" progress={progress} slide={i} play={play} />
          <GhostWord word={w4} from="4%" to="-3%" progress={progress} slide={i} play={play} />
        </span>
      </h2>

      <div className="relative z-10 mx-auto mt-10 w-52 sm:absolute sm:left-1/2 sm:top-1/2 sm:mt-0 sm:w-64 sm:-translate-x-1/2 sm:-translate-y-1/2">
        <Inview from={{ opacity: 0, y: 60, scale: 0.92 }} to={{ opacity: 1, y: 0, scale: 1 }} config={[170, 26]}>
          <figure className="relative aspect-[3/4] overflow-hidden rounded-(--bl-r-card) bg-(--bl-brand)" style={{ transform: "rotate(6deg)" }}>
            <AnimatePresence initial={false}>
              <motion.div key={i} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={spring(260, 26)}>
                <Image src={s.img} alt={s.alt} fill sizes="(min-width: 640px) 16rem, 13rem" className="object-cover object-left-top" />
              </motion.div>
            </AnimatePresence>
            <figcaption className="absolute inset-x-3 bottom-3 rounded-xl bg-(--bl-deep)/40 px-3 py-2 text-white backdrop-blur-md">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-[0.65rem] opacity-80">{s.role}</p>
            </figcaption>
          </figure>
        </Inview>
      </div>

      <div className="relative z-20 mt-12 flex items-center justify-between sm:mt-24">
        <ArrowButton dir="prev" variant="outline" label="Anterior" onClick={() => setI((v) => (v - 1 + n) % n)} />
        <CarouselDots count={n} active={i} onSelect={setI} label="Principios" />
        <ArrowButton dir="next" variant="solid" label="Siguiente" onClick={() => setI((v) => (v + 1) % n)} />
      </div>
    </section>
  );
}

/* ═════════════════════════════ 4) Cómo funciona (lista numerada) ═════════════════════════════ */

function StageRow({ s, i }: { s: (typeof STAGES)[number]; i: number }) {
  const hover = useHoverEnabled();
  return (
    <li className="border-t border-(--bl-hair) last:border-b">
      <motion.div initial="rest" animate="rest" whileHover={hover ? "hover" : undefined}>
        <AnchorLink href="#producto" className="block focus-visible:bg-(--bl-bg)">
          <Inview from={{ opacity: 0, y: 26 }} to={{ opacity: 1, y: 0 }} delayIn={i * 90} config={[190, 26]} className="flex items-center gap-6 py-7">
            <span className="w-10 shrink-0 text-sm font-medium text-(--bl-soft)">{String(s.n).padStart(2, "0")}</span>
            <span className="flex-1">
              <span className="block text-2xl font-medium tracking-tight sm:text-3xl">
                {s.label} <span className="text-(--bl-soft)">· {s.question}</span>
              </span>
              <span className="mt-1 block text-sm text-(--bl-soft)">{STAGE_COPY[s.id]}</span>
            </span>
            <motion.span
              className="grid size-11 shrink-0 place-items-center rounded-(--bl-r-pill) border border-(--bl-hair)"
              variants={{ rest: { x: 0, opacity: 0.55 }, hover: { x: 8, opacity: 1 } }}
              transition={spring(300, 20)}
            >
              <ArrowIcon className="size-5" />
            </motion.span>
          </Inview>
        </AnchorLink>
      </motion.div>
    </li>
  );
}

function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="programs-title" className="bg-(--bl-surface) px-6 py-24 sm:px-10">
      <Eyebrow>Cómo funciona</Eyebrow>
      <StackedLines id="programs-title" lines={["Cuatro etapas,", "una pregunta cada una"]} className={`mt-4 ${H2}`} />
      <ul className="mt-14">
        {STAGES.map((s, i) => (
          <StageRow key={s.id} s={s} i={i} />
        ))}
      </ul>
    </section>
  );
}

/* ═════════════════════════════ 5) Producto (estilo «facilities») ═════════════════════════════ */

function Tile({ t, i }: { t: (typeof COURT_TILES)[number]; i: number }) {
  const hover = useHoverEnabled();
  return (
    <Inview from={{ opacity: 0, y: 48 }} to={{ opacity: 1, y: 0 }} delayIn={i * 140} config={[180, 26]} className={`flex-1 ${i === 1 ? "mb-8" : ""}`}>
      <motion.figure className="relative aspect-[3/4] overflow-hidden rounded-(--bl-r-card) bg-(--bl-surface)" initial="rest" animate="rest" whileHover={hover ? "hover" : undefined}>
        <motion.div className="absolute inset-0" variants={{ rest: { scale: 1 }, hover: { scale: 1.03 } }} transition={spring(300, 22)}>
          <Image src={t.img} alt={t.alt} fill sizes="(min-width: 768px) 25vw, 50vw" className="object-cover object-left-top" />
        </motion.div>
        <figcaption className={`absolute inset-x-3 bottom-3 rounded-xl px-4 py-3 text-white backdrop-blur-md ${t.tone === "teal" ? "bg-(--bl-teal)/55" : "bg-(--bl-deep)/40"}`}>
          <p className="text-sm font-medium">{t.name}</p>
          <p className="text-[0.65rem] opacity-85">{t.desc}</p>
        </figcaption>
      </motion.figure>
    </Inview>
  );
}

function FeatureCard({ f, i }: { f: (typeof FEATURES)[number]; i: number }) {
  const hover = useHoverEnabled();
  return (
    <Inview as="li" from={{ opacity: 0, y: 40 }} to={{ opacity: 1, y: 0 }} delayIn={i * 120} config={[180, 26]}>
      <motion.article
        className="flex h-full flex-col rounded-(--bl-r-card) bg-(--bl-surface) p-7"
        initial="rest"
        animate="rest"
        whileHover={hover ? "hover" : undefined}
        variants={{ rest: { y: 0 }, hover: { y: -8 } }}
        transition={spring(300, 22)}
      >
        <Eyebrow>{f.eyebrow}</Eyebrow>
        <h3 className="mt-4 text-2xl font-medium tracking-tight">{f.title}</h3>
        <ul className="mt-6 space-y-2 border-t border-(--bl-hair) pt-4 text-sm text-(--bl-soft)">
          {f.points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="mt-[0.45em] size-1.5 shrink-0 rounded-(--bl-r-pill) bg-(--bl-brand)" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
      </motion.article>
    </Inview>
  );
}

function Product() {
  return (
    <section id="producto" aria-labelledby="facilities-title" className="relative -mt-10 rounded-(--bl-r-card-lg) bg-(--bl-bg) px-6 pb-20 pt-16 sm:px-10">
      <div className="grid items-end gap-10 md:grid-cols-2">
        <div className="max-w-sm">
          <Inview from={{ opacity: 0, scale: 0.85 }} to={{ opacity: 1, scale: 1 }} config={[240, 20]} className="relative size-16 overflow-hidden rounded-(--bl-r-card) bg-(--bl-surface)">
            <Image src="/landing/asistente.webp" alt="Asistente de RAX" fill sizes="64px" className="object-cover object-left-top" />
          </Inview>
          <StackedLines id="facilities-title" lines={["Todo tu", "proceso en", "un lugar"]} stagger={120} className={`mt-6 ${H2}`} />
          <FadeWords
            className="mt-6 max-w-xs text-sm text-(--bl-soft)"
            text="La IA hace el trabajo de ordenar y resumir. Las personas ponen el criterio: tu mentor revisa, agenda sesiones y decide contigo."
          />
        </div>
        <div className="flex items-end gap-5">
          {COURT_TILES.map((t, i) => (
            <Tile key={t.name} t={t} i={i} />
          ))}
        </div>
      </div>
      <ul className="mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} f={f} i={i} />
        ))}
      </ul>
    </section>
  );
}

/* ═════════════════════════════ Video ═════════════════════════════ */

function Video() {
  return (
    <section id="video" aria-labelledby="video-title" className="mt-3 rounded-(--bl-r-card-lg) bg-(--bl-surface) px-6 py-20 sm:px-10 sm:py-24">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow>Video · 1 minuto</Eyebrow>
          <StackedLines id="video-title" lines={["Así se usa", "RAX"]} className={`mt-4 ${H2}`} />
        </div>
        <p className="max-w-sm text-sm text-(--bl-soft)">Del proyecto a la decisión: etapas, asistente IA, sesiones con tu mentor, llamadas con transcripción y notas.</p>
      </div>
      <Inview from={{ opacity: 0, y: 40 }} to={{ opacity: 1, y: 0 }} config={[180, 26]} className="mt-12 overflow-hidden rounded-(--bl-r-card) bg-(--bl-deep)">
        <video className="block aspect-video w-full" src="/promo/rax-promo.mp4" poster="/promo/poster.jpg" controls playsInline preload="none">
          Tu navegador no puede reproducir este video. <a href="/promo/rax-promo.mp4">Descárgalo aquí</a>.
        </video>
      </Inview>
    </section>
  );
}

/* ═════════════════════════════ 6) Cifras ═════════════════════════════ */

function Stats() {
  return (
    <section aria-labelledby="stats-title" className="mt-3 rounded-(--bl-r-card-lg) bg-(--bl-deep) px-6 py-20 text-white sm:px-10">
      <Eyebrow tone="light">RAX en cifras</Eyebrow>
      <StackedLines id="stats-title" lines={["Un proceso", "con método"]} className={`mt-4 ${H2}`} />
      <dl className="mt-16 grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-4">
        {STATS.map(([v, l], i) => (
          <Inview key={l} from={{ opacity: 0, y: 30 }} to={{ opacity: 1, y: 0 }} delayIn={i * 110} config={[180, 24]} className="border-t border-white/20 pt-5">
            <dt className="sr-only">{l}</dt>
            <dd>
              <span className="block text-6xl font-medium tracking-tight sm:text-7xl">{v}</span>
              <span className="mt-3 block text-sm text-white/65">{l}</span>
            </dd>
          </Inview>
        ))}
      </dl>
    </section>
  );
}

/* ═════════════════════════════ 7) Para quién (estilo testimonios) ═════════════════════════════ */

function AudienceCard({ a, i }: { a: (typeof AUDIENCES)[number]; i: number }) {
  const hover = useHoverEnabled();
  return (
    <Inview as="li" from={{ opacity: 0, y: 40 }} to={{ opacity: 1, y: 0 }} delayIn={i * 120} config={[180, 26]}>
      <motion.figure
        className="flex h-full flex-col justify-between rounded-(--bl-r-card) bg-(--bl-surface) p-7"
        initial="rest"
        animate="rest"
        whileHover={hover ? "hover" : undefined}
        variants={{ rest: { y: 0 }, hover: { y: -8 } }}
        transition={spring(300, 22)}
      >
        <div>
          <svg viewBox="0 0 24 24" className="size-9 text-(--bl-brand)" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={a.icon} />
          </svg>
          <blockquote className="mt-4 text-lg leading-relaxed text-(--bl-ink)">{a.body}</blockquote>
        </div>
        <figcaption className="mt-6 border-t border-(--bl-hair) pt-4">
          <p className="font-medium">{a.title}</p>
          <AnchorLink href={a.cta.href} className="mt-1 inline-flex items-center gap-1.5 text-sm text-(--bl-soft) hover:text-(--bl-ink)">
            {a.cta.label} <ArrowIcon className="size-3.5" />
          </AnchorLink>
        </figcaption>
      </motion.figure>
    </Inview>
  );
}

function Audiences() {
  return (
    <section id="para-quien" aria-labelledby="testimonials-title" className="bg-(--bl-bg) px-6 py-20 sm:px-10 sm:py-24">
      <Eyebrow>Para quién</Eyebrow>
      <StackedLines id="testimonials-title" lines={["Para quien emprende", "y quien acompaña"]} className={`mt-4 ${H2}`} />
      <ul className="mt-14 grid gap-5 md:grid-cols-3">
        {AUDIENCES.map((a, i) => (
          <AudienceCard key={a.title} a={a} i={i} />
        ))}
      </ul>
    </section>
  );
}

/* ═════════════════════════════ Preguntas ═════════════════════════════ */

function Faq() {
  return (
    <section id="preguntas" aria-labelledby="faq-title" className="rounded-(--bl-r-card-lg) bg-(--bl-surface) px-6 py-20 sm:px-10 sm:py-24">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] [&>*]:min-w-0">
        <div>
          <Eyebrow>Preguntas frecuentes</Eyebrow>
          <StackedLines id="faq-title" lines={["Lo que suelen", "preguntarnos"]} className={`mt-4 ${H2}`} />
          <p className="mt-6 max-w-xs text-sm text-(--bl-soft)">¿Te queda alguna duda? Crea tu cuenta y pregúntale al asistente: conoce la plataforma.</p>
        </div>
        <ul>
          {FAQ.map((f, i) => (
            <Inview as="li" key={f.q} from={{ opacity: 0, y: 26 }} to={{ opacity: 1, y: 0 }} delayIn={i * 90} config={[190, 26]} className="border-t border-(--bl-hair) last:border-b">
              <details className="group py-6 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center gap-6 text-xl font-medium tracking-tight">
                  <span className="w-10 shrink-0 text-sm text-(--bl-soft)">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1">{f.q}</span>
                  <span className="grid size-11 shrink-0 place-items-center rounded-(--bl-r-pill) border border-(--bl-hair) text-lg transition-transform duration-300 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 pl-16 pr-4 text-sm sm:pr-16 leading-relaxed text-(--bl-soft)">{f.a}</p>
              </details>
            </Inview>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ═════════════════════════════ 8) Pie ═════════════════════════════ */

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <nav aria-label={title}>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">{title}</p>
      <ul className="mt-4 space-y-3 text-sm text-white/80">
        {links.map(([label, href]) => (
          <li key={label}>
            <AnchorLink href={href} className="hover:text-white">
              {label}
            </AnchorLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SiteFooter() {
  const { openStart } = useLanding();
  return (
    <footer id="contacto" className="mt-3 rounded-(--bl-r-card-lg) bg-(--bl-deep) px-6 py-14 text-white sm:px-10 sm:py-16">
      <div className="flex flex-col gap-8 border-b border-white/15 pb-14 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Eyebrow tone="light">Empieza hoy</Eyebrow>
          <StackedLines as="p" lines={["¿Listo para", "empezar?"]} className="mt-4 text-6xl font-medium uppercase leading-[0.92] tracking-tight" />
        </div>
        <Inview from={{ opacity: 0, y: 20 }} to={{ opacity: 1, y: 0 }} delayIn={150} config={[200, 24]}>
          <PillButton variant="light" onClick={openStart}>
            Crear cuenta
          </PillButton>
        </Inview>
      </div>

      <div className="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <p className="flex items-center gap-2 text-lg font-medium uppercase tracking-[0.2em]">
            <RaxMark />
            RAX
          </p>
          <p className="mt-4 text-sm text-white/65">Diagnóstico, mentoría y validación de emprendimientos. IA para ordenar, personas para decidir.</p>
        </div>
        <FooterCol title="Producto" links={[["Cómo funciona", "#como-funciona"], ["Producto", "#producto"], ["Video", "#video"], ["Preguntas", "#preguntas"]]} />
        <FooterCol title="Para quién" links={[["Emprendedores", "#para-quien"], ["Mentores", "#para-quien"], ["Programas", "#para-quien"]]} />
        <FooterCol title="Cuenta" links={[["Entrar", "/entrar"], ["Crear cuenta", "/entrar?modo=registro"], ["Ser mentor", "/entrar?modo=registro"]]} />
      </div>

      <div className="flex flex-col gap-5 border-t border-white/15 pt-8 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} RAX. Hecho para emprender con evidencia.</p>
        <nav aria-label="Cuenta" className="flex gap-5">
          <Link href="/entrar" className="hover:text-white">
            Entrar
          </Link>
          <Link href="/entrar?modo=registro" className="hover:text-white">
            Crear cuenta
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/* ═════════════════════════════ Página ═════════════════════════════ */

export function LandingSections() {
  return (
    <>
      <Hero />
      <Principles />
      <HowItWorks />
      <Product />
      <Video />
      <Stats />
      <Audiences />
      <Faq />
      <SiteFooter />
    </>
  );
}
