import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { STAGES } from "@/features/projects/stages";
import { Float, Reveal } from "@/features/landing/reveal";

/**
 * Landing pública de RAX. Mismo sistema visual que la app (lienzo claro, navy de la barra lateral,
 * acento azul, Inter) para que la promesa y el producto se vean iguales. Copy en tú.
 */

const STAGE_COPY: Record<string, string> = {
  entender: "Conversas con el asistente y separas lo que es un hecho, lo que es un supuesto y lo que todavía no sabes.",
  orientar: "Tu mentor revisa el contexto y te ayuda a decidir qué conviene investigar primero.",
  probar: "Conviertes la duda principal en una hipótesis y un experimento pequeño, con el criterio de éxito definido antes de empezar.",
  decidir: "Con resultados en la mano decides con tu mentor: continuar, reformular, profundizar, pausar o descartar.",
};

const FEATURES = [
  {
    eyebrow: "Asistente IA",
    title: "Un asistente que pregunta antes de opinar.",
    body: "Conversas con tus palabras, una pregunta a la vez. RAX ordena lo que dices en tarjetas y tú confirmas o corriges cada interpretación.",
    points: ["«No sé» también es una respuesta válida", "Separa hechos, supuestos y dudas abiertas", "Redacta resúmenes y documentos en PDF o Word"],
    img: "/landing/asistente.webp",
    alt: "Chat del asistente de RAX clasificando un hecho, un supuesto y una duda",
  },
  {
    eyebrow: "Mentoría",
    title: "Un mentor de verdad, con todo el contexto.",
    body: "Tu mentor ve en su bandeja qué proyectos lo necesitan y llega a cada sesión sabiendo en qué estás, sin que tengas que explicarlo todo de nuevo.",
    points: ["Bandeja con lo que necesita su revisión", "Sesiones agendadas dentro del proyecto", "Aprueba hipótesis y resultados contigo"],
    img: "/landing/mentor.webp",
    alt: "Bandeja del mentor con proyectos pendientes y una sesión agendada",
  },
  {
    eyebrow: "Sesiones",
    title: "Llamadas con transcripción automática.",
    body: "Hablas con tu mentor por videollamada sin salir de RAX. La conversación se transcribe sola y queda guardada en el proyecto.",
    points: ["Videollamada integrada", "Transcripción con IA por persona", "Todo queda en el historial del proyecto"],
    img: "/landing/llamada.webp",
    alt: "Videollamada entre emprendedora y mentora con transcripción en vivo",
  },
  {
    eyebrow: "Notas",
    title: "Notas que se convierten en acción.",
    body: "La IA resume cada sesión en acuerdos, experimentos y tareas. Puedes responder a las notas, y el asistente las tiene en cuenta para guiarte.",
    points: ["Acuerdos, experimentos y tareas separados", "Respuestas en hilo con tu mentor", "El asistente recuerda lo acordado"],
    img: "/landing/notas.webp",
    alt: "Notas de sesión generadas con IA, separadas en acuerdos, experimento y tareas",
  },
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

const PRINCIPLES = [
  ["La incertidumbre", "es información."],
  ["La claridad", "precede a la solución."],
  ["Una sugerencia de IA", "no es validación."],
];

const FAQ = [
  {
    q: "¿Necesito tener la idea clara para empezar?",
    a: "No. RAX está pensado para ideas en etapa temprana. Empiezas contando lo que tienes, aunque sea poco, y el asistente te ayuda a ordenarlo. «No sé» también es una respuesta válida.",
  },
  {
    q: "¿La IA decide por mí?",
    a: "No. La IA ordena y sugiere, pero tú confirmas o corriges cada interpretación y las decisiones importantes las tomas con tu mentor. Una sugerencia de IA no es validación.",
  },
  {
    q: "¿Cómo se asigna mi mentor?",
    a: "Un administrador del programa asigna un mentor a tu proyecto. Mientras tanto puedes avanzar en la etapa Entender con el asistente.",
  },
  {
    q: "¿Puedo ser mentor?",
    a: "Sí. Crea tu cuenta y elige «Mentor» en la bienvenida. Un administrador revisa tu postulación y, al aprobarla, empiezas a recibir proyectos.",
  },
  {
    q: "¿Qué pasa con las llamadas y las notas?",
    a: "Las transcripciones y notas quedan guardadas dentro del proyecto para que tú y tu mentor puedan volver a ellas cuando lo necesiten.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-[#f8fafc] text-slate-900">
      <SiteHeader />

      <main>
        <Hero />
        <Principles />
        <VideoSection />
        <HowItWorks />
        <Features />
        <Audiences />
        <Faq />
        <FinalCta />
      </main>

      <SiteFooter />
    </div>
  );
}

/* ───────────────────────────── Encabezado ───────────────────────────── */

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Secciones" className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
          <a href="#como-funciona" className="hover:text-slate-900">Cómo funciona</a>
          <a href="#producto" className="hover:text-slate-900">Producto</a>
          <a href="#para-quien" className="hover:text-slate-900">Para quién</a>
          <a href="#preguntas" className="hover:text-slate-900">Preguntas</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/entrar" className="hidden h-10 items-center rounded-full px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:inline-flex">
            Entrar
          </Link>
          <Link href="/entrar?modo=registro" className="inline-flex h-10 items-center rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 sm:px-5">
            Crear cuenta
          </Link>
        </div>
      </div>
    </header>
  );
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" aria-label="RAX, inicio" className={`text-2xl font-black tracking-tight ${light ? "text-white" : "text-slate-900"}`}>
      <span className={light ? "text-blue-400" : "text-blue-600"}>R</span>AX
    </Link>
  );
}

/* ───────────────────────────── Hero ───────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-blue-400/20 blur-[120px]" />
        <div className="absolute -right-40 top-40 h-[520px] w-[520px] rounded-full bg-sky-300/25 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: "linear-gradient(rgb(15 23 42 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(15 23 42 / 0.05) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 50% 30%, black 30%, transparent 75%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
            IA + mentoría humana para emprendedores
          </p>
          <h1 className="display mt-6 text-balance text-[clamp(2.4rem,7vw,5rem)] text-slate-900">
            <span className="sm:whitespace-nowrap">Tu idea, <span className="text-blue-600">en orden.</span></span>{" "}
            <span className="sm:whitespace-nowrap">Tus dudas, <span className="text-blue-600">en pruebas.</span></span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-slate-600 sm:text-xl">
            RAX te acompaña desde la primera idea hasta una decisión con evidencia: un asistente que ordena lo que sabes, un mentor que te orienta y
            experimentos pequeños para comprobar lo que supones.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/entrar?modo=registro"
              className="inline-flex h-12 items-center rounded-full bg-blue-600 px-7 text-[15px] font-semibold text-white shadow-[0_12px_32px_-12px_rgb(37_99_235/0.7)] hover:bg-blue-700"
            >
              Crear mi cuenta
            </Link>
            <a
              href="#video"
              className="inline-flex h-12 items-center gap-2.5 rounded-full border border-slate-300 bg-white px-6 text-[15px] font-semibold text-slate-800 hover:border-slate-400"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                <svg viewBox="0 0 24 24" className="ml-0.5 h-3 w-3" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              Ver video · 1 min
            </a>
          </div>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
            {["Una pregunta a la vez", "Mentor humano en el proceso", "Decisiones con evidencia"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check />
                {t}
              </li>
            ))}
          </ul>
        </Reveal>

        <div className="relative mx-auto mt-16 max-w-5xl">
          <Reveal delay={0.15} y={48}>
            <Screenshot src="/landing/asistente.webp" alt="El asistente de RAX ordenando una idea en hechos, supuestos y dudas" priority />
          </Reveal>
          <Float delay={0.9} className="absolute -left-6 top-[22%] hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xl md:block lg:-left-14">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Etapa actual</p>
            <div className="mt-2 flex items-center gap-1.5">
              {STAGES.map((s, i) => (
                <span key={s.id} className={`h-1.5 w-9 rounded-full ${i === 0 ? "bg-blue-600" : "bg-slate-200"}`} />
              ))}
            </div>
            <p className="mt-2 text-sm font-bold text-slate-900">1 · Entender</p>
            <p className="text-xs text-slate-500">¿Qué sé, qué supongo y qué me falta?</p>
          </Float>
          <Float delay={1.2} className="absolute -bottom-8 -right-4 hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl md:flex lg:-right-12">
            <div className="flex h-12 w-12 flex-col items-center justify-center rounded-xl bg-blue-50">
              <span className="text-[10px] font-bold uppercase text-blue-600">Jue</span>
              <span className="text-lg font-black leading-none text-slate-900">14</span>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Sesión con tu mentora</p>
              <p className="text-xs text-slate-500">10:00 · con transcripción</p>
            </div>
          </Float>
        </div>
      </div>
    </section>
  );
}

function Screenshot({ src, alt, priority }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_40px_100px_-30px_rgb(15_23_42/0.35)]">
      <Image src={src} alt={alt} width={2240} height={1520} priority={priority} sizes="(min-width: 1024px) 1024px, 100vw" className="block h-auto w-full" />
    </div>
  );
}

function Check({ className = "text-blue-600" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* ───────────────────────────── Principios ───────────────────────────── */

function Principles() {
  return (
    <section aria-label="Principios" className="border-y border-slate-200 bg-white">
      <ul className="mx-auto grid max-w-6xl divide-y divide-slate-200 px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0">
        {PRINCIPLES.map(([a, b], i) => (
          <li key={a} className="py-6 md:px-8 md:py-8 md:first:pl-0 md:last:pr-0">
            <Reveal delay={i * 0.08}>
              <p className="text-lg font-bold tracking-tight text-slate-900">
                {a} <span className="text-blue-600">{b}</span>
              </p>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────────── Video ───────────────────────────── */

function VideoSection() {
  return (
    <section id="video" aria-labelledby="video-title" className="scroll-mt-16">
      <div className="mx-auto max-w-5xl px-4 py-24 sm:px-6">
        <SectionHead
          id="video-title"
          eyebrow="Video · 1 minuto"
          title={
            <>
              Así se usa <span className="text-blue-600">RAX.</span>
            </>
          }
          body="Del proyecto a la decisión: etapas, asistente IA, sesiones con tu mentor, llamadas con transcripción y notas."
          center
        />
        <Reveal delay={0.1} className="mt-12">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-[0_40px_120px_-30px_rgb(37_99_235/0.4)]">
            <video className="block aspect-video w-full" src="/promo/rax-promo.mp4" poster="/promo/poster.jpg" controls playsInline preload="none">
              Tu navegador no puede reproducir este video. <a href="/promo/rax-promo.mp4">Descárgalo aquí</a>.
            </video>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SectionHead({ id, eyebrow, title, body, center }: { id: string; eyebrow: string; title: ReactNode; body?: string; center?: boolean }) {
  return (
    <Reveal className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-sm font-semibold text-blue-600">{eyebrow}</p>
      <h2 id={id} className="display mt-3 text-balance text-[clamp(2rem,4.4vw,3.25rem)] text-slate-900">
        {title}
      </h2>
      {body && <p className="mt-4 text-lg leading-relaxed text-slate-600">{body}</p>}
    </Reveal>
  );
}

/* ───────────────────────────── Cómo funciona ───────────────────────────── */

function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="como-title" className="scroll-mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHead
          id="como-title"
          eyebrow="Cómo funciona"
          title={
            <>
              Cuatro etapas, <span className="text-blue-600">una pregunta cada una.</span>
            </>
          }
          body="Tu proyecto avanza por el mismo recorrido de principio a fin. Siempre sabes en qué etapa estás, a quién le toca y qué sigue."
        />
        <ol className="relative mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div aria-hidden className="absolute left-0 right-0 top-[27px] hidden h-px bg-gradient-to-r from-blue-600 via-blue-300 to-slate-200 lg:block" />
          {STAGES.map((s, i) => (
            <li key={s.id} className="relative">
              <Reveal delay={i * 0.1}>
                <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-xl font-black text-white shadow-[0_10px_30px_-10px_rgb(37_99_235/0.8)]">
                  {s.n}
                </span>
                <h3 className="mt-6 text-xl font-bold tracking-tight text-slate-900">{s.label}</h3>
                <p className="mt-1 font-semibold text-blue-700">{s.question}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{STAGE_COPY[s.id]}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────────────────────── Producto ───────────────────────────── */

function Features() {
  return (
    <section id="producto" aria-labelledby="producto-title" className="scroll-mt-16 border-t border-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHead
          id="producto-title"
          eyebrow="Producto"
          title={
            <>
              Todo tu proceso, <span className="text-blue-600">en un solo lugar.</span>
            </>
          }
          body="La IA hace el trabajo de ordenar y resumir. Las personas ponen el criterio."
          center
        />
        <div className="mt-20 space-y-24 lg:space-y-32">
          {FEATURES.map((f, i) => (
            <article key={f.title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <Reveal className={i % 2 ? "lg:order-2" : ""}>
                <p className="text-sm font-semibold text-blue-600">{f.eyebrow}</p>
                <h3 className="display mt-3 text-balance text-[clamp(1.75rem,3.2vw,2.5rem)] text-slate-900">{f.title}</h3>
                <p className="mt-4 text-lg leading-relaxed text-slate-600">{f.body}</p>
                <ul className="mt-6 space-y-3">
                  {f.points.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-[15px] text-slate-700">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50">
                        <Check className="h-3 w-3 text-blue-600" />
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={0.1} y={40} className={i % 2 ? "lg:order-1" : ""}>
                <Screenshot src={f.img} alt={f.alt} />
              </Reveal>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── Para quién ───────────────────────────── */

function Audiences() {
  return (
    <section id="para-quien" aria-labelledby="quien-title" className="scroll-mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <SectionHead
          id="quien-title"
          eyebrow="Para quién"
          title={
            <>
              Hecho para quien emprende <span className="text-blue-600">y para quien acompaña.</span>
            </>
          }
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {AUDIENCES.map((a, i) => (
            <Reveal key={a.title} delay={i * 0.1} className="h-full">
              <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-[#f8fafc] p-7 transition-colors hover:border-blue-300">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={a.icon} />
                  </svg>
                </span>
                <h3 className="mt-5 text-xl font-bold tracking-tight text-slate-900">{a.title}</h3>
                <p className="mt-2 flex-1 text-[15px] leading-relaxed text-slate-600">{a.body}</p>
                <Link href={a.cta.href} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800">
                  {a.cta.label} <span aria-hidden>→</span>
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── Preguntas ───────────────────────────── */

function Faq() {
  return (
    <section id="preguntas" aria-labelledby="faq-title" className="scroll-mt-16 border-t border-slate-200">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
        <SectionHead id="faq-title" eyebrow="Preguntas frecuentes" title="Lo que suelen preguntarnos." body="¿Te queda alguna duda? Crea tu cuenta y pregúntale al asistente: conoce la plataforma." />
        <Reveal delay={0.1}>
          <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[17px] font-semibold text-slate-900">
                  {f.q}
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ───────────────────────────── Cierre ───────────────────────────── */

function FinalCta() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] bg-[#0b132b] px-6 py-16 text-center sm:px-12 sm:py-20">
          <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-[380px] w-[680px] -translate-x-1/2 rounded-full bg-blue-600/35 blur-[110px]" />
          <h2 className="display relative mx-auto text-balance max-w-3xl text-[clamp(2rem,4.6vw,3.5rem)] text-white">
            Empieza hoy, <span className="text-blue-400">con tu idea tal como está.</span>
          </h2>
          <p className="relative mx-auto mt-5 max-w-xl text-lg text-slate-300">
            Entiende tu idea, prueba en pequeño y decide con evidencia, acompañado por una persona con criterio.
          </p>
          <div className="relative mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/entrar?modo=registro" className="inline-flex h-12 items-center rounded-full bg-blue-600 px-7 text-[15px] font-semibold text-white hover:bg-blue-500">
              Crear mi cuenta
            </Link>
            <Link href="/entrar" className="inline-flex h-12 items-center rounded-full border border-white/20 px-7 text-[15px] font-semibold text-white hover:border-white/40">
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-500">Diagnóstico, mentoría y validación de emprendimientos. IA para ordenar, personas para decidir.</p>
        </div>
        <FooterCol title="Producto" links={[["Cómo funciona", "#como-funciona"], ["Video", "#video"], ["Para quién", "#para-quien"], ["Preguntas", "#preguntas"]]} />
        <FooterCol title="Cuenta" links={[["Entrar", "/entrar"], ["Crear cuenta", "/entrar?modo=registro"], ["Ser mentor", "/entrar?modo=registro"]]} />
      </div>
      <div className="border-t border-slate-200">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500 sm:px-6">© {new Date().getFullYear()} RAX. Hecho para emprender con evidencia.</p>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map(([label, href]) => (
          <li key={label}>
            <Link href={href} className="text-sm text-slate-500 hover:text-slate-900">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
