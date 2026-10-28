"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/shared/ui/primitives";

export const TABS = [
  { slug: "", label: "Conversación" },
  { slug: "diagnostico", label: "Diagnóstico" },
  { slug: "mentoria", label: "Mentoría" },
  { slug: "validacion", label: "Hipótesis y experimentos" },
  { slug: "tareas", label: "Tareas" },
  { slug: "historial", label: "Evidencia e historial" },
] as const;

export function Tabs({ projectId, badges }: { projectId: string; badges: Partial<Record<string, number>> }) {
  const path = usePathname();
  const base = `/app/p/${projectId}`;
  return (
    <nav aria-label="Secciones del proyecto" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {TABS.map((t) => {
          const href = t.slug ? `${base}/${t.slug}` : base;
          const active = path === href;
          const badge = badges[t.slug];
          return (
            <li key={t.slug}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative inline-flex h-11 items-center gap-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] transition-colors",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                {t.label}
                {!!badge && (
                  <span className="rounded-full bg-accent px-1.5 font-mono text-[0.625rem] leading-4 text-white" aria-label={`${badge} pendientes`}>
                    {badge}
                  </span>
                )}
                {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded bg-accent" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
