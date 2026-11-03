import Link from "next/link";
import { NATURE_LABEL, PHASE_LABEL } from "@/features/labels";
import { pendingReview } from "@/features/diagnosis/rules";
import { Notice, Tag } from "@/shared/ui/primitives";
import { loadWorkspace } from "./data";
import { STAGES, stageOf, stageState } from "@/features/projects/stages";
import { StageNav } from "./stage-nav";
import { nextAction } from "@/lib/services/next-action";
import { HideOnHome } from "./hide-on-home";

/**
 * Marco del proyecto: una cabecera con el nombre, lo que toca ahora y la franja de etapas.
 * Antes había una tarjeta lateral, pestañas grandes y una barra inferior que repetían lo mismo.
 */
export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  const next = nextAction(w);
  const pending = pendingReview(w.items).length;
  const hypPending = w.hypotheses.filter((h) => h.status === "pending_approval").length;
  const reviewOpen = (k: string) => w.sessions.filter((s) => s.kind === k && s.status !== "completed").length;
  const stage = stageOf(w.phase);
  const badges = { diagnostico: pending, orientar: reviewOpen("first_review"), validacion: hypPending, decidir: reviewOpen("second_review") };

  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:pb-8">
      <header className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {w.isMentorView && <Tag color="var(--color-cyan)">Vista de mentor</Tag>}
              <span>
                {NATURE_LABEL[w.project.nature]} · Etapa {stage.n} de {STAGES.length} ·{" "}
                {stageState(stage, w.phase) === "done" ? "concluida" : PHASE_LABEL[w.phase]}
              </span>
            </p>
            <h1 className="display mt-1.5 text-3xl leading-[0.95] text-slate-900 sm:text-4xl">{w.project.name}</h1>
          </div>
          <HideOnHome projectId={id}>
            <Link
              href={`/app/p/${id}/${next.tab}`}
              className="group flex max-w-md items-start gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-xs transition-colors hover:bg-slate-800"
            >
              <span className="min-w-0">
                <span className="block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-blue-200">{next.turn === (w.isMentorView ? "mentor" : "entrepreneur") ? "Te toca" : "Siguiente paso"}</span>
                <span className="mt-0.5 block text-sm leading-snug">{next.text}</span>
              </span>
              <span aria-hidden className="mt-3 text-blue-200 transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </HideOnHome>
        </div>
        <StageNav projectId={id} phase={w.phase} badges={badges} />
      </header>

      {w.project.status === "paused" && <Notice tone="warn">El proceso está pausado. La información se conserva; podés retomarlo cuando quieras.</Notice>}
      <div className="min-w-0">{children}</div>

      <p className="text-[0.6875rem] text-slate-400">
        IA: {w.ai.id === "simulated" ? <span className="text-highlight">{w.ai.label}</span> : w.ai.label}
      </p>
    </div>
  );
}
