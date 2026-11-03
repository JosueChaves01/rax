"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ProjectPhase } from "@/types/domain";
import { SECTIONS, STAGES, sectionOfSlug, stageState, type Section, type StageState } from "@/features/projects/stages";
import { cx } from "@/shared/ui/primitives";

type Badges = Partial<Record<string, number>>;

const STATE_LABEL: Record<StageState, string> = { done: "hecha", current: "en curso", upcoming: "por venir" };

function useCurrent(projectId: string) {
  const base = `/app/p/${projectId}`;
  const slug = usePathname().slice(base.length).split("/")[1] ?? "";
  return { base, slug, section: sectionOfSlug(slug) };
}

const href = (base: string, slug: string) => (slug ? `${base}/${slug}` : base);


function Count({ n }: { n?: number }) {
  return n ? (
    <span className="rounded-full bg-blue-600 px-1.5 font-mono text-[0.625rem] leading-4 text-white" aria-label={`${n} pendientes`}>
      {n}
    </span>
  ) : null;
}

/**
 * Navegación del proyecto en una sola franja: Inicio, las 4 etapas como segmentos de progreso y Archivo.
 * Debajo, las páginas de la sección (salvo en las del ciclo de mentoría, que se recorren como un hilo).
 * Es la misma en escritorio y en el celular; reemplaza a la tarjeta lateral, las pestañas grandes y la
 * barra inferior de etapas.
 */
export function StageNav({ projectId, phase, badges }: { projectId: string; phase: ProjectPhase; badges: Badges }) {
  const { base, slug, section } = useCurrent(projectId);
  const sectionBadge = (s: Section) => s.pages.reduce((n, p) => n + (badges[p.slug] ?? 0), 0);
  const edge = (s: Section, label: string) => {
    const active = s.id === section.id;
    return (
      <li key={s.id} className={cx("shrink-0", s.id === "archivo" && "sm:order-none")}>
        <Link
          href={href(base, s.pages[0].slug)}
          aria-current={active ? "page" : undefined}
          className={cx(
            "flex h-9 items-center rounded-full border px-3 text-xs font-semibold transition-colors",
            active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
          )}
        >
          {label}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Etapas del proyecto" className="space-y-3">
      <ol className="flex flex-wrap items-center justify-between gap-2 sm:flex-nowrap sm:gap-3">
        {edge(SECTIONS[0], "Inicio")}
        <li className="order-first min-w-0 basis-full sm:order-none sm:basis-auto sm:flex-1">
          <ol className="grid grid-cols-4 gap-1.5 sm:gap-2">
            {STAGES.map((stage) => {
              const s = SECTIONS.find((x) => x.id === stage.id)!;
              const state = stageState(stage, phase);
              const active = s.id === section.id;
              const n = sectionBadge(s);
              return (
                <li key={s.id} className="min-w-0">
                  <Link
                    href={href(base, s.pages[0].slug)}
                    aria-current={active ? "page" : undefined}
                    className="group block rounded-lg px-0.5 py-1 focus-visible:outline-2 focus-visible:outline-blue-600"
                  >
                    <span
                      aria-hidden
                      className={cx(
                        "block h-1.5 rounded-full transition-colors",
                        state === "done" ? "bg-emerald-600" : state === "current" ? "bg-blue-600" : "bg-slate-200 group-hover:bg-slate-300",
                        active && "ring-2 ring-blue-600/25 ring-offset-1",
                      )}
                    />
                    <span
                      className={cx(
                        "mt-1.5 flex items-center gap-1.5 truncate text-[0.6875rem] sm:text-xs",
                        active ? "font-bold text-slate-900" : state === "done" ? "font-medium text-emerald-700" : state === "current" ? "font-semibold text-blue-700" : "text-slate-400",
                      )}
                    >
                      <span className="truncate">{s.label}</span>
                      <Count n={n} />
                      <span className="sr-only">({STATE_LABEL[state]})</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </li>
        {edge(SECTIONS[SECTIONS.length - 1], "Archivo")}
      </ol>

      {section.pages.length > 1 && !section.threaded && (
        <ul className="-mx-4 flex min-w-0 gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
          {section.pages.map((p) => {
            const active = p.slug === slug;
            return (
              <li key={p.slug}>
                <Link
                  href={href(base, p.slug)}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative inline-flex h-11 items-center gap-2 whitespace-nowrap px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] transition-colors",
                    active ? "text-blue-600" : "text-slate-500 hover:text-slate-900",
                  )}
                >
                  {p.label}
                  <Count n={badges[p.slug]} />
                  {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded bg-blue-600" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
