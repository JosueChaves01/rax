"use client";

import { useState, useTransition } from "react";
import type { MentorProfile } from "@/types/b2b";
import { saveMentorProfileAction } from "@/app/actions/mentor";
import { Button, Card, Field, Notice, inputClass } from "@/shared/ui/primitives";
import { POPULAR_FOCUS_AREAS, TONE_PRESETS, type TonePreset } from "../constants";

interface ProfileMethodologyTabProps {
  initial: MentorProfile;
  onProfileUpdated?: (updated: MentorProfile) => void;
}

export function ProfileMethodologyTab({ initial, onProfileUpdated }: ProfileMethodologyTabProps) {
  const [headline, setHeadline] = useState(initial.headline);
  const [bio, setBio] = useState(initial.bio);
  const [focusAreas, setFocusAreas] = useState<string[]>(initial.focusAreas ?? []);
  const [tagInput, setTagInput] = useState("");
  const [methodology, setMethodology] = useState(initial.methodology);
  const [tone, setTone] = useState(initial.assistantTone);
  const [selectedToneId, setSelectedToneId] = useState<string | null>(() => {
    const match = TONE_PRESETS.find((p) => p.text === initial.assistantTone);
    return match ? match.id : null;
  });

  const [flash, setFlash] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const handleAddTag = (tagToAdd?: string) => {
    const raw = (tagToAdd ?? tagInput).trim();
    if (!raw) return;
    const exists = focusAreas.some((t) => t.toLowerCase() === raw.toLowerCase());
    if (!exists) {
      setFocusAreas((prev) => [...prev, raw]);
    }
    if (!tagToAdd) setTagInput("");
  };

  const handleRemoveTag = (index: number) => {
    setFocusAreas((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSelectTone = (preset: TonePreset) => {
    setSelectedToneId(preset.id);
    setTone(preset.text);
  };

  const appendPromptToMethodology = (textToAppend: string) => {
    setMethodology((prev) => (prev ? `${prev.trim()}\n\n${textToAppend}` : textToAppend));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFlash(null);

    startTransition(async () => {
      const res = await saveMentorProfileAction({
        headline,
        bio,
        methodology,
        assistantTone: tone,
        focusAreas,
      });

      if (res.ok && res.data) {
        setFlash({ tone: "success", text: "Tu perfil y metodología se han guardado con éxito." });
        onProfileUpdated?.(res.data);
      } else {
        setFlash({ tone: "error", text: res.ok ? "Error al guardar." : res.error });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 1. Presentación y Marca Personal */}
      <Card className="p-6 sm:p-7">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-900">1. Presentación e Identidad</h2>
          <p className="mt-1 text-sm text-slate-500">
            Esta información define cómo te introduces ante nuevos clientes en RAX y orienta el contexto inicial del Asistente IA.
          </p>
        </div>

        <div className="mt-5 space-y-5">
          <Field
            label="Titular Profesional"
            id="pm-headline"
            hint="Una sola frase contundente: a quién acompañas y cuál es tu valor diferencial (máx. 200 caracteres)."
          >
            <div className="relative">
              <input
                id="pm-headline"
                className={inputClass}
                placeholder="Ej: Acompaño a fundadores B2B a estructurar su proceso comercial y alcanzar sus primeros $50k MRR."
                maxLength={200}
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
              />
              <span className="absolute right-3 top-2.5 text-[11px] font-mono text-slate-400">
                {headline.length}/200
              </span>
            </div>
          </Field>

          <Field
            label="Biografía y Trayectoria"
            id="pm-bio"
            hint="Tu experiencia relevante, industrias que dominas y logros que respaldan tu criterio (máx. 4,000 caracteres)."
          >
            <div className="relative">
              <textarea
                id="pm-bio"
                className={inputClass}
                rows={4}
                placeholder="Cuéntale a tus clientes tus roles previos, startups o empresas que has liderado o asesorado, y qué te apasiona resolver..."
                maxLength={4000}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
              <span className="absolute right-3 bottom-2.5 text-[11px] font-mono text-slate-400">
                {bio.length}/4000
              </span>
            </div>
          </Field>

          {/* Selector Interactivo de Áreas de Foco */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              Áreas de Especialidad
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Temas clave donde aportas mayor valor. Escribe uno y presiona Enter, o selecciona de las sugerencias.
            </p>

            <div className="mt-2.5 flex flex-wrap gap-2 items-center">
              {focusAreas.map((tag, idx) => (
                <span
                  key={`${tag}-${idx}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(idx)}
                    className="cursor-pointer text-blue-500 hover:text-blue-900 focus:outline-hidden"
                    title="Eliminar especialidad"
                  >
                    ×
                  </button>
                </span>
              ))}

              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Agregar especialidad..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="h-8 rounded-lg border border-slate-300 px-3 text-xs placeholder:text-slate-400 focus:border-blue-600 focus:outline-hidden"
                />
                <Button size="sm" type="button" onClick={() => handleAddTag()}>
                  +
                </Button>
              </div>
            </div>

            {/* Sugerencias Rápidas */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 text-[11px]">Sugerencias:</span>
              {POPULAR_FOCUS_AREAS.filter((sug) => !focusAreas.some((t) => t.toLowerCase() === sug.toLowerCase())).slice(0, 6).map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => handleAddTag(sug)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-700 transition"
                >
                  + {sug}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* 2. Metodología de Acompañamiento */}
      <Card className="p-6 sm:p-7">
        <div className="border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">2. Tu Metodología de Mentoría</h2>
              <p className="mt-1 text-sm text-slate-500">
                Describe los pasos, principios o marcos de trabajo que usas. Tu Asistente IA los estudia y los cita expresamente con tus clientes.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-mono text-slate-600">
              Prompt de Asistente IA
            </span>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <Field
            label="Marcos y Pasos Metodológicos"
            id="pm-methodology"
            hint="Detalla cómo evalúas las situaciones, qué exiges primero (ej. validación antes de escalar) y cómo guías cada etapa (máx. 10,000 caracteres)."
          >
            <div className="relative">
              <textarea
                id="pm-methodology"
                className={inputClass}
                rows={8}
                placeholder="Ejemplo de estructura:
1. Diagnóstico de Tracción: Revisamos conversión del embudo y retención real antes de hablar de marketing.
2. Descubrimiento de Clientes: Exijo al menos 10 entrevistas cualitativas con clientes insatisfechos.
3. Plan de Acción: Solo definimos 3 hipótesis críticas por ciclo de 2 semanas..."
                maxLength={10000}
                value={methodology}
                onChange={(e) => setMethodology(e.target.value)}
              />
              <span className="absolute right-3 bottom-2.5 text-[11px] font-mono text-slate-400">
                {methodology.length}/10,000
              </span>
            </div>
          </Field>

          {/* Plantillas de ayuda rápida para insertar en metodología */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
            <p className="text-xs font-semibold text-slate-700">💡 Guía para estructurar tu metodología:</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() =>
                  appendPromptToMethodology(
                    "### Principios Innegociables:\n- Validación empírica antes de gastar presupuesto en desarrollo.\n- Métricas reales (MRR, churn) sobre métricas de vanidad (visitas, likes).\n- Acuerdos con responsables únicos y plazos definidos."
                  )
                }
                className="rounded-lg bg-white px-2.5 py-1 text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition shadow-2xs"
              >
                + Insertar bloque de Principios
              </button>

              <button
                type="button"
                onClick={() =>
                  appendPromptToMethodology(
                    "### Proceso de 3 Fases:\n1. Diagnóstico y Claridad: Detectar el problema raíz y desestimar hipótesis falsas.\n2. Diseño de Experimentos: Pruebas rápidas de menos de 7 días.\n3. Escalamiento Sostenible: Sistematizar lo que dio tracción comprobada."
                  )
                }
                className="rounded-lg bg-white px-2.5 py-1 text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition shadow-2xs"
              >
                + Insertar estructura de 3 fases
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* 3. Tono y Personalidad del Asistente */}
      <Card className="p-6 sm:p-7">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-lg font-bold text-slate-900">3. Voz y Tono del Asistente IA</h2>
          <p className="mt-1 text-sm text-slate-500">
            El asistente conversa con tus clientes entre sesiones. Selecciona el estilo que mejor represente tu personalidad o personalízalo.
          </p>
        </div>

        <div className="mt-5 space-y-5">
          {/* Presets visuales */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TONE_PRESETS.map((preset) => {
              const isSelected = selectedToneId === preset.id || tone === preset.text;
              return (
                <div
                  key={preset.id}
                  onClick={() => handleSelectTone(preset)}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                    isSelected
                      ? "border-blue-600 bg-blue-50/50 shadow-xs ring-2 ring-blue-600/20"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-2xl">{preset.emoji}</span>
                    {isSelected && (
                      <span className="inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Activo
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-slate-900">{preset.label}</h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">{preset.description}</p>
                </div>
              );
            })}
          </div>

          <Field
            label="Instrucción de Tono Activa"
            id="pm-tone"
            hint="Puedes ajustar libremente este texto con pautas concretas para que el asistente hable exactamente como deseas."
          >
            <div className="relative">
              <textarea
                id="pm-tone"
                className={inputClass}
                rows={3}
                maxLength={2000}
                value={tone}
                onChange={(e) => {
                  setTone(e.target.value);
                  setSelectedToneId(null);
                }}
              />
              <span className="absolute right-3 bottom-2.5 text-[11px] font-mono text-slate-400">
                {tone.length}/2000
              </span>
            </div>
          </Field>
        </div>
      </Card>

      {/* Notificaciones y Botón Guardar */}
      {flash && <Notice tone={flash.tone}>{flash.text}</Notice>}

      <div className="sticky bottom-4 z-10 flex justify-end rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-lg backdrop-blur-md">
        <Button type="submit" variant="primary" disabled={pending} className="min-w-44">
          {pending ? "Guardando cambios…" : "Guardar Perfil y Metodología"}
        </Button>
      </div>
    </form>
  );
}
