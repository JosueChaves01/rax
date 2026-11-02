"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { STAGES } from "@/features/projects/stages";
import { AppFrame, Avatar, CanvasHeader, EASE, FakeCursor, Pill, Typed, TypingDots } from "./mock-ui";

/** Colores de los tipos de información, iguales a los tokens info-* de globals.css. */
const INFO = { fact: "#047857", assumption: "#c2410c", unknown: "#475569", ai: "#1d4ed8", decision: "#6d28d9" };

/** Devuelve true después de `ms` milisegundos. Sirve para cambiar estados dentro de una escena. */
function useAfter(ms: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return on;
}

/** Cuenta de 0 a n, un paso cada `every` ms, empezando en `delay`. */
function useStep(n: number, every: number, delay = 0) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let k = 1; k <= n; k++) timers.push(setTimeout(() => setI(k), delay + every * (k - 1)));
    return () => timers.forEach(clearTimeout);
  }, [n, every, delay]);
  return i;
}

/** Columna de texto a la izquierda de cada paso. */
function Caption({ step, title, hi, body }: { step: number; title: string; hi: string; body: string }) {
  return (
    <div className="w-[560px] shrink-0">
      <motion.p
        className="font-mono text-[15px] uppercase tracking-[0.2em] text-blue-600"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        Paso {step} <span className="text-slate-400">/ 06</span>
      </motion.p>
      <motion.div
        className="mt-5 h-[4px] rounded bg-blue-600"
        initial={{ width: 0 }}
        animate={{ width: 64 }}
        transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
      />
      <motion.h2
        className="display mt-7 text-[76px] text-slate-900"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
      >
        {title}
        <br />
        <span className="text-blue-600">{hi}</span>
      </motion.h2>
      <motion.p
        className="mt-7 max-w-[500px] text-[24px] leading-relaxed text-slate-500"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.8, delay: 0.35, ease: EASE }}
      >
        {body}
      </motion.p>
    </div>
  );
}

function Split({ caption, children }: { caption: ReactNode; children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-between gap-12 px-[100px] pb-[40px]">
      {caption}
      {children}
    </div>
  );
}

/* ───────────────────────────── 0 · Intro ───────────────────────────── */

export function IntroScene() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
      <motion.p
        className="font-mono text-[18px] uppercase tracking-[0.3em] text-slate-500"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
      >
        Diagnóstico · Mentoría · Validación
      </motion.p>
      <div className="mt-8 flex text-[260px] font-black leading-none tracking-tight text-slate-900">
        {["R", "A", "X"].map((c, i) => (
          <motion.span
            key={c}
            className={i === 0 ? "text-blue-600" : ""}
            initial={{ opacity: 0, y: 120, rotateX: -80 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.4 + i * 0.12 }}
          >
            {c}
          </motion.span>
        ))}
      </div>
      <motion.h1
        className="display mt-6 text-[64px] text-slate-900"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 1.2, ease: EASE }}
      >
        Tu idea, <span className="text-blue-600">en orden.</span> Tus dudas, <span className="text-blue-600">en pruebas.</span>
      </motion.h1>
      <motion.p
        className="mt-10 inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-6 py-3 text-[20px] font-semibold text-slate-600 shadow-sm"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 2.1, ease: EASE }}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
        Cómo usar RAX en un minuto
      </motion.p>
    </div>
  );
}

/* ───────────────────────────── 1 · Proyecto ───────────────────────────── */

export function ProjectScene() {
  const formOpen = useAfter(1500);
  const created = useAfter(4600);
  return (
    <Split
      caption={
        <Caption step={1} title="Crea tu" hi="proyecto." body="Cuéntale a RAX tu idea con tus palabras. Todo tu trabajo queda ordenado dentro de un proyecto." />
      }
    >
      <AppFrame active="Mis proyectos">
        <CanvasHeader
          eyebrow="Inicio"
          title="Mis proyectos"
          right={
            <motion.span
              className="inline-flex h-10 items-center rounded-full bg-blue-600 px-5 text-xs font-semibold uppercase tracking-[0.08em] text-white"
              animate={formOpen ? { scale: 1 } : { scale: [1, 1.06, 1] }}
              transition={{ duration: 1, repeat: formOpen ? 0 : Infinity }}
            >
              + Nuevo proyecto
            </motion.span>
          }
        />
        <div className="p-8">
          <AnimatePresence mode="wait">
            {!created ? (
              formOpen ? (
                <motion.div
                  key="form"
                  className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.5, ease: EASE }}
                >
                  <p className="text-[13px] font-semibold text-slate-700">¿Cómo se llama tu idea?</p>
                  <div className="mt-2 rounded-xl border-2 border-blue-500 bg-white px-4 py-3 text-[17px] text-slate-900">
                    <Typed text="Café de especialidad a domicilio" delay={200} speed={35} />
                  </div>
                  <p className="mt-5 text-[13px] font-semibold text-slate-700">Cuéntala en una frase</p>
                  <div className="mt-2 min-h-[72px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-600">
                    <Typed text="Suscripción mensual de café de tostadores locales para mi barrio." delay={1350} speed={16} />
                  </div>
                  <div className="mt-5 flex justify-end">
                    <span className="inline-flex h-10 items-center rounded-full bg-blue-600 px-6 text-xs font-semibold uppercase tracking-[0.08em] text-white">
                      Crear proyecto
                    </span>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="empty" exit={{ opacity: 0 }} className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
                  Todavía no tienes proyectos.
                </motion.div>
              )
            ) : (
              <motion.div
                key="card"
                className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
                initial={{ opacity: 0, y: 30, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 22 }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Proyecto</p>
                    <p className="mt-1 text-[24px] font-bold tracking-tight text-slate-900">Café de especialidad a domicilio</p>
                  </div>
                  <Pill color="#059669">● Te toca a ti</Pill>
                </div>
                <div className="mt-6 grid grid-cols-4 gap-3">
                  {STAGES.map((s, i) => (
                    <motion.div
                      key={s.id}
                      className={`rounded-xl border p-3 ${i === 0 ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                    >
                      <p className={`font-mono text-[10px] ${i === 0 ? "text-blue-600" : "text-slate-400"}`}>0{s.n}</p>
                      <p className={`text-[14px] font-bold ${i === 0 ? "text-blue-700" : "text-slate-500"}`}>{s.label}</p>
                    </motion.div>
                  ))}
                </div>
                <p className="mt-5 text-[14px] text-slate-500">Siguiente paso: conversar con el asistente para entender tu idea.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <FakeCursor
          path={[
            { x: 420, y: 500, t: 0 },
            { x: 760, y: 36, t: 1.2 },
            { x: 760, y: 36, t: 3.6 },
            { x: 725, y: 372, t: 4.3 },
          ]}
          clickAt={[1.25, 4.35]}
        />
      </AppFrame>
    </Split>
  );
}

/* ───────────────────────────── 2 · Etapas ───────────────────────────── */

export function StagesScene() {
  const reached = useStep(4, 1300, 1100);
  const cur = Math.max(0, reached - 1);
  return (
    <Split
      caption={
        <Caption
          step={2}
          title="Avanza en"
          hi="4 etapas."
          body="Entender, Orientar, Probar y Decidir. Cada etapa responde una pregunta y siempre sabes qué sigue."
        />
      }
    >
      <AppFrame active="Mis proyectos">
        <CanvasHeader eyebrow="Proyecto" title="Café de especialidad a domicilio" />
        <div className="p-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Recorrido</p>
            <div className="relative mt-6 flex justify-between">
              <div className="absolute left-[28px] right-[28px] top-[27px] h-[4px] rounded bg-slate-200" />
              <motion.div
                className="absolute left-[28px] top-[27px] h-[4px] rounded bg-blue-600"
                animate={{ width: `calc(${(cur / 3) * 100}% - ${(cur / 3) * 56}px)` }}
                transition={{ duration: 0.9, ease: EASE }}
              />
              {STAGES.map((s, i) => {
                const done = i < cur;
                const on = i === cur && reached > 0;
                return (
                  <div key={s.id} className="relative z-10 flex w-[150px] flex-col items-center">
                    <motion.div
                      className="flex h-[58px] w-[58px] items-center justify-center rounded-full border-4 text-[18px] font-black"
                      animate={{
                        backgroundColor: done ? "#2563eb" : on ? "#ffffff" : "#f8fafc",
                        borderColor: done || on ? "#2563eb" : "#e2e8f0",
                        color: done ? "#ffffff" : on ? "#2563eb" : "#94a3b8",
                        scale: on ? 1.12 : 1,
                      }}
                      transition={{ duration: 0.5 }}
                    >
                      {done ? "✓" : s.n}
                    </motion.div>
                    <p className={`mt-3 text-[16px] font-bold ${on ? "text-blue-700" : done ? "text-slate-800" : "text-slate-400"}`}>{s.label}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <AnimatePresence mode="wait">
            {reached > 0 && (
              <motion.div
                key={cur}
                className="mt-6 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-7"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blue-600">
                  Etapa {STAGES[cur].n} · {STAGES[cur].label}
                </p>
                <p className="mt-2 text-[30px] font-bold tracking-tight text-slate-900">{STAGES[cur].question}</p>
                <div className="mt-5 flex gap-2">
                  {STAGE_ACTIONS[cur].map((a, i) => (
                    <motion.span
                      key={a}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                      className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-[13px] font-semibold text-slate-600"
                    >
                      {a}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </AppFrame>
    </Split>
  );
}

const STAGE_ACTIONS = [
  ["Conversación", "Hechos y supuestos", "Resumen"],
  ["Revisión del mentor", "Prioridades"],
  ["Hipótesis", "Experimentos", "Resultados"],
  ["Revisión final", "Decisión con evidencia"],
];

/* ───────────────────────────── 3 · Asistente ───────────────────────────── */

export function AssistantScene() {
  const sent = useAfter(2300);
  const replied = useAfter(3600);
  const thinking = sent && !replied;
  const chips = useAfter(6300);
  const cards = [
    { kind: "Hecho", color: INFO.fact, text: "Tienes un tostador local que te vende grano." },
    { kind: "Supuesto", color: INFO.assumption, text: "Tus vecinos pagarían una suscripción mensual." },
    { kind: "Por saber", color: INFO.unknown, text: "¿Cuánto estarían dispuestos a pagar?" },
  ];
  return (
    <Split
      caption={
        <Caption
          step={3}
          title="Conversa con"
          hi="el asistente IA."
          body="Te hace una pregunta a la vez y separa lo que sabes de lo que supones. También redacta documentos en PDF o Word."
        />
      }
    >
      <AppFrame active="Asistente IA">
        <CanvasHeader eyebrow="Asistente IA" title="Café de especialidad · Entender" right={<Pill color={INFO.ai}>Con este proyecto</Pill>} />
        <div className="flex h-[692px] flex-col">
          <div className="flex-1 space-y-5 overflow-hidden p-8">
            <motion.div
              className="flex gap-3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Avatar initials="RAX" color="#1d4ed8" size={38} />
              <div className="max-w-[600px] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-5 py-3.5 text-[16px] text-slate-700 shadow-sm">
                ¿A quién le quieres vender y qué problema le resuelves?
              </div>
            </motion.div>

            {sent && (
              <motion.div className="flex justify-end" initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
                <div className="max-w-[560px] rounded-2xl rounded-tr-sm bg-blue-600 px-5 py-3.5 text-[16px] text-white shadow-sm">
                  A vecinos que toman café todos los días y no tienen tiempo de ir a una cafetería buena.
                </div>
              </motion.div>
            )}

            {thinking && (
              <motion.div className="flex items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Avatar initials="RAX" color="#1d4ed8" size={38} />
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
                  <TypingDots />
                </div>
              </motion.div>
            )}

            {replied && (
              <motion.div className="flex gap-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <Avatar initials="RAX" color="#1d4ed8" size={38} />
                <div className="max-w-[640px] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-5 py-4 text-[16px] text-slate-700 shadow-sm">
                  <p>Perfecto. Ordené lo que me contaste:</p>
                  <div className="mt-3 space-y-2">
                    {cards.map((c, i) => (
                      <motion.div
                        key={c.kind}
                        className="flex items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5"
                        style={{ borderColor: `color-mix(in srgb, ${c.color} 30%, transparent)` }}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + i * 0.45, ease: EASE, duration: 0.5 }}
                      >
                        <Pill color={c.color} className="w-[92px] justify-center">
                          {c.kind}
                        </Pill>
                        <span className="text-[15px] text-slate-700">{c.text}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {chips && (
              <motion.div className="flex gap-2 pl-[50px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {["Seguir con el precio", "Generar resumen en PDF", "Pedir revisión al mentor"].map((c, i) => (
                  <motion.span
                    key={c}
                    className="rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-[13px] font-semibold text-blue-700"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.12 }}
                  >
                    {c}
                  </motion.span>
                ))}
              </motion.div>
            )}
          </div>
          <div className="border-t border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3 rounded-full border border-slate-300 px-5 py-3 text-[15px] text-slate-700">
              <span className="flex-1">
                {!sent ? <Typed text="A vecinos que toman café todos los días…" delay={700} speed={32} /> : <span className="text-slate-400">Escribe tu respuesta…</span>}
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white">↑</span>
            </div>
          </div>
        </div>
      </AppFrame>
    </Split>
  );
}

/* ───────────────────────────── 4 · Mentor ───────────────────────────── */

export function MentorScene() {
  const scheduled = useAfter(3300);
  const items = [
    { who: "Ana Rojas", initials: "AR", color: "#0284c7", project: "Café de especialidad a domicilio", what: "Pidió revisión · Orientar", hot: true },
    { who: "Diego Mora", initials: "DM", color: "#7c3aed", project: "Huerta urbana en azoteas", what: "Hipótesis por aprobar · Probar" },
    { who: "Sofía Vargas", initials: "SV", color: "#ea580c", project: "Clases de cerámica", what: "Resultados listos · Decidir" },
  ];
  return (
    <Split
      caption={
        <Caption
          step={4}
          title="Un mentor"
          hi="te acompaña."
          body="Tu mentor ve en su bandeja qué proyectos lo necesitan, revisa el contexto y agenda una sesión contigo."
        />
      }
    >
      <AppFrame role="mentor" active="Bandeja">
        <CanvasHeader eyebrow="Mentor" title="Bandeja" right={<Pill color="#dc2626">3 pendientes</Pill>} />
        <div className="space-y-3 p-8">
          {items.map((it, i) => (
            <motion.div
              key={it.who}
              className={`flex items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm ${it.hot ? "border-blue-300 ring-4 ring-blue-100" : "border-slate-200"}`}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.15, duration: 0.6, ease: EASE }}
            >
              <Avatar initials={it.initials} color={it.color} size={46} />
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-bold text-slate-900">{it.project}</p>
                <p className="text-[14px] text-slate-500">
                  {it.who} · {it.what}
                </p>
              </div>
              {it.hot && (
                <AnimatePresence mode="wait">
                  {!scheduled ? (
                    <motion.span key="btn" exit={{ opacity: 0, scale: 0.8 }} className="inline-flex h-10 items-center rounded-full bg-blue-600 px-5 text-xs font-semibold uppercase tracking-[0.08em] text-white">
                      Agendar sesión
                    </motion.span>
                  ) : (
                    <motion.span key="ok" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                      <Pill color="#059669">✓ Agendada</Pill>
                    </motion.span>
                  )}
                </AnimatePresence>
              )}
            </motion.div>
          ))}
          <AnimatePresence>
            {scheduled && (
              <motion.div
                className="mt-6 flex items-center gap-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-6"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 22 }}
              >
                <div className="flex h-[70px] w-[70px] flex-col items-center justify-center rounded-xl bg-white shadow-sm">
                  <span className="text-[11px] font-bold uppercase text-rose-600">Jue</span>
                  <span className="text-[28px] font-black leading-none text-slate-900">14</span>
                </div>
                <div>
                  <p className="text-[18px] font-bold text-slate-900">Sesión de orientación · 10:00</p>
                  <p className="text-[14px] text-slate-600">Videollamada dentro de RAX con transcripción automática.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <FakeCursor
          path={[
            { x: 300, y: 600, t: 0 },
            { x: 300, y: 600, t: 1.4 },
            { x: 790, y: 160, t: 2.9 },
          ]}
          clickAt={[3.0]}
        />
      </AppFrame>
    </Split>
  );
}

/* ───────────────────────────── 5 · Llamada ───────────────────────────── */

const TRANSCRIPT = [
  { who: "Mentor", color: "#7c3aed", text: "Antes de comprar equipo, probemos si alguien paga." },
  { who: "Ana", color: "#0284c7", text: "Podría ofrecer una preventa a 20 vecinos." },
  { who: "Mentor", color: "#7c3aed", text: "Bien. Si 5 pagan por adelantado, seguimos." },
  { who: "Ana", color: "#0284c7", text: "Hago la encuesta y la preventa esta semana." },
];

export function CallScene() {
  const lines = useStep(TRANSCRIPT.length, 1350, 1600);
  const speaker = lines === 0 ? -1 : TRANSCRIPT[lines - 1].who === "Ana" ? 0 : 1;
  return (
    <Split
      caption={
        <Caption
          step={5}
          title="Sesiones con"
          hi="llamada y transcripción."
          body="Habla con tu mentor sin salir de RAX. La conversación se transcribe sola y queda guardada en el proyecto."
        />
      }
    >
      <AppFrame active="Sesiones">
        <CanvasHeader
          eyebrow="Sesión de orientación"
          title="Café de especialidad a domicilio"
          right={
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-[12px] font-semibold text-rose-600">
              <motion.span className="h-2 w-2 rounded-full bg-rose-600" animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
              En vivo · <Clock />
            </span>
          }
        />
        <div className="grid grid-cols-[1fr_330px] gap-5 p-6">
          <div className="grid grid-rows-2 gap-4">
            {[
              { name: "Ana Rojas", role: "Emprendedora", initials: "AR", color: "#0284c7" },
              { name: "Laura Méndez", role: "Mentora", initials: "LM", color: "#7c3aed" },
            ].map((p, i) => (
              <motion.div
                key={p.name}
                className="relative flex h-[290px] items-center justify-center overflow-hidden rounded-2xl bg-[#0b132b]"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + i * 0.15, duration: 0.6 }}
              >
                <motion.div
                  className="absolute h-[150px] w-[150px] rounded-full"
                  style={{ background: p.color }}
                  animate={speaker === i ? { scale: [1, 1.25, 1], opacity: [0.35, 0.1, 0.35] } : { scale: 1, opacity: 0 }}
                  transition={{ duration: 1.2, repeat: speaker === i ? Infinity : 0 }}
                />
                <Avatar initials={p.initials} color={p.color} size={110} />
                <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-[13px] text-white">
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-slate-300">· {p.role}</span>
                </div>
                {speaker === i && (
                  <div className="absolute bottom-5 right-5 flex h-5 items-end gap-[3px]">
                    {[0, 1, 2, 3, 4].map((b) => (
                      <motion.span
                        key={b}
                        className="w-[4px] rounded bg-emerald-400"
                        animate={{ height: [4, 18, 7, 14, 4] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: b * 0.1 }}
                      />
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          <motion.div
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8, duration: 0.6, ease: EASE }}
          >
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Transcripción</p>
              <Pill color={INFO.ai}>IA</Pill>
            </div>
            <div className="mt-4 space-y-4">
              {TRANSCRIPT.slice(0, lines).map((l, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                  <p className="text-[12px] font-bold" style={{ color: l.color }}>
                    {l.who}
                  </p>
                  <p className="text-[14px] leading-snug text-slate-700">
                    <Typed text={l.text} speed={18} caret={false} />
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </AppFrame>
    </Split>
  );
}

function Clock() {
  const [s, setS] = useState(12 * 60 + 41);
  useEffect(() => {
    const iv = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <span className="font-mono tabular-nums">
      {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

/* ───────────────────────────── 6 · Notas ───────────────────────────── */

export function NotesScene() {
  const generating = useAfter(900);
  const ready = useAfter(2200);
  const reply = useAfter(5000);
  const sections = [
    { title: "Acuerdos", color: INFO.decision, items: ["Validar demanda antes de comprar equipo."] },
    { title: "Experimento", color: INFO.assumption, items: ["Preventa a 20 vecinos: éxito si 5 pagan."] },
    { title: "Tareas", color: INFO.fact, items: ["Encuesta de precio · Ana · viernes", "Revisar resultados · Laura · lunes"] },
  ];
  return (
    <Split
      caption={
        <Caption
          step={6}
          title="Notas que"
          hi="trabajan por ti."
          body="La IA resume cada sesión en acuerdos, experimentos y tareas. Puedes responder, y el asistente las usa para guiarte."
        />
      }
    >
      <AppFrame active="Sesiones">
        <CanvasHeader eyebrow="Orientar" title="Notas de la sesión" right={<Pill color={INFO.ai}>Resumen con IA</Pill>} />
        <div className="p-8">
          <motion.div
            className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6, ease: EASE }}
          >
            <div className="flex items-center gap-3">
              <Avatar initials="LM" color="#7c3aed" />
              <div>
                <p className="text-[15px] font-bold text-slate-900">Laura Méndez · Mentora</p>
                <p className="text-[12px] text-slate-500">Jueves 14 · Sesión de orientación</p>
              </div>
            </div>
            <div className="mt-6 min-h-[250px]">
              <AnimatePresence mode="wait">
                {!ready ? (
                  generating && (
                    <motion.div key="gen" className="space-y-3" exit={{ opacity: 0 }}>
                      <p className="flex items-center gap-2 text-[14px] font-semibold text-blue-700">
                        <TypingDots /> Generando notas desde la transcripción…
                      </p>
                      {[90, 75, 82].map((w, i) => (
                        <motion.div
                          key={i}
                          className="h-4 rounded bg-slate-100"
                          style={{ width: `${w}%` }}
                          animate={{ opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
                        />
                      ))}
                    </motion.div>
                  )
                ) : (
                  <motion.div key="ready" className="grid grid-cols-3 gap-4">
                    {sections.map((s, i) => (
                      <motion.div
                        key={s.title}
                        className="rounded-xl border border-slate-200 p-4"
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.3, duration: 0.5, ease: EASE }}
                      >
                        <Pill color={s.color}>{s.title}</Pill>
                        <ul className="mt-3 space-y-2">
                          {s.items.map((t) => (
                            <li key={t} className="text-[14px] leading-snug text-slate-700">
                              {t}
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
          <AnimatePresence>
            {reply && (
              <motion.div
                className="mt-5 flex items-start gap-3 pl-6"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
              >
                <Avatar initials="AR" color="#0284c7" size={34} />
                <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-5 py-3 text-[15px] text-slate-700 shadow-sm">
                  <Typed text="¡Listo! Hoy armo la encuesta y te comparto los resultados." speed={24} />
                </div>
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }} className="self-center">
                  <Pill color={INFO.ai}>El asistente ya conoce estas notas</Pill>
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </AppFrame>
    </Split>
  );
}

/* ───────────────────────────── 7 · Cierre ───────────────────────────── */

export function OutroScene() {
  const lines = [
    ["Entiende", "tu idea."],
    ["Prueba", "en pequeño."],
    ["Decide", "con evidencia."],
  ];
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
      <div className="space-y-1">
        {lines.map(([a, b], i) => (
          <motion.p
            key={a}
            className="display text-[96px] text-slate-900"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.35, duration: 0.8, ease: EASE }}
          >
            {a} <span className="text-blue-600">{b}</span>
          </motion.p>
        ))}
      </div>
      <motion.div
        className="mt-14 flex items-center gap-6"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.6, duration: 0.7, ease: EASE }}
      >
        <span className="text-[72px] font-black tracking-tight text-slate-900">
          <span className="text-blue-600">R</span>AX
        </span>
        <span className="h-16 w-px bg-slate-300" />
        <span className="inline-flex h-16 items-center rounded-full bg-blue-600 px-10 text-[22px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_20px_50px_-15px_rgb(37_99_235/0.8)]">
          Crea tu cuenta
        </span>
      </motion.div>
      <motion.p
        className="mt-8 font-mono text-[22px] tracking-[0.1em] text-slate-500"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.3, duration: 0.8 }}
      >
        rax-red.vercel.app
      </motion.p>
    </div>
  );
}
