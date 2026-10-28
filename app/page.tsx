import Link from "next/link";

const STAGES = [
  { n: "01", title: "Contá", hi: "tu idea.", body: "Conversás con RAX con tus palabras. Una pregunta a la vez. «No sé» también es una respuesta válida." },
  { n: "02", title: "Ordená", hi: "lo que sabés.", body: "Cada cosa que decís se convierte en una tarjeta: qué es un hecho, qué es un supuesto y qué falta saber." },
  { n: "03", title: "Corregí", hi: "la lectura.", body: "Confirmás, corregís o rechazás lo que la IA interpretó. Tu corrección manda y queda en el historial." },
  { n: "04", title: "Sumá", hi: "un mentor.", body: "Antes de armar un plan, una persona con criterio revisa el contexto y ayuda a decidir qué investigar." },
  { n: "05", title: "Probá", hi: "en pequeño.", body: "Convertís la duda principal en una hipótesis y un experimento con criterios definidos antes de empezar." },
  { n: "06", title: "Decidí", hi: "con evidencia.", body: "Con resultados en la mano, decidís con tu mentor: continuar, reformular, profundizar, pausar o descartar." },
];

const PRINCIPLES = [
  ["La incertidumbre", "es información."],
  ["La claridad", "precede a la solución."],
  ["Una sugerencia de IA", "no es validación."],
];

export default function Home() {
  return (
    <div className="ambient min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="display text-2xl tracking-wide" aria-label="RAX, inicio">
            <span className="text-accent">R</span>AX
          </Link>
          <nav aria-label="Secciones" className="hidden gap-8 text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-muted md:flex">
            <a href="#recorrido" className="hover:text-ink">Recorrido</a>
            <a href="#principios" className="hover:text-ink">Principios</a>
          </nav>
          <Link href="/entrar" className="inline-flex h-10 items-center rounded-full bg-accent px-5 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-accent-strong">
            Entrar
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden className="led-lines pointer-events-none absolute inset-x-0 top-0 h-full opacity-60" />
          <Beams />
          <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-24 sm:px-6 sm:pt-32">
            <p className="eyebrow flex items-center gap-3">
              Diagnóstico · Mentoría · Validación
            </p>
            <h1 className="display mt-6 text-[clamp(3.25rem,10vw,8.5rem)]">
              Tu idea,
              <br />
              <span className="text-highlight">en orden.</span>
              <br />
              Tus dudas,
              <br />
              <span className="text-highlight">en pruebas.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg text-muted">
              RAX combina inteligencia artificial y mentoría humana para que entiendas tu negocio, separes hechos de supuestos y conviertas lo que no sabés en experimentos pequeños y medibles.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link href="/entrar?modo=registro" className="inline-flex h-12 items-center rounded-full bg-accent px-7 text-sm font-semibold uppercase tracking-[0.08em] text-white shadow-[0_10px_40px_-10px_rgb(255_74_28/0.8)] hover:bg-accent-strong">
                Crear mi cuenta
              </Link>
              <a href="#recorrido" className="text-sm font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink">
                Ver el recorrido ↓
              </a>
            </div>
          </div>
        </section>

        <section id="recorrido" aria-labelledby="recorrido-title" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 id="recorrido-title" className="display text-[clamp(2.5rem,6vw,5rem)]">
              De la idea <span className="text-highlight">a la decisión.</span>
            </h2>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STAGES.map((s) => (
                <li key={s.n} className="group rounded-2xl border border-line bg-panel p-6 transition-colors hover:border-accent/50">
                  <p className="font-mono text-xs text-muted">
                    {s.n} <span className="text-faint">/ 06</span>
                  </p>
                  <div className="mt-3 h-[3px] w-10 rounded bg-accent transition-all group-hover:w-20" />
                  <h3 className="display mt-5 text-4xl">
                    {s.title} <span className="text-highlight">{s.hi}</span>
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="principios" aria-labelledby="principios-title" className="border-t border-line bg-panel/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <h2 id="principios-title" className="eyebrow">Principios</h2>
            <ul className="mt-6 space-y-2">
              {PRINCIPLES.map(([a, b]) => (
                <li key={a} className="display text-[clamp(2rem,5.5vw,4.5rem)]">
                  {a} <span className="text-highlight">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-muted sm:px-6">
          <p>¿Querés acompañar como mentor/a? Creá tu cuenta y elegilo en la bienvenida.</p>
          <Link href="/entrar?modo=registro" className="inline-flex h-9 items-center rounded-full bg-accent px-4 font-semibold uppercase tracking-[0.08em] text-white hover:bg-accent-strong">
            Empezar
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** Haz de luces del techo, como en la landing de referencia. Decorativo. */
function Beams() {
  return (
    <svg aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2 opacity-70" viewBox="0 0 900 420" fill="none">
      <defs>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[-220, -140, -60, 60, 140, 220].map((dx, i) => (
        <line key={i} x1={450 + dx * 0.25} y1={0} x2={450 + dx * 1.6} y2={240} stroke="url(#beam)" strokeWidth={3} strokeLinecap="round" />
      ))}
    </svg>
  );
}
