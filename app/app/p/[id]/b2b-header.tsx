"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CycleStage, ProjectMode } from "@/types/b2b";
import { B2B_STAGES, b2bProjectTabs, b2bStageState } from "@/features/projects/stages";
import { Tag, cx } from "@/shared/ui/primitives";

/**
 * Cabecera de un proyecto B2B (RAX_B2B_FLOW): nombre, línea del ciclo (Entrevista → Sesión 1 → Ciclo
 * → Cierre, de features/projects/stages.ts) y las pestañas de cada rol. El cliente ve su entrevista;
 * el mentor, el brief. Los dos ven las sesiones, el material publicado y las evaluaciones.
 */
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
  const slug = pathname.slice(base.length).split("/")[1] ?? "";
  const tabs = b2bProjectTabs(isMentor);

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
        {B2B_STAGES.map((s) => {
          const state = b2bStageState(s, stage);
          return (
            <li key={s.id} className="min-w-0">
              <span
                className={cx("block h-1.5 rounded-full", state === "done" ? "bg-emerald-600" : state === "current" ? "bg-blue-600" : "bg-slate-200")}
                aria-hidden
              />
              <span
                className={cx(
                  "mt-1 block truncate text-xs",
                  state === "current" ? "font-semibold text-slate-900" : state === "done" ? "text-emerald-700" : "text-slate-500",
                )}
                aria-current={state === "current" ? "step" : undefined}
              >
                {s.n}. {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      <nav aria-label="Secciones del proyecto" className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1">
        {tabs.map((t) => {
          const href = t.slug ? `${base}/${t.slug}` : base;
          const active = t.slug === slug;
          return (
            <Link
              key={t.slug || "inicio"}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
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
