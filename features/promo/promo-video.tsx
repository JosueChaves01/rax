"use client";

import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { AssistantScene, CallScene, IntroScene, MentorScene, NotesScene, OutroScene, ProjectScene, StagesScene } from "./scenes";

/**
 * Video promocional de RAX hecho con Framer Motion. Es una escena fija de 1920×1080 que se escala
 * a la ventana. Con ?grabar=1 oculta los controles y espera a window.__promo.start() para que un
 * script pueda grabarlo cuadro a cuadro (scripts/record-promo.mjs).
 */

const W = 1920;
const H = 1080;

interface Scene {
  id: string;
  label: string;
  ms: number;
  C: ComponentType;
}

export const SCENES: Scene[] = [
  { id: "intro", label: "RAX", ms: 4800, C: IntroScene },
  { id: "proyecto", label: "Proyecto", ms: 6800, C: ProjectScene },
  { id: "etapas", label: "Etapas", ms: 7600, C: StagesScene },
  { id: "asistente", label: "Asistente IA", ms: 9200, C: AssistantScene },
  { id: "mentor", label: "Mentor", ms: 6800, C: MentorScene },
  { id: "llamada", label: "Llamada", ms: 8600, C: CallScene },
  { id: "notas", label: "Notas", ms: 8000, C: NotesScene },
  { id: "cierre", label: "Empieza", ms: 6000, C: OutroScene },
];

const STARTS = SCENES.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + SCENES[i - 1].ms], []);
export const TOTAL_MS = STARTS[STARTS.length - 1] + SCENES[SCENES.length - 1].ms;

function sceneAt(t: number) {
  for (let i = SCENES.length - 1; i >= 0; i--) if (t >= STARTS[i]) return i;
  return 0;
}

declare global {
  interface Window {
    __promo?: { start: () => void; done: boolean; total: number };
  }
}

export function PromoVideo({ record = false }: { record?: boolean }) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(!record);
  const [take, setTake] = useState(0); // fuerza a remontar la escena al saltar o reiniciar
  const [scale, setScale] = useState(1);
  const last = useRef<number | null>(null);
  // Narración: arranca apagada porque el navegador no deja reproducir sonido sin un clic.
  const audio = useRef<HTMLAudioElement>(null);
  const [sound, setSound] = useState(false);
  const tRef = useRef(0);
  tRef.current = t;

  // Escala la escena a la ventana manteniendo 16:9.
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, (window.innerHeight - (record ? 0 : 64)) / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [record]);

  // Reloj maestro.
  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      const dt = last.current == null ? 0 : now - last.current;
      last.current = now;
      setT((x) => {
        const n = x + dt;
        if (n >= TOTAL_MS) {
          setPlaying(false);
          if (window.__promo) window.__promo.done = true;
          return TOTAL_MS;
        }
        return n;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    if (!record) return;
    window.__promo = { start: () => setPlaying(true), done: false, total: TOTAL_MS };
  }, [record]);

  // Mantiene la narración alineada con el reloj al reproducir, pausar o saltar de escena.
  useEffect(() => {
    const a = audio.current;
    if (!a || record) return;
    if (playing && sound) {
      a.currentTime = tRef.current / 1000;
      a.play().catch(() => setSound(false));
    } else {
      a.pause();
    }
  }, [playing, sound, take, record]);

  const jump = useCallback((i: number) => {
    setT(STARTS[i]);
    setTake((k) => k + 1);
    setPlaying(true);
  }, []);

  const replay = () => jump(0);
  const idx = sceneAt(t);
  const ended = t >= TOTAL_MS;

  return (
    <div className="flex h-dvh w-screen flex-col items-center justify-center overflow-hidden bg-slate-950">
      <div style={{ width: W * scale, height: H * scale }} className="relative">
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
          <Stage idx={record && !playing && t === 0 ? -1 : idx} take={take} />
          <Chapters t={t} onJump={record ? undefined : jump} />
        </div>
      </div>

      {!record && (
        <div className="flex h-16 items-center gap-3 text-sm text-slate-300">
          <button
            onClick={() => (ended ? replay() : setPlaying((p) => !p))}
            className="inline-flex h-9 items-center rounded-full bg-blue-600 px-5 text-xs font-semibold uppercase tracking-[0.08em] text-white hover:bg-blue-700"
          >
            {ended ? "Ver de nuevo" : playing ? "Pausa" : "Reproducir"}
          </button>
          <button onClick={replay} className="inline-flex h-9 items-center rounded-full border border-slate-700 px-4 text-xs font-semibold uppercase tracking-[0.08em] hover:border-slate-500">
            Reiniciar
          </button>
          <button
            onClick={() => setSound((v) => !v)}
            aria-pressed={sound}
            className="inline-flex h-9 items-center rounded-full border border-slate-700 px-4 text-xs font-semibold uppercase tracking-[0.08em] hover:border-slate-500"
          >
            {sound ? "Sonido: sí" : "Activar voz"}
          </button>
          <audio ref={audio} src="/promo/narracion.mp3" preload="auto" />
          <span className="font-mono tabular-nums text-slate-500">
            {fmt(t)} / {fmt(TOTAL_MS)}
          </span>
          <a href="/promo/rax-promo.mp4" download className="ml-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400 hover:text-white">
            Descargar MP4
          </a>
        </div>
      )}
    </div>
  );
}

function fmt(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Fondo y escena actual. Memorizado para no re-renderizar en cada cuadro del reloj. */
const Stage = memo(function Stage({ idx, take }: { idx: number; take: number }) {
  const scene = idx >= 0 ? SCENES[idx] : null;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#f8fafc] font-sans text-slate-900">
      <Backdrop />
      <LayoutGroup>
        <AnimatePresence mode="wait">
          {scene && (
            <motion.div
              key={`${scene.id}-${take}`}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, filter: "blur(6px)" }}
              transition={{ duration: 0.45 }}
            >
              <scene.C />
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
});

/** Cuadrícula suave y luces azules en movimiento, sobre el lienzo claro de la app. */
function Backdrop() {
  return (
    <div aria-hidden className="absolute inset-0">
      <div
        className="absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage: "linear-gradient(rgb(15 23 42 / 0.05) 1px, transparent 1px), linear-gradient(90deg, rgb(15 23 42 / 0.05) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 85%)",
        }}
      />
      <motion.div
        className="absolute -left-40 -top-40 h-[700px] w-[700px] rounded-full bg-blue-400/20 blur-[120px]"
        animate={{ x: [0, 120, 0], y: [0, 80, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-60 -right-40 h-[800px] w-[800px] rounded-full bg-sky-300/25 blur-[140px]"
        animate={{ x: [0, -140, 0], y: [0, -60, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/** Barra de capítulos dentro del video. */
function Chapters({ t, onJump }: { t: number; onJump?: (i: number) => void }) {
  return (
    <nav aria-label="Capítulos" className="absolute inset-x-[100px] bottom-[36px] flex gap-3">
      {SCENES.map((s, i) => {
        const p = Math.min(1, Math.max(0, (t - STARTS[i]) / s.ms));
        const on = t >= STARTS[i] && t < STARTS[i] + s.ms;
        return (
          <button
            key={s.id}
            type="button"
            disabled={!onJump}
            onClick={() => onJump?.(i)}
            aria-label={`Ir a ${s.label}`}
            className="flex-1 text-left enabled:cursor-pointer"
            style={{ flexGrow: s.ms, flexBasis: 0 }}
          >
            <div className="h-[5px] overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-blue-600" style={{ width: `${p * 100}%` }} />
            </div>
            <p className={`mt-2 text-[13px] font-semibold uppercase tracking-[0.12em] ${on ? "text-blue-700" : "text-slate-400"}`}>{s.label}</p>
          </button>
        );
      })}
    </nav>
  );
}
