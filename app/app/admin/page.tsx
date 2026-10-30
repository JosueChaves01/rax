import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeps, homeFor } from "@/lib/runtime";
import { adminOverview } from "@/lib/services/admin";
import { EXPERIENCE_LABEL, EXPERTISE_LABEL, GOAL_LABEL, MENTOR_STATUS_LABEL, NATURE_LABEL, PROJECT_STATUS_LABEL, ROLE_LABEL, WEEKLY_HOURS_LABEL } from "@/features/labels";
import type { EntrepreneurOnboarding, MentorOnboarding, Profile } from "@/types/domain";
import { Empty, Tag, cx, formatDate } from "@/shared/ui/primitives";
import { suggestMentor } from "@/features/mentoring/inbox";
import { AssignmentControls } from "./assignment-controls";
import { MentorReview } from "./mentor-review";
import { AdminOperationsView } from "@/shared/ui/admin-operations-view";

export const metadata = { title: "Administración · RAX" };

const AUDIT_LABEL: Record<string, string> = {
  "mentor.assigned": "asignó un mentor",
  "mentor.revoked": "revocó una asignación",
  "mentor.applied": "pidió ser mentor/a",
  "mentor.approved": "aprobó una solicitud de mentoría",
  "mentor.rejected": "rechazó una solicitud de mentoría",
  "access.denied": "intentó un acceso no permitido",
  "project.created": "creó un proyecto",
  "member.added": "sumó a una persona a un proyecto",
};

const mentorInfo = (p: Profile) => (p.onboarding?.intent === "mentor" ? (p.onboarding as MentorOnboarding) : undefined);
const founderInfo = (p?: Profile) => (p?.onboarding?.intent === "entrepreneur" ? (p.onboarding as EntrepreneurOnboarding) : undefined);

const TABS = [
  { id: "operaciones", label: "Operaciones e Integraciones" },
  { id: "asignaciones", label: "Asignaciones" },
  { id: "solicitudes", label: "Solicitudes" },
  { id: "personas", label: "Personas" },
  { id: "auditoria", label: "Auditoría" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  if (d.actor.role !== "admin") redirect(homeFor(d.actor));
  const o = await adminOverview(d);
  const { ver } = await searchParams;
  const tab: TabId = TABS.some((t) => t.id === ver) ? (ver as TabId) : "operaciones";
  const byId = new Map(o.profiles.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? (id === "system" ? "Sistema" : id === "ai" ? "IA" : "Persona");
  const mentors = o.profiles.filter((p) => p.role === "mentor");
  const mentorOptions = mentors.map((p) => {
    const info = mentorInfo(p);
    const load = o.mentorLoad[p.id];
    const areas = info?.expertise.map((e) => EXPERTISE_LABEL[e].split(" ")[0]).join(", ");
    return { id: p.id, name: `${p.name}${areas ? ` · ${areas}` : ""} · ${load?.active ?? 0}/${load?.max ?? "?"} proyectos`, full: load?.max != null && load.active >= load.max };
  });
  const hasMentor = (projectId: string) => o.assignments.some((a) => a.projectId === projectId && a.status === "active");
  const projects = [...o.projects].sort((a, b) => Number(hasMentor(a.id)) - Number(hasMentor(b.id)));
  const suggestionFor = (ownerId: string) =>
    suggestMentor(
      founderInfo(byId.get(ownerId))?.sector,
      mentors.map((m) => ({ id: m.id, sectors: mentorInfo(m)?.sectors ?? "", active: o.mentorLoad[m.id]?.active ?? 0, max: o.mentorLoad[m.id]?.max ?? null })),
    );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Operaciones y Administración
        </h1>
        <p className="mt-1 text-xs text-slate-500 max-w-3xl">
          Monitoreo de integraciones n8n, consumo de OpenRouter, auditoría de accesos y asignación de mentores.
        </p>

        {/* Barra de pestañas */}
        <nav aria-label="Secciones del panel" className="mt-6 border-b border-slate-200">
          <ul className="flex min-w-max gap-2">
            {TABS.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/admin?ver=${t.id}`}
                  aria-current={t.id === tab ? "page" : undefined}
                  className={cx(
                    "relative inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold transition-colors",
                    t.id === tab
                      ? "text-blue-600 border-b-2 border-blue-600 font-bold"
                      : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {t.label}
                  {t.id === "solicitudes" && o.pendingMentors.length > 0 && (
                    <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[10px] text-white font-mono">
                      {o.pendingMentors.length}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {tab === "operaciones" && (
        <AdminOperationsView
          totalExecutions={o.audit.length}
          estimatedCost="$0.00"
          successRate={
            o.audit.length > 0
              ? `${Math.round(
                  (o.audit.filter((a) => !a.action.includes("denied")).length / o.audit.length) * 100
                )}%`
              : "100%"
          }
          initialRuns={o.audit.slice(0, 10).map((a) => ({
            workflow: AUDIT_LABEL[a.action] || a.action,
            status: a.action.includes("denied") ? "failed" : "completed",
            statusLabel: a.action.includes("denied") ? "Denegado" : "Completado",
            date: formatDate(a.createdAt),
          }))}
        />
      )}

      {tab === "solicitudes" && (
        <section aria-labelledby="apps-title" className="space-y-4">
          <h2 id="apps-title" className="text-xs uppercase font-mono tracking-wider text-slate-500">
            Solicitudes de mentoría ({o.pendingMentors.length})
          </h2>
          {o.pendingMentors.length === 0 ? (
            <Empty title="Sin solicitudes pendientes">
              Cuando alguien elija «Quiero acompañar como mentor/a» en su bienvenida, aparece acá para que lo revises.
            </Empty>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {o.pendingMentors.map((p) => {
                const info = mentorInfo(p);
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                    <p className="text-lg font-bold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.email} · desde {formatDate(p.onboardedAt ?? p.createdAt)}
                    </p>
                    {info && (
                      <>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {info.expertise.map((e) => (
                            <Tag key={e} color="#0284c7">{EXPERTISE_LABEL[e]}</Tag>
                          ))}
                        </div>
                        <p className="mt-3 text-xs text-slate-600">{info.bio}</p>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 border-t border-slate-100 pt-3">
                          <div><dt className="text-slate-500">Experiencia</dt><dd className="font-medium text-slate-800">{EXPERIENCE_LABEL[info.yearsExperience]}</dd></div>
                          <div><dt className="text-slate-500">Rubros</dt><dd className="font-medium text-slate-800">{info.sectors || "—"}</dd></div>
                          <div><dt className="text-slate-500">Disponibilidad</dt><dd className="font-medium text-slate-800">{info.monthlyHours} h/mes</dd></div>
                          <div><dt className="text-slate-500">Cupos</dt><dd className="font-medium text-slate-800">hasta {info.maxProjects}</dd></div>
                        </dl>
                        {info.linkedinUrl && (
                          <a href={info.linkedinUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs text-blue-600 underline">
                            Ver LinkedIn
                          </a>
                        )}
                      </>
                    )}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <MentorReview profileId={p.id} />
                    </div>
                  </div>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "asignaciones" && (
        <section aria-labelledby="proj-title" className="space-y-4">
          <h2 id="proj-title" className="text-xs uppercase font-mono tracking-wider text-slate-500">
            Proyectos y mentores asignados
          </h2>
          {o.projects.length === 0 ? (
            <Empty title="Todavía no hay proyectos">Aparecen cuando una persona emprendedora completa su bienvenida.</Empty>
          ) : (
            <ul className="space-y-3">
              {projects.map((p) => {
                const founder = founderInfo(byId.get(p.ownerId));
                const waits = p.status === "active" && !hasMentor(p.id);
                return (
                  <div key={p.id} className={cx("bg-white rounded-2xl border p-5 shadow-xs", waits ? "border-amber-300 bg-amber-50/20" : "border-slate-200")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-bold text-slate-900">{p.name}</p>
                      {waits && <Tag color="#f59e0b">Esperando mentor</Tag>}
                      <span className="ml-auto text-xs text-slate-500">
                        Dueño: {name(p.ownerId)} · {PROJECT_STATUS_LABEL[p.status]}
                      </span>
                    </div>
                    {founder && (
                      <p className="mt-2 text-xs text-slate-600">
                        {founder.sector || "Rubro sin indicar"} · {NATURE_LABEL[founder.stage]} · {WEEKLY_HOURS_LABEL[founder.weeklyHours].toLowerCase()} por semana · Busca:{" "}
                        {founder.goals.map((g) => GOAL_LABEL[g].toLowerCase()).join(", ")}
                      </p>
                    )}
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <AssignmentControls
                        projectId={p.id}
                        mentors={mentorOptions}
                        suggested={suggestionFor(p.ownerId)}
                        active={o.assignments
                          .filter((a) => a.projectId === p.id && a.status === "active")
                          .map((a) => ({ id: a.id, mentorName: name(a.mentorId), mentorId: a.mentorId, since: a.createdAt }))}
                      />
                    </div>
                  </div>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "personas" && (
        <section aria-labelledby="people-title" className="space-y-4">
          <h2 id="people-title" className="text-xs uppercase font-mono tracking-wider text-slate-500">
            Personas registradas
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th scope="col" className="px-4 py-3">Nombre</th>
                  <th scope="col" className="px-4 py-3">Correo</th>
                  <th scope="col" className="px-4 py-3">Rol</th>
                  <th scope="col" className="px-4 py-3">Mentoría</th>
                  <th scope="col" className="px-4 py-3">Bienvenida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {o.profiles.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{p.name}</td>
                    <td className="px-4 py-3 text-slate-500">{p.email}</td>
                    <td className="px-4 py-3 font-medium">{ROLE_LABEL[p.role]}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {p.role === "mentor" ? `${o.mentorLoad[p.id]?.active ?? 0}/${o.mentorLoad[p.id]?.max ?? "?"} cupos` : MENTOR_STATUS_LABEL[p.mentorStatus]}
                    </td>
                    <td className="px-4 py-3 text-slate-500 font-mono">{p.onboardedAt ? formatDate(p.onboardedAt) : "Pendiente"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "auditoria" && (
        <section aria-labelledby="audit-title" className="space-y-4">
          <h2 id="audit-title" className="text-xs uppercase font-mono tracking-wider text-slate-500">
            Auditoría de eventos y seguridad
          </h2>
          {o.audit.length === 0 ? (
            <p className="text-xs text-slate-500">Sin eventos todavía.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs divide-y divide-slate-100 p-2">
              {o.audit.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-3 p-3 text-xs">
                  <span className="font-mono text-slate-400">{formatDate(e.createdAt)}</span>
                  <span className="font-bold text-slate-900">{name(String(e.actorId))}</span>
                  <span className="text-slate-600">{AUDIT_LABEL[e.action] ?? e.action}</span>
                  {e.meta?.action && <span className="text-rose-600 font-mono">({String(e.meta.action)})</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
