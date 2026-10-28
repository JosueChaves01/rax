import { redirect } from "next/navigation";
import { getDeps } from "@/lib/runtime";
import { adminOverview } from "@/lib/services/admin";
import { ROLE_LABEL } from "@/features/labels";
import { Card, DemoTag, Heading, Notice, formatDate } from "@/shared/ui/primitives";
import { AssignmentControls } from "./assignment-controls";

export const metadata = { title: "Administración · RAX" };

export default async function AdminPage() {
  const d = await getDeps();
  if (!d) redirect("/entrar");
  if (d.actor.role !== "admin") redirect("/app");
  const o = await adminOverview(d);
  const name = (id: string) => o.profiles.find((p) => p.id === id)?.name ?? (id === "system" ? "Sistema" : id);
  const mentors = o.profiles.filter((p) => p.role === "mentor").map((p) => ({ id: p.id, name: p.name }));

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
      <Heading level={1} highlight="y asignaciones.">Personas</Heading>
      <Notice>La administración gestiona personas y asignaciones de mentoría. No ve el contenido de los proyectos: solo nombre, dueño y estado.</Notice>

      <section aria-labelledby="proj-title" className="space-y-3">
        <h2 id="proj-title" className="eyebrow">Proyectos y mentores</h2>
        <ul className="space-y-3">
          {o.projects.map((p) => (
            <Card as="li" key={p.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                {p.isDemo && <DemoTag />}
                <p className="display text-2xl">{p.name}</p>
                <span className="ml-auto text-xs text-faint">Dueño: {name(p.ownerId)} · {p.status}</span>
              </div>
              <AssignmentControls
                projectId={p.id}
                mentors={mentors}
                active={o.assignments.filter((a) => a.projectId === p.id && a.status === "active").map((a) => ({ id: a.id, mentorName: name(a.mentorId), mentorId: a.mentorId, since: a.createdAt }))}
              />
            </Card>
          ))}
        </ul>
      </section>

      <section aria-labelledby="people-title" className="space-y-3">
        <h2 id="people-title" className="eyebrow">Personas</h2>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-panel text-xs uppercase tracking-[0.1em] text-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Nombre</th>
                <th scope="col" className="px-4 py-3">Correo</th>
                <th scope="col" className="px-4 py-3">Rol</th>
              </tr>
            </thead>
            <tbody>
              {o.profiles.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3 text-muted">{p.email}</td>
                  <td className="px-4 py-3">{ROLE_LABEL[p.role]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="audit-title" className="space-y-3">
        <h2 id="audit-title" className="eyebrow">Auditoría de permisos y accesos</h2>
        <ol className="space-y-1 text-sm">
          {o.audit.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-3 border-b border-line py-2">
              <span className="font-mono text-xs text-faint">{formatDate(e.createdAt)}</span>
              <span className="font-semibold">{name(String(e.actorId))}</span>
              <span className="text-muted">{e.action}</span>
              {e.meta?.action && <span className="text-xs text-danger">intentó {String(e.meta.action)}</span>}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
