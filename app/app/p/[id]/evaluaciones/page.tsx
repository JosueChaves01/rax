import Link from "next/link";
import { notFound } from "next/navigation";
import { isB2BFlow } from "@/lib/flags";
import { listAssessments, type AssessmentListItem } from "@/lib/services/assessments";
import { Card, Empty, Tag, formatDate } from "@/shared/ui/primitives";
import { loadWorkspace } from "../data";
import { loadCycleOverview, sessionTitle } from "../cycle-data";
import { ASSESSMENT_STATUS_TAG, loadB2B } from "./data";
import { AssessmentEditor } from "./assessment-forms";

export const metadata = { title: "Evaluaciones · RAX" };

const MINE_LABEL = { draft: "Borrador guardado", submitted: "Enviada", reviewed: "Revisada" } as const;

/**
 * Evaluaciones de un proyecto B2B. El mentor las crea (opcionalmente ligadas a una sesión), las
 * publica y ve cuántas personas respondieron; la persona cliente ve las abiertas y cerradas.
 */
export default async function AssessmentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sesion?: string }> }) {
  const { id } = await params;
  const { sesion } = await searchParams;
  if (!isB2BFlow()) notFound();
  const { w } = await loadWorkspace(id);
  if (!w.project.mentorId) notFound();
  const [items, o] = await Promise.all([loadB2B((d) => listAssessments(d, id)), loadCycleOverview(id)]);
  const isMentor = o.viewer === "mentor";
  const sessions = o.sessions.map((s) => ({ id: s.id, label: sessionTitle(s) }));
  const sessionLabel = new Map(sessions.map((s) => [s.id, s.label]));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section aria-labelledby="evaluaciones" className="space-y-3">
        <h2 id="evaluaciones" className="text-xl font-bold text-slate-900">
          Evaluaciones
        </h2>
        {items.length === 0 ? (
          <Empty title="Todavía no hay evaluaciones">
            {isMentor ? "Crea una para ver qué entendió tu cliente de lo trabajado en la sesión." : "Cuando tu mentor publique una evaluación, la verás aquí."}
          </Empty>
        ) : (
          items.map((item) => <AssessmentRow key={item.assessment.id} projectId={id} item={item} isMentor={isMentor} mode={o.mode} sessionLabel={sessionLabel} />)
        )}
      </section>

      {isMentor && (
        <aside>
          <Card className="space-y-3 p-5">
            <p className="eyebrow text-slate-500">Nueva evaluación</p>
            <AssessmentEditor projectId={id} sessions={sessions} defaultSessionId={sesion && sessionLabel.has(sesion) ? sesion : undefined} />
          </Card>
        </aside>
      )}
    </div>
  );
}

function AssessmentRow({
  projectId,
  item,
  isMentor,
  mode,
  sessionLabel,
}: {
  projectId: string;
  item: AssessmentListItem;
  isMentor: boolean;
  mode: "individual" | "group";
  sessionLabel: Map<string, string>;
}) {
  const a = item.assessment;
  const tag = ASSESSMENT_STATUS_TAG[a.status];
  return (
    <Card as="article" className="p-5">
      <Link href={`/app/p/${projectId}/evaluaciones/${a.id}`} className="group block space-y-1.5">
        <p className="flex flex-wrap items-center gap-2">
          <Tag color={tag.color}>{tag.label}</Tag>
          {a.sessionId && sessionLabel.get(a.sessionId) && <span className="text-xs text-slate-500">{sessionLabel.get(a.sessionId)}</span>}
          {a.dueAt && <span className="text-xs text-slate-500">Hasta el {formatDate(a.dueAt)}</span>}
        </p>
        <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-700">{a.title}</h3>
        <p className="text-sm text-slate-600">
          {a.questions.length} pregunta{a.questions.length === 1 ? "" : "s"}
          {isMentor && a.status !== "draft" && (
            <>
              {" · "}
              {mode === "group" ? `${item.submitted} de ${item.clients} respondieron` : item.submitted ? "Respondida" : "Sin respuesta"}
              {item.submitted > 0 && ` · ${item.reviewed} revisada${item.reviewed === 1 ? "" : "s"}`}
            </>
          )}
          {!isMentor && (
            <>
              {" · "}
              {item.mine ? MINE_LABEL[item.mine.status] : a.status === "published" ? "Por responder" : "No respondiste"}
              {item.mine?.score !== undefined && ` · Puntaje ${item.mine.score}`}
            </>
          )}
        </p>
      </Link>
    </Card>
  );
}
