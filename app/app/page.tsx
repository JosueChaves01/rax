import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeps, homeFor } from "@/lib/runtime";
import { getWorkspace, listMyProjects } from "@/lib/services/projects";
import { PHASE_LABEL, PHASE_ORDER } from "@/features/labels";
import { Empty, Heading, Meter, Notice, Tag, formatDate } from "@/shared/ui/primitives";
import { NewProjectForm } from "./new-project-form";

export const metadata = { title: "Proyectos · RAX" };

export default async function ProjectsPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  if (homeFor(d.actor) !== "/app") redirect(homeFor(d.actor));
  if (d.actor.onboarding?.intent === "mentor" && d.actor.role !== "mentor") return <MentorApplication status={d.actor.mentorStatus} name={d.actor.name} />;
  const projects = await listMyProjects(d);
  const workspaces = await Promise.all(projects.map((p) => getWorkspace(d, p.id)));
  const isMentor = d.actor.role === "mentor";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Hola, {d.actor.name.split(" ")[0]}</p>
      <Heading level={1} highlight={isMentor ? "asignados." : "proyectos."} className="mt-3">
        {isMentor ? "Proyectos" : "Tus"}
      </Heading>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <section aria-label="Lista de proyectos">
          {workspaces.length === 0 ? (
            <Empty title={isMentor ? "Sin asignaciones" : "Todavía no hay proyectos"}>
              {isMentor
                ? "Solo ves proyectos que la administración te asignó explícitamente."
                : "Creá tu primer proyecto con un nombre provisional. No hace falta tener la idea clara."}
            </Empty>
          ) : (
            <ul className="space-y-3">
              {workspaces.map((w) => {
                const idx = PHASE_ORDER.indexOf(w.phase) + 1;
                return (
                  <li key={w.project.id}>
                    <Link
                      href={`/app/p/${w.project.id}`}
                      className="block rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-accent/60"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {w.isMentorView && <Tag color="var(--color-cyan)">Mentoría asignada</Tag>}
                        {w.project.status !== "active" && <Tag color="var(--color-highlight)">{w.project.status === "paused" ? "Pausado" : "Archivado"}</Tag>}
                        <span className="ml-auto font-mono text-[0.6875rem] text-faint">Actualizado {formatDate(w.project.updatedAt)}</span>
                      </div>
                      <h2 className="display mt-3 text-3xl">{w.project.name}</h2>
                      {w.project.description && <p className="mt-1 text-sm text-muted">{w.project.description}</p>}
                      <div className="mt-4">
                        <Meter value={idx} total={PHASE_ORDER.length} label={PHASE_LABEL[w.phase]} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {!isMentor && (
          <aside aria-labelledby="nuevo-titulo" className="h-fit rounded-2xl border border-line bg-panel p-5">
            <h2 id="nuevo-titulo" className="display text-2xl">
              Nuevo <span className="text-highlight">proyecto</span>
            </h2>
            <p className="mt-1 text-sm text-muted">Un nombre provisional alcanza. Lo demás lo vamos ordenando en la conversación.</p>
            <NewProjectForm />
          </aside>
        )}
      </div>
    </main>
  );
}

/** Quien pidió ser mentor ve el estado de su solicitud hasta que la administración decide. */
function MentorApplication({ status, name }: { status: string; name: string }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Hola, {name.split(" ")[0]}</p>
      <Heading level={1} highlight={status === "rejected" ? "no fue aprobada." : "está en revisión."} className="mt-3">
        Tu solicitud de mentoría
      </Heading>
      <div className="mt-8">
        {status === "rejected" ? (
          <Notice tone="warn">La administración no aprobó tu solicitud por ahora. Si creés que es un error, escribile al equipo del programa.</Notice>
        ) : (
          <Notice>
            La administración revisa tu experiencia y disponibilidad. Cuando te apruebe, vas a ver acá los proyectos que te asigne. No hace falta que hagas
            nada más.
          </Notice>
        )}
      </div>
    </main>
  );
}
