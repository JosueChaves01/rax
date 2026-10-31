import Link from "next/link";
import { cx } from "./primitives";

/** Selector de proyecto para las vistas globales que muestran un proyecto a la vez. */
export function ProjectPicker({
  basePath,
  projects,
  currentId,
}: {
  basePath: string;
  projects: Array<{ id: string; name: string }>;
  currentId?: string;
}) {
  if (projects.length < 2) return null;
  return (
    <nav aria-label="Proyecto" className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-slate-500 mr-1">Proyecto:</span>
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`${basePath}?proyecto=${p.id}`}
          aria-current={p.id === currentId ? "page" : undefined}
          className={cx(
            "px-3 py-1 rounded-full border text-xs font-semibold transition-colors",
            p.id === currentId
              ? "border-blue-600 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
          )}
        >
          {p.name}
        </Link>
      ))}
    </nav>
  );
}
