import Link from "next/link";
import type { ClientHome, ClientProjectCard, CycleStage, MyInvitation } from "@/types/b2b";
import type { Workspace } from "@/lib/services/projects";
import { SESSION_KIND_LABEL } from "@/features/labels";
import { InvitationActions } from "@/shared/ui/invitation-actions";
import { cx, formatDate } from "@/shared/ui/primitives";
import { ProjectCard } from "./project-card";

/**
 * Inicio de la persona cliente en el flujo B2B (RAX_B2B_FLOW): invitaciones pendientes, sus proyectos
 * con la etapa del ciclo, la entrevista pendiente, la próxima sesión y el material nuevo.
 */

const STAGE_STEPS: Array<{ key: CycleStage; label: string }> = [
  { key: "intake", label: "Entrevista" },
  { key: "kickoff", label: "Sesión 1" },
  { key: "cycle", label: "Ciclo" },
  { key: "closed", label: "Cierre" },
];

export function ClientHomeView({ firstName, email, home, legacy }: { firstName: string; email: string; home: ClientHome; legacy: Workspace[] }) {
  const empty = home.projects.length === 0 && home.invitations.length === 0 && legacy.length === 0;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Hola{firstName ? `, ${firstName}` : ""}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Aquí ves tus proyectos con tu mentor: la entrevista inicial, las sesiones y el material que te comparte.
        </p>
      </header>

      {home.invitations.length > 0 && (
        <section aria-labelledby="invitaciones" className="space-y-3">
          <h2 id="invitaciones" className="text-base font-bold text-slate-900">
            {home.invitations.length === 1 ? "Tienes una invitación" : `Tienes ${home.invitations.length} invitaciones`}
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {home.invitations.map((inv) => (
              <InvitationCard key={inv.id} inv={inv} />
            ))}
          </ul>
        </section>
      )}

      {home.projects.length > 0 && (
        <section aria-labelledby="mis-proyectos" className="space-y-3">
          <h2 id="mis-proyectos" className="text-base font-bold text-slate-900">Tus proyectos</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {home.projects.map((c) => (
              <ClientProjectTile key={c.project.id} card={c} />
            ))}
          </div>
        </section>
      )}

      {legacy.length > 0 && (
        <section aria-labelledby="anteriores" className="space-y-3">
          <h2 id="anteriores" className="text-base font-bold text-slate-900">Proyectos anteriores</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {legacy.map((w) => (
              <ProjectCard key={w.project.id} w={w} />
            ))}
          </div>
        </section>
      )}

      {empty && (
        <section className="mx-auto max-w-xl rounded-2xl border border-slate-200/80 bg-white p-6 text-center shadow-xs">
          <h2 className="text-lg font-bold text-slate-900">Todavía no tienes proyectos</h2>
          <p className="mt-2 text-sm text-slate-600">
            Cuando tu mentor te invite con este correo{email ? ` (${email})` : ""}, la invitación aparece aquí y en la campana de arriba.
          </p>
        </section>
      )}
    </div>
  );
}

function InvitationCard({ inv }: { inv: MyInvitation }) {
  return (
    <li className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5 shadow-xs">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-sky-700">Invitación</p>
      <h3 className="mt-1 text-lg font-bold text-slate-900">{inv.projectName}</h3>
      <p className="mt-1 text-sm text-slate-600">
        {inv.mentorName} te invita a trabajar este proyecto. Si aceptas, empiezas con una entrevista corta que prepara tu primera sesión.
      </p>
      <p className="mt-1 text-xs text-slate-500">Recibida el {formatDate(inv.createdAt)}</p>
      <div className="mt-4">
        <InvitationActions invitationId={inv.id} size="md" />
      </div>
    </li>
  );
}

function ClientProjectTile({ card }: { card: ClientProjectCard }) {
  const { project, intakeStatus, nextSession, newResources, mentorName } = card;
  const id = project.id;
  const stageIndex = STAGE_STEPS.findIndex((s) => s.key === project.cycleStage);
  const intakeOpen = project.cycleStage === "intake" && (intakeStatus === "not_started" || intakeStatus === "in_progress");
  const intakeSent = intakeStatus === "submitted" || intakeStatus === "reviewed";

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <p className="text-xs text-slate-500">
        Con {mentorName}
        {project.mode === "group" ? " · Proyecto grupal" : ""}
      </p>
      <h3 className="mt-1 text-lg font-bold text-slate-900">
        <Link href={`/app/p/${id}`} className="hover:text-blue-600">
          {project.name}
        </Link>
      </h3>

      <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Etapa del ciclo">
        {STAGE_STEPS.map((s, i) => (
          <li key={s.key} className="min-w-0">
            <span
              className={cx("block h-1.5 rounded-full", i < stageIndex ? "bg-blue-600" : i === stageIndex ? "bg-blue-400" : "bg-slate-200")}
              aria-hidden
            />
            <span
              className={cx("mt-1 block truncate text-[0.6875rem]", i === stageIndex ? "font-semibold text-slate-900" : "text-slate-500")}
              aria-current={i === stageIndex ? "step" : undefined}
            >
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex-1 space-y-2 text-sm">
        {intakeOpen ? (
          <Link
            href={`/app/p/${id}/intake`}
            className="group flex items-start justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white hover:bg-slate-800"
          >
            <span>
              <span className="block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-blue-200">Te toca</span>
              <span className="mt-0.5 block">{intakeStatus === "in_progress" ? "Retoma la entrevista" : "Responde la entrevista"}</span>
              <span className="mt-0.5 block text-xs text-slate-300">Unos minutos de preguntas que {mentorName.split(" ")[0]} usa para preparar la Sesión 1.</span>
            </span>
            <span aria-hidden className="mt-3 text-blue-200 transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        ) : intakeSent && project.cycleStage === "kickoff" && !nextSession?.scheduledAt ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-slate-700">Enviaste tu entrevista. Tu mentor la revisa y agenda la Sesión 1.</p>
        ) : null}

        <p className="text-slate-700">
          <span className="text-slate-500">Próxima sesión: </span>
          {nextSession
            ? `${SESSION_KIND_LABEL[nextSession.kind] ?? "Sesión"} · ${nextSession.scheduledAt ? formatDate(nextSession.scheduledAt) : "por agendar"}`
            : "ninguna por ahora"}
        </p>
        {newResources > 0 && (
          <Link href="/app/documentos" className="inline-block text-xs font-semibold text-blue-600 hover:underline">
            {newResources === 1 ? "1 material nuevo" : `${newResources} materiales nuevos`} →
          </Link>
        )}
      </div>
    </article>
  );
}
