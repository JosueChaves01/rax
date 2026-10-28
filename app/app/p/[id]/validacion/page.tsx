import { Empty } from "@/shared/ui/primitives";
import { loadWorkspace } from "../data";
import { HypothesisCard, NewHypothesis } from "./validation-ui";

export default async function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { w } = await loadWorkspace(id);
  const problems = w.items.filter((i) => i.category === "problem" && i.reviewStatus !== "rejected").map((i) => ({ id: i.id, title: i.title, rank: i.priority?.rank }));
  const hyps = [...w.hypotheses].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Etapa 3 · Probar</p>
        <h2 className="display mt-2 text-4xl">
          Hipótesis y <span className="text-highlight">experimentos.</span>
        </h2>
      </div>
      <p className="max-w-3xl text-sm text-muted">
        Una sugerencia de la IA no es una validación. Una hipótesis se vuelve comprobable cuando nombra a quién afecta, qué conducta se espera y
        cómo se va a evaluar. Los criterios de éxito y rechazo se fijan antes de ver resultados y se bloquean al iniciar el experimento.
      </p>
      {w.permissions["hypothesis.propose"] && <NewHypothesis projectId={id} problems={problems} />}
      {hyps.length === 0 ? (
        <Empty title="Sin hipótesis todavía">Cuando haya un problema priorizado, convertí la incertidumbre principal en una afirmación comprobable.</Empty>
      ) : (
        <ul className="space-y-5">
          {hyps.map((h) => (
            <HypothesisCard
              key={`${h.id}-${h.version}`}
              projectId={id}
              hypothesis={h}
              all={w.hypotheses}
              experiments={w.experiments.filter((e) => e.hypothesisId === h.id)}
              results={w.results}
              evidence={w.evidence.map((e) => ({ id: e.id, title: e.title }))}
              tasks={w.tasks}
              problems={problems}
              perms={w.permissions}
              people={w.people as Record<string, { id: string; name: string; role: string }>}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
