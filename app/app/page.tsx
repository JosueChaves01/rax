import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeps, homeFor } from "@/lib/runtime";
import { loadMyWorkspaces } from "@/lib/services/pending";
import { mentorInbox } from "@/features/mentoring/inbox";
import { EXPERIENCE_LABEL, EXPERTISE_LABEL, SESSION_KIND_LABEL } from "@/features/labels";
import type { MentorOnboarding } from "@/types/domain";
import { Empty, Heading, Notice, Tag, formatDate } from "@/shared/ui/primitives";
import { NewProjectForm } from "./new-project-form";
import { ProjectCard } from "./project-card";

export const metadata = { title: "Inicio · RAX" };

export default async function ProjectsPage({ searchParams }: { searchParams?: Promise<{ borrado?: string }> }) {
  const sp = (await searchParams) ?? {};
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

  // Un proyecto dañado no puede tumbar el inicio: se omite y queda en el log.
  const workspaces = await loadMyWorkspaces(d);
  const firstName = d.actor.name.split(" ")[0] || "";

  if (d.actor.role === "mentor") {
    const inbox = mentorInbox(
      d.actor.id,
      workspaces.map((w) => ({ id: w.project.id, name: w.project.name, sessions: w.sessions, hypotheses: w.hypotheses })),
    );
    const upcoming = workspaces
      .flatMap((w) => w.sessions.filter((s) => s.mentorId === d.actor.id && s.status !== "completed" && s.scheduledAt).map((s) => ({ s, w })))
      .sort((a, b) => (a.s.scheduledAt ?? "").localeCompare(b.s.scheduledAt ?? ""))
      .slice(0, 4);

    return (
      <div className="space-y-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Hola, {firstName}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {inbox.length
                ? `${inbox.length} ${inbox.length === 1 ? "pedido espera" : "pedidos esperan"} tu respuesta.`
                : "Nada espera tu respuesta ahora."}
            </p>
          </div>
          <Link href="/app/mentor" className="text-xs font-semibold text-blue-600 hover:underline">
            Ver cartera y cupo →
          </Link>
        </header>

        <section aria-labelledby="bandeja" className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
          <h2 id="bandeja" className="text-base font-bold text-slate-900">Bandeja</h2>
          <p className="mt-0.5 text-xs text-slate-500">Revisiones e hipótesis que te pidieron, la más vieja primero.</p>
          {inbox.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Cuando un emprendedor pida una revisión o envíe una hipótesis, aparece aquí.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {inbox.map((i) => (
                <li key={`${i.kind}-${i.projectId}-${i.since}`}>
                  <Link href={`/app/p/${i.projectId}/${i.tab}`} className="group flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-600">
                        {INBOX_LABEL[i.kind]} · {i.projectName}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{i.detail}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-500">desde {formatDate(i.since)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="proyectos-mentor">
          <h2 id="proyectos-mentor" className="text-base font-bold text-slate-900">Tus proyectos ({workspaces.length})</h2>
          {workspaces.length === 0 ? (
            <div className="mt-4">
              <Empty title="Sin proyectos asignados">La administración te asigna proyectos según tu cupo y especialidades.</Empty>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {workspaces.map((w) => (
                <ProjectCard key={w.project.id} w={w} />
              ))}
            </div>
          )}
        </section>

        {upcoming.length > 0 && (
          <section aria-labelledby="proximas" className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex items-center justify-between">
              <h2 id="proximas" className="text-base font-bold text-slate-900">Próximas sesiones</h2>
              <Link href="/app/sesiones" className="text-xs font-semibold text-blue-600 hover:underline">
                Todas las sesiones →
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {upcoming.map(({ s, w }) => (
                <li key={s.id} className="flex justify-between gap-4 py-2">
                  <span className="text-slate-800">
                    {SESSION_KIND_LABEL[s.kind]} · {w.project.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{formatDate(s.scheduledAt!)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // Emprendedor
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Hola, {firstName}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Cada proyecto recorre 4 etapas: entender tu idea, orientarte con tu mentor, probar en pequeño y decidir con evidencia.
          </p>
        </div>
        {workspaces.length > 0 && (
          <Link
            href={`/app/chat?project=${workspaces[0].project.id}`}
            className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
          >
            Conversar con RAX
          </Link>
        )}
      </header>

      {sp.borrado === "1" && <Notice>Proyecto borrado. Ya no aparece para ti ni para tu mentor.</Notice>}

      {workspaces.length === 0 ? (
        <section className="mx-auto max-w-xl rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <h2 className="text-lg font-bold text-slate-900">Crea tu primer proyecto</h2>
          <p className="mt-1 text-xs text-slate-500">Solo necesitas un nombre. Después conversas con RAX para ordenar lo que sabes y lo que supones.</p>
          <NewProjectForm />
        </section>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {workspaces.map((w) => (
              <ProjectCard key={w.project.id} w={w} />
            ))}
          </div>
          <details className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5">
            <summary className="cursor-pointer select-none text-sm font-semibold text-slate-700 hover:text-slate-900">+ Nuevo proyecto</summary>
            <div className="max-w-xl">
              <NewProjectForm />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

const INBOX_LABEL = {
  first_review: "Primera revisión",
  hypothesis: "Hipótesis por aprobar",
  second_review: "Segunda revisión",
} as const;

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
      <p className="text-xs uppercase font-mono tracking-wider text-slate-500">
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
            La administración no aprobó tu solicitud por ahora. Puedes enviar una nueva con tu experiencia actualizada, o escribir al equipo del programa si
            crees que es un error.
            <Link href="/bienvenida?repostular=1" className="mt-2 block font-semibold underline">
              Volver a postularme
            </Link>
          </Notice>
        ) : (
          <Notice>
            La administración revisa tu experiencia y disponibilidad. Cuando te apruebe, verás aquí los proyectos asignados.
          </Notice>
        )}
      </div>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-xs uppercase font-mono tracking-wider text-slate-500">
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
            <dt className="text-xs text-slate-500">Experiencia</dt>
            <dd className="font-medium text-slate-800">{EXPERIENCE_LABEL[a.yearsExperience]}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Rubros</dt>
            <dd className="font-medium text-slate-800">{a.sectors || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Disponibilidad</dt>
            <dd className="font-medium text-slate-800">{a.monthlyHours} h/mes</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Cupos</dt>
            <dd className="font-medium text-slate-800">hasta {a.maxProjects}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
