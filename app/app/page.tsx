import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeps, homeFor } from "@/lib/runtime";
import { getWorkspace, listMyProjects } from "@/lib/services/projects";
import { EXPERIENCE_LABEL, EXPERTISE_LABEL, PHASE_LABEL } from "@/features/labels";
import { STAGES, stageOf } from "@/features/projects/stages";
import { mentorInbox, type InboxKind } from "@/features/mentoring/inbox";
import type { MentorOnboarding } from "@/types/domain";
import { Empty, Heading, Meter, Notice, Tag, cx, formatDate } from "@/shared/ui/primitives";
import { NewProjectForm } from "./new-project-form";
import { nextAction } from "./p/[id]/next-action";

export const metadata = { title: "Proyectos · RAX" };

export default async function ProjectsPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  if (homeFor(d.actor) !== "/app") redirect(homeFor(d.actor));
  if (d.actor.onboarding?.intent === "mentor" && d.actor.role !== "mentor") return <MentorApplication status={d.actor.mentorStatus} name={d.actor.name} application={d.actor.onboarding as MentorOnboarding} />;
  const projects = await listMyProjects(d);
  const workspaces = await Promise.all(projects.map((p) => getWorkspace(d, p.id)));
  const isMentor = d.actor.role === "mentor";
  const inbox = isMentor ? mentorInbox(d.actor.id, workspaces.map((w) => ({ id: w.project.id, name: w.project.name, sessions: w.sessions, hypotheses: w.hypotheses }))) : [];
  const maxProjects = isMentor ? (d.actor.onboarding as MentorOnboarding | undefined)?.maxProjects : undefined;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Hola, {d.actor.name.split(" ")[0]}</p>
      {isMentor ? (
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Heading level={1} highlight={inbox.length === 0 ? "pendiente." : inbox.length === 1 ? "1 cosa." : `${inbox.length} cosas.`}>
            {inbox.length ? (inbox.length === 1 ? "Te espera" : "Te esperan") : "Nada"}
          </Heading>
          <div className="flex flex-wrap gap-2">
            <Link href="/app/mentor" className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-strong">
              🎛️ Cartera y próximas intervenciones →
            </Link>
            <Link href="/app/mentor/recursos" className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-panel px-4 py-2 text-xs font-semibold text-ink hover:bg-raised">
              📚 Recursos
            </Link>
          </div>
        </div>
      ) : (
        <Heading level={1} highlight="proyectos." className="mt-3">
          Tus
        </Heading>
      )}

      {isMentor && (
        <section aria-label="Bandeja" className="mt-8">
          {inbox.length === 0 ? (
            <p className="text-sm text-muted">Cuando un proyecto pida una revisión o envíe una hipótesis a aprobación, aparece acá.</p>
          ) : (
            <ul className="space-y-2">
              {inbox.map((i) => (
                <li key={`${i.kind}-${i.projectId}-${i.since}`}>
                  <Link
                    href={`/app/p/${i.projectId}/${i.tab}`}
                    className="grid gap-3 rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-accent/60 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <span>
                      <Tag color={KIND[i.kind].color}>{KIND[i.kind].label}</Tag>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{i.projectName}</span>
                      <span className="block truncate text-sm text-muted">{i.detail}</span>
                    </span>
                    <span className="font-mono text-[0.6875rem] text-faint">desde {formatDate(i.since)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <section aria-label="Lista de proyectos">
          {isMentor && (
            <h2 className="eyebrow mb-3">
              Tus proyectos{maxProjects ? ` · ${workspaces.filter((w) => w.project.status === "active").length} de ${maxProjects} cupos` : ""}
            </h2>
          )}
          {workspaces.length === 0 ? (
            <Empty title={isMentor ? "Sin asignaciones" : "Todavía no hay proyectos"}>
              {isMentor
                ? "Solo ves proyectos que la administración te asignó explícitamente."
                : "Creá tu primer proyecto con un nombre provisional. No hace falta tener la idea clara."}
            </Empty>
          ) : (
            <ul className="space-y-3">
              {workspaces.map((w) => {
                const stage = stageOf(w.phase);
                const { turn } = nextAction(w);
                const mine = (turn === "mentor") === w.isMentorView && turn !== "admin" && turn !== "none";
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
                        <Meter value={stage.n} total={STAGES.length} label={`${stage.label} · ${PHASE_LABEL[w.phase]}`} />
                      </div>
                      <p className={cx("mt-3 text-xs font-semibold", mine ? "text-accent" : "text-muted")}>
                        {turn === "none"
                          ? "Etapa concluida"
                          : mine
                            ? "Te toca a vos"
                            : turn === "admin"
                              ? "Esperando que la administración asigne mentor"
                              : turn === "mentor"
                                ? "Esperando al mentor"
                                : "Esperando al emprendedor"}
                      </p>
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

const KIND: Record<InboxKind, { label: string; color: string }> = {
  first_review: { label: "1ª revisión", color: "var(--color-highlight)" },
  hypothesis: { label: "Hipótesis", color: "var(--color-info-hypothesis)" },
  second_review: { label: "Resultados", color: "var(--color-ok)" },
};

/** Quien pidió ser mentor ve el estado de su solicitud hasta que la administración decide. */
function MentorApplication({ status, name, application: a }: { status: string; name: string; application: MentorOnboarding }) {
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
      <section aria-labelledby="sol-title" className="mt-8 rounded-2xl border border-line bg-panel p-5">
        <h2 id="sol-title" className="eyebrow">
          Lo que enviaste
        </h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {a.expertise.map((e) => (
            <Tag key={e} color="var(--color-cyan)">{EXPERTISE_LABEL[e]}</Tag>
          ))}
        </div>
        <p className="mt-3 text-sm">{a.bio}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-faint">Experiencia</dt>
            <dd>{EXPERIENCE_LABEL[a.yearsExperience]}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Rubros</dt>
            <dd>{a.sectors || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Disponibilidad</dt>
            <dd>{a.monthlyHours} h/mes</dd>
          </div>
          <div>
            <dt className="text-xs text-faint">Proyectos a la vez</dt>
            <dd>hasta {a.maxProjects}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
