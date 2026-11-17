"use client";

import { Tag } from "@/shared/ui/primitives";

interface MentorProfileHeaderProps {
  actorName: string;
  actorEmail: string;
  headline?: string;
  documentsCount: number;
  totalTokens: number;
  questionsCount: number;
  focusCount: number;
  onOpenSimulator: () => void;
}

export function MentorProfileHeader({
  actorName,
  actorEmail,
  headline,
  documentsCount,
  totalTokens,
  questionsCount,
  focusCount,
  onOpenSimulator,
}: MentorProfileHeaderProps) {
  const initials = actorName
    ? actorName
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : "M";

  const isConfigured = Boolean(headline && questionsCount > 0);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50/50 to-blue-50/30 p-6 shadow-sm sm:p-8">
      {/* Glow de fondo decorativo */}
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Identidad del Mentor */}
        <div className="flex items-start gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <div className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 to-blue-950 font-bold text-xl sm:text-2xl tracking-tight text-white shadow-md ring-4 ring-white">
              {initials}
            </div>
            <span
              className={`absolute -bottom-1 -right-1 block h-5 w-5 rounded-full border-2 border-white ${
                isConfigured ? "bg-emerald-500" : "bg-amber-400"
              }`}
              title={isConfigured ? "Asistente configurado y sincronizado" : "Configuración en proceso"}
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                {actorName || "Mentor"}
              </h1>
              <Tag color="#2563eb">Mentor Acreditado</Tag>
              {isConfigured ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Asistente IA activo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Pendiente completar
                </span>
              )}
            </div>

            <p className="mt-0.5 text-xs sm:text-sm text-slate-500">{actorEmail}</p>

            <p className="mt-2 text-sm italic text-slate-700 line-clamp-2">
              {headline ? `«${headline}»` : "Define tu titular para que tus clientes conozcan tu propuesta y enfoque."}
            </p>
          </div>
        </div>

        {/* Acciones y Simulador */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onOpenSimulator}
            className="group inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <svg
              className="h-4 w-4 text-blue-400 transition group-hover:text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
              />
            </svg>
            Simular Asistente IA
          </button>
        </div>
      </div>

      {/* Métricas del Sistema de Mentoría */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-slate-200/70 pt-5">
        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200/50">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Documentos RAG</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{documentsCount}</p>
          <p className="text-[11px] text-slate-500">~{totalTokens.toLocaleString("es")} tokens indexados</p>
        </div>

        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200/50">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Preguntas Intake</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{questionsCount}</p>
          <p className="text-[11px] text-slate-500">Previas a la Sesión 1</p>
        </div>

        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200/50">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Especialidades</p>
          <p className="mt-1 text-xl font-bold text-slate-900">{focusCount}</p>
          <p className="text-[11px] text-slate-500">Áreas de dominio</p>
        </div>

        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-200/50">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Metodología</p>
          <p className="mt-1 text-sm font-semibold text-slate-800 truncate">
            {isConfigured ? "Personalizada" : "Estándar RAX"}
          </p>
          <p className="text-[11px] text-slate-500">Citada en chats B2B</p>
        </div>
      </div>
    </div>
  );
}
