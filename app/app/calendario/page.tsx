import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { listMyProjects } from "@/lib/services/projects";
import { formatDate } from "@/shared/ui/primitives";

export const metadata = { title: "Calendario · RAX" };

export default async function CalendarPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");

  const projects = await listMyProjects(d);
  const isMentor = d.actor.role === "mentor";

  const allSessions = (
    await Promise.all(
      projects.map((p) => d.repo.mentorSessions.list({ projectId: p.id }).catch(() => []))
    )
  ).flat();

  // Mapear sesiones a modelo de visualización
  const sessionItems = allSessions.map((s) => {
    const proj = projects.find((p) => p.id === s.projectId);
    return {
      id: s.id,
      date: s.scheduledAt ? formatDate(s.scheduledAt) : "Sin fecha fija",
      time: s.scheduledAt ? new Date(s.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Por coordinar",
      title: proj?.name || "Proyecto Activo",
      topic: s.preSessionBriefing?.suggestedAgenda?.[0] || `Sesión de ${s.kind || "mentoría"}`,
      status: s.status === "completed" ? "Completada" : "Programada",
      href: `/app/sesiones`,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Calendario de mentorías
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Encuentros virtuales programados, recordatorios y enlaces de conexión.
          </p>
        </div>
        <Link
          href="/app/sesiones"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs"
        >
          {isMentor ? "+ Programar nueva sesión" : "Ver sesiones activas"}
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
        <h2 className="text-base font-bold text-slate-900">
          Próximos encuentros
        </h2>

        {sessionItems.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No tienes sesiones programadas en este momento.
          </div>
        ) : (
          <div className="space-y-3">
            {sessionItems.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                    {s.date} • {s.time}
                  </span>
                  <p className="text-xs font-bold text-slate-900 mt-1">
                    {s.title}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {s.topic}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      s.status === "Completada"
                        ? "bg-slate-100 text-slate-700"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {s.status}
                  </span>
                  <Link
                    href={s.href}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                  >
                    Abrir sesión →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
