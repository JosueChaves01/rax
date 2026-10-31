import Link from "next/link";
import { DIAGNOSIS_STATUS_LABEL, NATURE_LABEL, PHASE_LABEL, PHASE_ORDER } from "@/features/labels";
import { openQuestions, pendingReview } from "@/features/diagnosis/rules";
import { Meter, Notice, Tag, cx } from "@/shared/ui/primitives";
import { loadWorkspace } from "./data";
import { STAGES, stageOf, stageState } from "@/features/projects/stages";
import { MobileStageBar, StageNav } from "./stage-nav";
import { nextAction } from "@/lib/services/next-action";
import { HideOnHome } from "./hide-on-home";

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  const phaseIdx = PHASE_ORDER.indexOf(w.phase);
  const next = nextAction(w);
  const pending = pendingReview(w.items).length;
  const open = openQuestions(w.items).length;
  const hypPending = w.hypotheses.filter((h) => h.status === "pending_approval").length;
  const reviewOpen = (k: string) => w.sessions.filter((s) => s.kind === k && s.status !== "completed").length;
  const stage = stageOf(w.phase);
  const badges = { diagnostico: pending, orientar: reviewOpen("first_review"), validacion: hypPending, decidir: reviewOpen("second_review") };
  const tasksOpen = w.tasks.filter((t) => t.status !== "done").length;

  return (
    <div className="mx-auto grid max-w-[1400px] gap-6 px-4 pb-28 pt-6 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:pb-6">
      <aside aria-label="Contexto del proyecto" className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:h-fit">
        <div className="rounded-2xl border border-slate-200/80 bg-white dark:bg-slate-900 dark:border-slate-800 p-6 shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            {w.isMentorView && <Tag color="var(--color-cyan)">Vista de mentor</Tag>}
          </div>
          <h1 className="display mt-3 text-3xl leading-[0.95] text-slate-900 dark:text-white">{w.project.name}</h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{NATURE_LABEL[w.project.nature]}</p>
          <div className="mt-5">
            <Meter value={stage.n} total={STAGES.length} label={`Etapa · ${stage.label}`} />
            <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{PHASE_LABEL[w.phase]}</p>
          </div>
          <details className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer select-none hover:text-slate-900 dark:hover:text-white">Ver las {PHASE_ORDER.length} fases</summary>
            <ol className="mt-3 space-y-1.5">
              {PHASE_ORDER.map((p, i) => (
                <li key={p} className={cx("flex items-center gap-2", i === phaseIdx ? "text-slate-900 dark:text-white font-medium" : i < phaseIdx ? "text-slate-600 dark:text-slate-400" : "text-slate-400 dark:text-slate-500")}>
                  <span
                    aria-hidden
                    className={cx("h-2 w-2 rounded-full", i < phaseIdx ? "bg-ok" : i === phaseIdx ? "bg-accent" : "border border-slate-300 dark:border-slate-700")}
                  />
                  <span className="font-mono">{String(i + 1).padStart(2, "0")}</span> {PHASE_LABEL[p]}
                  {i === phaseIdx && <span className="sr-only">(fase actual)</span>}
                </li>
              ))}
            </ol>
          </details>
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-200 dark:border-slate-800 pt-4 text-xs">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Diagnóstico</dt>
              <dd className="mt-0.5 font-semibold text-slate-900 dark:text-white">{DIAGNOSIS_STATUS_LABEL[w.diagnosis.status]}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Por confirmar</dt>
              <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">{pending}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Preguntas abiertas</dt>
              <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">{open}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Tareas abiertas</dt>
              <dd className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-white">{tasksOpen}</dd>
            </div>
          </dl>
        </div>

        <HideOnHome projectId={id}>
          <div className="rounded-2xl border border-blue-200/80 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/40 p-5 shadow-xs">
            <p className="eyebrow text-blue-700 dark:text-blue-400">Siguiente paso</p>
            <p className="mt-2 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{next.text}</p>
            <Link href={`/app/p/${id}/${next.tab}`} className="mt-3 inline-block text-xs font-semibold uppercase tracking-[0.12em] text-blue-600 hover:text-blue-700 dark:text-blue-400">
              Ir ahora →
            </Link>
          </div>
        </HideOnHome>

        <p className="px-1 text-[0.6875rem] text-slate-400">
          IA: {w.ai.id === "simulated" ? <span className="text-highlight">{w.ai.label}</span> : w.ai.label}
        </p>
      </aside>

      <div className="min-w-0 space-y-6">
        {w.project.status === "paused" && <Notice tone="warn">El proceso está pausado. La información se conserva; podés retomarlo cuando quieras.</Notice>}
        <div className="lg:hidden">
          <p className="eyebrow">
            Etapa {stage.n} de {STAGES.length} · {stageState(stage, w.phase) === "done" ? "concluida" : PHASE_LABEL[w.phase]}
          </p>
          <h1 className="display mt-2 text-3xl leading-[0.95] text-slate-900 dark:text-white">{w.project.name}</h1>
        </div>
        <StageNav projectId={id} phase={w.phase} badges={badges} />
        {children}
        <MobileStageBar projectId={id} phase={w.phase} badges={badges} />
      </div>
    </div>
  );
}
