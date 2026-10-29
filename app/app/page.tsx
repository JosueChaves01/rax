import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeps, homeFor } from "@/lib/runtime";
import { getWorkspace, listMyProjects } from "@/lib/services/projects";
import { getMentorPortfolio } from "@/lib/services/portfolio";
import { EXPERIENCE_LABEL, EXPERTISE_LABEL } from "@/features/labels";
import type { MentorOnboarding } from "@/types/domain";
import { Empty, Heading, Notice, Tag } from "@/shared/ui/primitives";
import { MentorDashboard } from "@/shared/ui/mentor-dashboard";
import { EntrepreneurDashboard } from "@/shared/ui/entrepreneur-dashboard";
import { NewProjectForm } from "./new-project-form";

export const metadata = { title: "Dashboard · RAX" };

export default async function ProjectsPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  if (homeFor(d.actor) !== "/app") redirect(homeFor(d.actor));
  if (d.actor.onboarding?.intent === "mentor" && d.actor.role !== "mentor") {
    return (
      <MentorApplication
        status={d.actor.mentorStatus}
        name={d.actor.name}
        application={d.actor.onboarding as MentorOnboarding}
      />
    );
  }

  const projects = await listMyProjects(d);
  const workspaces = await Promise.all(projects.map((p) => getWorkspace(d, p.id)));
  const isMentor = d.actor.role === "mentor";

  if (isMentor) {
    const portfolio = await getMentorPortfolio(d);
    return (
      <div className="space-y-10">
        <MentorDashboard mentorName={d.actor.name} portfolio={portfolio} />

        {/* Sección adicional: Proyectos asignados directamente */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h2 className="text-base font-bold text-slate-900">
              Proyectos bajo tu tutela ({workspaces.length})
            </h2>
            <Link
              href="/app/mentor"
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Ver matriz de cartera completa →
            </Link>
          </div>

          {workspaces.length === 0 ? (
            <Empty title="Sin asignaciones activas">
              La administración te asignará proyectos cuando los emprendedores completen su diagnóstico.
            </Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workspaces.map((w) => (
                <Link
                  key={w.project.id}
                  href={`/app/p/${w.project.id}`}
                  className="p-4 rounded-xl border border-slate-200/80 hover:border-blue-400 bg-slate-50/50 hover:bg-white transition-all shadow-2xs group block"
                >
                  <p className="text-xs font-bold text-slate-900 group-hover:text-blue-600 truncate">
                    {w.project.name}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
                    {w.project.description || "Sin descripción proporcionada"}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100 pt-2 font-mono">
                    <span>Etapa: {w.phase}</span>
                    <span className="text-blue-600 font-semibold group-hover:underline">Abrir →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Si es Emprendedor (Panel 2 del Mock)
  const mentorName = workspaces[0]?.mentorshipRelation?.mentorId
    ? "Carlos Méndez"
    : "Carlos Méndez (Asignado)";

  return (
    <div className="space-y-10">
      <EntrepreneurDashboard
        entrepreneurName={d.actor.name}
        mentorName={mentorName}
        workspaces={workspaces}
      />

      {/* Creación de proyecto si no tiene */}
      {workspaces.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs max-w-xl mx-auto">
          <h2 className="text-lg font-bold text-slate-900">
            Crea tu primer proyecto
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Solo necesitas un nombre para empezar a ordenar tu iniciativa con RAX.
          </p>
          <div className="mt-4">
            <NewProjectForm />
          </div>
        </div>
      )}
    </div>
  );
}

function MentorApplication({
  status,
  name,
  application: a,
}: {
  status: string;
  name: string;
  application: MentorOnboarding;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-xs uppercase font-mono tracking-wider text-slate-400">
        Hola, {name.split(" ")[0]}
      </p>
      <Heading
        level={1}
        highlight={status === "rejected" ? "no fue aprobada." : "está en revisión."}
        className="mt-3 text-slate-900"
      >
        Tu solicitud de mentoría
      </Heading>
      <div className="mt-8">
        {status === "rejected" ? (
          <Notice tone="warn">
            La administración no aprobó tu solicitud por ahora. Si crees que es un error, escribe al equipo del programa.
          </Notice>
        ) : (
          <Notice>
            La administración revisa tu experiencia y disponibilidad. Cuando te apruebe, verás aquí los proyectos asignados.
          </Notice>
        )}
      </div>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-xs uppercase font-mono tracking-wider text-slate-400">
          Lo que enviaste
        </h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {a.expertise.map((e) => (
            <Tag key={e} color="#0284c7">
              {EXPERTISE_LABEL[e]}
            </Tag>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-700">{a.bio}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 border-t border-slate-100 pt-4">
          <div>
            <dt className="text-xs text-slate-400">Experiencia</dt>
            <dd className="font-medium text-slate-800">{EXPERIENCE_LABEL[a.yearsExperience]}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Rubros</dt>
            <dd className="font-medium text-slate-800">{a.sectors || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Disponibilidad</dt>
            <dd className="font-medium text-slate-800">{a.monthlyHours} h/mes</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Cupos</dt>
            <dd className="font-medium text-slate-800">hasta {a.maxProjects}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
