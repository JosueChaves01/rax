import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeps, homeFor } from "@/lib/runtime";
import { adminOverview } from "@/lib/services/admin";
import { EXPERIENCE_LABEL, EXPERTISE_LABEL, GOAL_LABEL, MENTOR_STATUS_LABEL, NATURE_LABEL, PROJECT_STATUS_LABEL, ROLE_LABEL, WEEKLY_HOURS_LABEL } from "@/features/labels";
import type { EntrepreneurOnboarding, MentorOnboarding, Profile } from "@/types/domain";
import { Card, Empty, Heading, Tag, cx, formatDate } from "@/shared/ui/primitives";
import { suggestMentor } from "@/features/mentoring/inbox";
import { AssignmentControls } from "./assignment-controls";
import { MentorReview } from "./mentor-review";

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
  const tab: TabId = TABS.some((t) => t.id === ver) ? (ver as TabId) : "asignaciones";
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
  const waiting = o.projects.filter((p) => p.status === "active" && !hasMentor(p.id));
  // Primero los proyectos que esperan mentor: son los que frenan a alguien.
  const projects = [...o.projects].sort((a, b) => Number(hasMentor(a.id)) - Number(hasMentor(b.id)));
  const freeSlots = mentors.reduce((n, m) => {
    const l = o.mentorLoad[m.id];
    return n + (l?.max != null ? Math.max(0, l.max - l.active) : 0);
  }, 0);
  const suggestionFor = (ownerId: string) =>
    suggestMentor(
      founderInfo(byId.get(ownerId))?.sector,
      mentors.map((m) => ({ id: m.id, sectors: mentorInfo(m)?.sectors ?? "", active: o.mentorLoad[m.id]?.active ?? 0, max: o.mentorLoad[m.id]?.max ?? null })),
    );
  const kpis = [
    { n: waiting.length, label: "Proyectos esperando mentor", tab: "asignaciones" as const, alert: waiting.length > 0 },
    { n: o.pendingMentors.length, label: "Solicitudes de mentoría", tab: "solicitudes" as const, alert: o.pendingMentors.length > 0 },
    { n: freeSlots, label: "Cupos libres declarados por mentores", tab: "asignaciones" as const, alert: false },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6">
      <div>
        <Heading level={1} highlight="del programa.">Panel</Heading>
        <p className="mt-4 max-w-3xl text-sm text-muted">
          Gestionás personas, solicitudes de mentoría y asignaciones. No ves el contenido de los proyectos: solo nombre, dueño, estado y lo que cada
          persona contó en su bienvenida.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {kpis.map((k) => (
            <li key={k.label}>
              <Link
                href={`/app/admin?ver=${k.tab}`}
                className={cx("block rounded-2xl border bg-panel p-5 transition-colors hover:border-line-strong", k.alert ? "border-accent/50" : "border-line")}
              >
                <span className={cx("display block text-5xl", k.alert ? "text-accent" : "")}>{k.n}</span>
                <span className="mt-1 block text-sm text-muted">{k.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <nav aria-label="Secciones del panel" className="-mx-4 mt-8 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-1 border-b border-line">
            {TABS.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/admin?ver=${t.id}`}
                  aria-current={t.id === tab ? "page" : undefined}
                  className={cx(
                    "relative inline-flex h-11 items-center gap-2 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em]",
                    t.id === tab ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {t.label}
                  {t.id === "solicitudes" && o.pendingMentors.length > 0 && (
                    <span className="rounded-full bg-accent px-1.5 font-mono text-[0.625rem] leading-4 text-white">{o.pendingMentors.length}</span>
                  )}
                  {t.id === tab && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded bg-accent" />}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {tab === "solicitudes" && (
        <section aria-labelledby="apps-title" className="space-y-3">
          <h2 id="apps-title" className="eyebrow">Solicitudes de mentoría ({o.pendingMentors.length})</h2>
          {o.pendingMentors.length === 0 ? (
            <Empty title="Sin solicitudes pendientes">Cuando alguien elija «Quiero acompañar como mentor/a» en su bienvenida, aparece acá para que lo revises.</Empty>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {o.pendingMentors.map((p) => {
                const info = mentorInfo(p);
                return (
                  <Card as="li" key={p.id} className="p-5">
                    <p className="display text-2xl">{p.name}</p>
                    <p className="text-xs text-faint">
                      {p.email} · desde {formatDate(p.onboardedAt ?? p.createdAt)}
                    </p>
                    {info && (
                      <>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {info.expertise.map((e) => (
                            <Tag key={e} color="var(--color-cyan)">{EXPERTISE_LABEL[e]}</Tag>
                          ))}
                        </div>
                        <p className="mt-3 text-sm">{info.bio}</p>
                        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                          <div><dt className="text-faint">Experiencia</dt><dd>{EXPERIENCE_LABEL[info.yearsExperience]}</dd></div>
                          <div><dt className="text-faint">Rubros</dt><dd>{info.sectors || "—"}</dd></div>
                          <div><dt className="text-faint">Disponibilidad</dt><dd>{info.monthlyHours} h/mes</dd></div>
                          <div><dt className="text-faint">Proyectos a la vez</dt><dd>hasta {info.maxProjects}</dd></div>
                        </dl>
                        {info.linkedinUrl && (
                          <a href={info.linkedinUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-cyan underline">
                            Ver LinkedIn
                          </a>
                        )}
                      </>
                    )}
                    <MentorReview profileId={p.id} />
                  </Card>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "asignaciones" && (
        <section aria-labelledby="proj-title" className="space-y-3">
          <h2 id="proj-title" className="eyebrow">Proyectos y mentores</h2>
          {o.projects.length === 0 ? (
            <Empty title="Todavía no hay proyectos">Aparecen cuando una persona emprendedora completa su bienvenida.</Empty>
          ) : (
            <ul className="space-y-3">
              {projects.map((p) => {
                const founder = founderInfo(byId.get(p.ownerId));
                const waits = p.status === "active" && !hasMentor(p.id);
                return (
                  <Card as="li" key={p.id} className={cx("p-4", waits && "border-accent/50")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="display text-2xl">{p.name}</p>
                      {waits && <Tag color="var(--color-accent)">Esperando mentor</Tag>}
                      <span className="ml-auto text-xs text-faint">
                        Dueño: {name(p.ownerId)} · {PROJECT_STATUS_LABEL[p.status]}
                      </span>
                    </div>
                    {founder && (
                      <p className="mt-2 text-sm text-muted">
                        {founder.sector || "Rubro sin indicar"} · {NATURE_LABEL[founder.stage]} · {WEEKLY_HOURS_LABEL[founder.weeklyHours].toLowerCase()} por semana · Busca:{" "}
                        {founder.goals.map((g) => GOAL_LABEL[g].toLowerCase()).join(", ")}
                      </p>
                    )}
                    <AssignmentControls
                      projectId={p.id}
                      mentors={mentorOptions}
                      suggested={suggestionFor(p.ownerId)}
                      active={o.assignments
                        .filter((a) => a.projectId === p.id && a.status === "active")
                        .map((a) => ({ id: a.id, mentorName: name(a.mentorId), mentorId: a.mentorId, since: a.createdAt }))}
                    />
                  </Card>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {tab === "personas" && (
        <section aria-labelledby="people-title" className="space-y-3">
          <h2 id="people-title" className="eyebrow">Personas</h2>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-panel text-xs uppercase tracking-[0.1em] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Nombre</th>
                  <th scope="col" className="px-4 py-3">Correo</th>
                  <th scope="col" className="px-4 py-3">Rol</th>
                  <th scope="col" className="px-4 py-3">Mentoría</th>
                  <th scope="col" className="px-4 py-3">Bienvenida</th>
                </tr>
              </thead>
              <tbody>
                {o.profiles.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-3">{p.name}</td>
                    <td className="px-4 py-3 text-muted">{p.email}</td>
                    <td className="px-4 py-3">{ROLE_LABEL[p.role]}</td>
                    <td className="px-4 py-3 text-muted">
                      {p.role === "mentor" ? `${o.mentorLoad[p.id]?.active ?? 0}/${o.mentorLoad[p.id]?.max ?? "?"} proyectos` : MENTOR_STATUS_LABEL[p.mentorStatus]}
                    </td>
                    <td className="px-4 py-3 text-muted">{p.onboardedAt ? formatDate(p.onboardedAt) : "Pendiente"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "auditoria" && (
        <section aria-labelledby="audit-title" className="space-y-3">
          <h2 id="audit-title" className="eyebrow">Auditoría de permisos y accesos</h2>
          {o.audit.length === 0 ? (
            <p className="text-sm text-muted">Sin eventos todavía.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {o.audit.map((e) => (
                <li key={e.id} className="flex flex-wrap gap-x-3 border-b border-line py-2">
                  <span className="font-mono text-xs text-faint">{formatDate(e.createdAt)}</span>
                  <span className="font-semibold">{name(String(e.actorId))}</span>
                  <span className="text-muted">{AUDIT_LABEL[e.action] ?? e.action}</span>
                  {e.meta?.action && <span className="text-xs text-danger">({String(e.meta.action)})</span>}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}
