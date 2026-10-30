import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listMyProjects } from "@/lib/services/projects";

export const metadata = { title: "Relaciones y Acuerdos · RAX" };

export default async function RelationsPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const projects = await listMyProjects(d);
  const isMentor = d.actor.role === "mentor";

  const relationsList = (
    await Promise.all(
      projects.map((p) =>
        d.repo.mentorshipRelations.list({ projectId: p.id }).catch(() => [])
      )
    )
  ).flat();

  const enrichedRelations = await Promise.all(
    relationsList.map(async (rel) => {
      const proj = projects.find((p) => p.id === rel.projectId);
      const counterpartId = isMentor ? rel.entrepreneurId : rel.mentorId;
      const counterpart = await d.repo.profiles.get(counterpartId).catch(() => null);

      const stageLabels: Record<string, string> = {
        exploration: "Exploración",
        diagnosis: "Diagnóstico",
        agreement: "Acuerdo preliminar",
        active_mentoring: "Mentoría activa",
        evaluation: "Evaluación de ciclo",
        renewed: "Ciclo renovado",
        closed: "Cerrada",
      };

      return {
        id: rel.id,
        name: counterpart?.name || (isMentor ? "Emprendedor" : "Mentor"),
        project: proj?.name || "Proyecto",
        stage: stageLabels[rel.stage] || rel.stage,
        status: rel.stage === "active_mentoring" ? "Activa" : rel.stage === "closed" ? "Cerrada" : "En proceso",
        version: rel.version,
        projectId: rel.projectId,
      };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Relaciones y acuerdos de mentoría
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestión de vínculos mentor-emprendedor, acuerdos pactados y avance de ciclo.
          </p>
        </div>
        <Link
          href="/app/exploracion"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs"
        >
          Explorar nueva mentoría
        </Link>
      </div>

      {enrichedRelations.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl mx-auto mb-3">
            🤝
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Sin relaciones de mentoría activas
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Aún no has formalizado un acuerdo de mentoría. Inicia el proceso de exploración para vincularte con un mentor o emprendedor.
          </p>
          <div className="mt-4">
            <Link
              href="/app/exploracion"
              className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-700 shadow-xs inline-block"
            >
              Iniciar exploración →
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {enrichedRelations.map((rel) => (
            <div
              key={rel.id}
              className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 truncate">
                    {rel.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                    {rel.status}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 font-mono">
                    v{rel.version}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Proyecto: <span className="font-medium text-slate-800">{rel.project}</span> • Etapa: {rel.stage}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/app/p/${rel.projectId}`}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs"
                >
                  Abrir proyecto →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
