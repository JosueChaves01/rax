"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CycleStage, ProjectMode } from "@/types/b2b";
import { Tag, cx } from "@/shared/ui/primitives";

/**
 * Cabecera de un proyecto B2B (RAX_B2B_FLOW): nombre, línea del ciclo (Entrevista → Sesión 1 → Ciclo
 * → Cierre) y las pestañas de cada rol. El cliente ve su entrevista; el mentor, el brief.
 */

const STEPS: Array<{ key: CycleStage; label: string }> = [
  { key: "intake", label: "Entrevista" },
  { key: "kickoff", label: "Sesión 1" },
  { key: "cycle", label: "Ciclo" },
  { key: "closed", label: "Cierre" },
];

export function B2BProjectHeader({
  projectId,
  name,
  stage,
  mode,
  isMentor,
  mentorName,
}: {
  projectId: string;
  name: string;
  stage: CycleStage;
  mode: ProjectMode;
  isMentor: boolean;
  mentorName?: string;
}) {
  const pathname = usePathname();
  const base = `/app/p/${projectId}`;
  const tabs = isMentor
    ? [
        { href: base, label: "Inicio" },
        { href: `${base}/brief`, label: "Brief" },
      ]
    : [
        { href: base, label: "Inicio" },
        { href: `${base}/intake`, label: "Entrevista" },
      ];
  const current = STEPS.findIndex((s) => s.key === stage);

  return (
    <header className="space-y-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {isMentor && <Tag color="var(--color-cyan)">Vista de mentor</Tag>}
          <span>
            {mode === "group" ? "Proyecto grupal" : "Proyecto individual"}
            {!isMentor && mentorName ? ` · Con ${mentorName}` : ""}
          </span>
        </p>
        <h1 className="display mt-1.5 text-3xl leading-[0.95] text-slate-900 sm:text-4xl">{name}</h1>
      </div>

      <ol className="grid grid-cols-4 gap-2" aria-label="Etapa del ciclo">
        {STEPS.map((s, i) => (
          <li key={s.key} className="min-w-0">
            <span className={cx("block h-1.5 rounded-full", i < current ? "bg-blue-600" : i === current ? "bg-blue-400" : "bg-slate-200")} aria-hidden />
            <span
              className={cx("mt-1 block truncate text-xs", i === current ? "font-semibold text-slate-900" : "text-slate-500")}
              aria-current={i === current ? "step" : undefined}
            >
              {i + 1}. {s.label}
            </span>
          </li>
        ))}
      </ol>

      <nav aria-label="Secciones del proyecto" className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
