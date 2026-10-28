import Link from "next/link";
import { DIAGNOSIS_STATUS_LABEL, NATURE_LABEL, PHASE_LABEL, PHASE_ORDER } from "@/features/labels";
import { NEXT_STEP } from "@/features/projects/next-step";
import { openQuestions, pendingReview } from "@/features/diagnosis/rules";
import { DemoTag, Meter, Notice, Tag, cx } from "@/shared/ui/primitives";
import { loadWorkspace } from "./data";
import { Tabs } from "./tabs";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  const phaseIdx = PHASE_ORDER.indexOf(w.phase);
  const viewer = w.isMentorView ? "mentor" : "entrepreneur";
  const next = NEXT_STEP[w.phase][viewer];
  const pending = pendingReview(w.items).length;
  const open = openQuestions(w.items).length;
  const hypPending = w.hypotheses.filter((h) => h.status === "pending_approval").length;
  const sessionsOpen = w.sessions.filter((s) => s.status !== "completed").length;
  const tasksOpen = w.tasks.filter((t) => t.status !== "done").length;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside aria-label="Contexto del proyecto" className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-center gap-2">
            {w.project.isDemo && <DemoTag />}
            {w.isMentorView && <Tag color="var(--color-cyan)">Vista de mentor</Tag>}
          </div>
          <h1 className="display mt-3 text-3xl leading-[0.95]">{w.project.name}</h1>
          <p className="mt-1 text-xs text-muted">{NATURE_LABEL[w.project.nature]}</p>
          <div className="mt-5">
            <Meter value={phaseIdx + 1} total={PHASE_ORDER.length} label="Fase" />
            <p className="mt-2 text-sm font-semibold">{PHASE_LABEL[w.phase]}</p>
          </div>
          <details className="mt-3 hidden text-xs text-muted lg:block">
            <summary className="cursor-pointer select-none hover:text-ink">Ver recorrido completo</summary>
            <ol className="mt-3 space-y-1.5">
              {PHASE_ORDER.map((p, i) => (
                <li key={p} className={cx("flex items-center gap-2", i === phaseIdx ? "text-ink" : i < phaseIdx ? "text-muted" : "text-faint")}>
                  <span
                    aria-hidden
                    className={cx("h-2 w-2 rounded-full", i < phaseIdx ? "bg-ok" : i === phaseIdx ? "bg-accent" : "border border-line-strong")}
                  />
                  <span className="font-mono">{String(i + 1).padStart(2, "0")}</span> {PHASE_LABEL[p]}
                  {i === phaseIdx && <span className="sr-only">(fase actual)</span>}
                </li>
              ))}
            </ol>
          </details>
          <dl className="mt-5 hidden grid-cols-2 lg:grid gap-3 border-t border-line pt-4 text-xs">
            <div>
              <dt className="text-faint">Diagnóstico</dt>
              <dd className="mt-0.5 font-semibold">{DIAGNOSIS_STATUS_LABEL[w.diagnosis.status]}</dd>
            </div>
            <div>
              <dt className="text-faint">Por confirmar</dt>
              <dd className="mt-0.5 font-mono font-semibold">{pending}</dd>
            </div>
            <div>
              <dt className="text-faint">Preguntas abiertas</dt>
              <dd className="mt-0.5 font-mono font-semibold">{open}</dd>
            </div>
            <div>
              <dt className="text-faint">Tareas abiertas</dt>
              <dd className="mt-0.5 font-mono font-semibold">{tasksOpen}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
          <p className="eyebrow text-accent">Siguiente paso</p>
          <p className="mt-2 text-sm">{next.text}</p>
          <Link href={`/app/p/${id}${next.tab ? `/${next.tab}` : ""}`} className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-accent hover:text-accent-strong">
            Ir ahora →
          </Link>
        </div>

        <p className="px-1 text-[0.6875rem] text-faint">
          IA: {w.ai.id === "simulated" ? <span className="text-highlight">{w.ai.label}</span> : w.ai.label}
        </p>
      </aside>

      <div className="min-w-0 space-y-6">
        {w.project.status === "paused" && <Notice tone="warn">El proceso está pausado. La información se conserva; podés retomarlo cuando quieras.</Notice>}
        <Tabs projectId={id} badges={{ diagnostico: pending, mentoria: sessionsOpen, validacion: hypPending }} />
        {children}
      </div>
    </div>
  );
}
