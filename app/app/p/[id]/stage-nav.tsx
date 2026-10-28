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

function stateOf(s: Section, phase: ProjectPhase): StageState | undefined {
  const stage = STAGES.find((x) => x.id === s.id);
  return stage && stageState(stage, phase);
}

function Count({ n }: { n?: number }) {
  return n ? (
    <span className="rounded-full bg-accent px-1.5 font-mono text-[0.625rem] leading-4 text-white" aria-label={`${n} pendientes`}>
      {n}
    </span>
  ) : null;
}

/** Navegación del proyecto por etapas: arriba las secciones, debajo las páginas de la sección actual. */
export function StageNav({ projectId, phase, badges }: { projectId: string; phase: ProjectPhase; badges: Badges }) {
  const { base, slug, section } = useCurrent(projectId);
  const sectionBadge = (s: Section) => s.pages.reduce((n, p) => n + (badges[p.slug] ?? 0), 0);

  return (
    <nav aria-label="Etapas del proyecto" className="space-y-3">
      <ol className="hidden gap-1.5 lg:grid lg:grid-cols-[auto_repeat(4,minmax(0,1fr))_auto]">
        {SECTIONS.map((s) => {
          const state = stateOf(s, phase);
          const stage = STAGES.find((x) => x.id === s.id);
          const active = s.id === section.id;
          return (
            <li key={s.id}>
              <Link
                href={href(base, s.pages[0].slug)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-full flex-col justify-center rounded-xl border px-3 py-2 transition-colors",
                  active ? "border-accent bg-accent/10" : "border-line bg-panel hover:border-line-strong",
                  state === "upcoming" && !active && "opacity-70",
                )}
              >
                <span className="flex items-center gap-2 font-mono text-[0.625rem] text-faint">
                  {stage ? `${stage.n} · ${STATE_LABEL[state!]}` : s.id === "inicio" ? "resumen" : "consulta"}
                  <Count n={sectionBadge(s)} />
                </span>
                <span className={cx("display mt-0.5 text-xl", state === "done" && !active ? "text-muted" : "")}>
                  {state === "done" && <span className="text-ok">✓ </span>}
                  {s.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {section.pages.length > 1 && (
        <ul className="-mx-4 flex min-w-0 gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
          {section.pages.map((p) => {
            const active = p.slug === slug;
            return (
              <li key={p.slug}>
                <Link
                  href={href(base, p.slug)}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative inline-flex h-11 items-center gap-2 whitespace-nowrap px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] transition-colors",
                    active ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {p.label}
                  <Count n={badges[p.slug]} />
                  {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded bg-accent" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

/** En el celular, Inicio y las 4 etapas van abajo, al alcance del pulgar. */
export function MobileStageBar({ projectId, phase, badges }: { projectId: string; phase: ProjectPhase; badges: Badges }) {
  const { base, section } = useCurrent(projectId);
  return (
    <nav
      aria-label="Etapas del proyecto"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {SECTIONS.filter((s) => s.id !== "archivo").map((s) => {
          const state = stateOf(s, phase);
          const active = s.id === section.id;
          const n = s.pages.reduce((acc, p) => acc + (badges[p.slug] ?? 0), 0);
          return (
            <li key={s.id}>
              <Link
                href={href(base, s.pages[0].slug)}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex flex-col items-center gap-1 px-1 pb-3 pt-2.5 text-[0.625rem] font-semibold uppercase tracking-[0.06em]",
                  active ? "text-accent" : state === "upcoming" ? "text-faint" : "text-muted",
                )}
              >
                <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", state === "done" ? "bg-ok" : "bg-current")} />
                {s.label}
                {!!n && <span className="absolute right-2 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" aria-label={`${n} pendientes`} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
