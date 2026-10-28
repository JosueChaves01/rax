import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { getWorkspace, listMyProjects } from "@/lib/services/projects";
import { PHASE_LABEL, PHASE_ORDER } from "@/features/labels";
import { DemoTag, Empty, Heading, Meter, Tag, formatDate } from "@/shared/ui/primitives";
import { NewProjectForm } from "./new-project-form";

export const metadata = { title: "Proyectos · RAX" };

export default async function ProjectsPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  if (d.actor.role === "admin") redirect("/app/admin");
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
                        {w.project.isDemo && <DemoTag />}
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
