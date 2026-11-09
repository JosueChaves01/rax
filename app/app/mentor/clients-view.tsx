"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ProjectMode } from "@/types/b2b";
import type { MentorProjectSummary } from "@/lib/services/mentor-projects";
import { createProjectAsMentorAction, inviteClientAction, revokeInvitationAction } from "@/app/actions/mentor";
import { Button, Card, Empty, Field, Heading, Notice, Tag, cx, formatDate, inputClass } from "@/shared/ui/primitives";
import { useAction } from "@/shared/ui/use-action";
import {
  CYCLE_STAGE_LABEL,
  INTAKE_STATUS_COLOR,
  INTAKE_STATUS_LABEL,
  INVITATION_STATUS_COLOR,
  INVITATION_STATUS_LABEL,
  MODE_LABEL,
} from "./b2b-labels";

/** «Clientes» del mentor (flujo B2B): un bloque por proyecto con invitaciones e intake. */
export function ClientsView({ projects }: { projects: MentorProjectSummary[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Tus proyectos</p>
          <Heading level={1} highlight="clientes." className="mt-2">
            Tus
          </Heading>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Crea un proyecto por cliente (o por grupo) e invítalos por correo. Cada persona acepta desde su panel y responde la entrevista previa a la
            Sesión 1.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/app/mentor/perfil" className="text-xs font-semibold text-blue-600 hover:underline">
            Mi perfil →
          </Link>
          <Button variant="primary" onClick={() => setOpen(true)}>
            Nuevo proyecto
          </Button>
        </div>
      </header>

      {projects.length === 0 ? (
        <Empty title="Todavía no tienes proyectos">Crea el primero con «Nuevo proyecto» e invita a tu cliente por correo.</Empty>
      ) : (
        <ul className="space-y-4">
          {projects.map((p) => (
            <ProjectBlock key={p.project.id} summary={p} />
          ))}
        </ul>
      )}

      {open && <NewProjectDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function ProjectBlock({ summary }: { summary: MentorProjectSummary }) {
  const { project, invitations, intakes, clients } = summary;
  const people = intakes.filter((i) => i.clientId);
  const consolidated = intakes.find((i) => !i.clientId);
  const ready = intakes.some((i) => i.status === "submitted");
  const canInviteMore = project.mode === "group" || !invitations.some((i) => i.status === "pending" || i.status === "accepted");

  return (
    <Card as="li" className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <Tag color="#4f46e5">{MODE_LABEL[project.mode]}</Tag>
            <Tag color="#0f766e">Etapa: {CYCLE_STAGE_LABEL[project.cycleStage]}</Tag>
            {ready && <Tag color="#d97706">Intake listo para revisar</Tag>}
          </p>
          <h2 className="mt-2 text-lg font-bold text-slate-900">{project.name}</h2>
          {project.description && <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{project.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/p/${project.id}/brief`}
            className={cx(
              "inline-flex h-8 items-center rounded-full px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]",
              ready ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            Ver brief
          </Link>
          <Link href={`/app/p/${project.id}`} className="text-xs font-semibold text-blue-600 hover:underline">
            Abrir proyecto →
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <section aria-label="Invitaciones">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
            {project.mode === "group" ? "Personas invitadas" : "Persona invitada"}
          </h3>
          {invitations.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Todavía no invitaste a nadie.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100">
              {invitations.map((inv) => (
                <InvitationRow key={inv.id} id={inv.id} email={inv.email} status={inv.status} createdAt={inv.createdAt} />
              ))}
            </ul>
          )}
          {canInviteMore && <InviteForm projectId={project.id} />}
        </section>

        <section aria-label="Entrevista de intake">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Entrevista de intake</h3>
          {people.length === 0 && !consolidated ? (
            <p className="mt-2 text-sm text-slate-500">
              {clients.length ? "Todavía no empezó la entrevista." : "Empieza cuando tu cliente acepte la invitación."}
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {consolidated && (
                <li className="flex items-center justify-between gap-3">
                  <span className="text-slate-800">Brief del grupo</span>
                  <Tag color={INTAKE_STATUS_COLOR[consolidated.status]}>{INTAKE_STATUS_LABEL[consolidated.status]}</Tag>
                </li>
              )}
              {people.map((i) => (
                <li key={i.clientId} className="flex items-center justify-between gap-3">
                  <span className="truncate text-slate-800">{i.clientName}</span>
                  <Tag color={INTAKE_STATUS_COLOR[i.status]}>{INTAKE_STATUS_LABEL[i.status]}</Tag>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Card>
  );
}

function InvitationRow({ id, email, status, createdAt }: { id: string; email: string; status: keyof typeof INVITATION_STATUS_LABEL; createdAt: string }) {
  const { run, pending, error } = useAction();
  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-800">{email}</p>
          <p className="text-[11px] text-slate-500">Invitada el {formatDate(createdAt)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tag color={INVITATION_STATUS_COLOR[status]}>{INVITATION_STATUS_LABEL[status]}</Tag>
          {status === "pending" && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeInvitationAction(id))}>
              {pending ? "Revocando…" : "Revocar"}
            </Button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </li>
  );
}

function InviteForm({ projectId }: { projectId: string }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const { run, pending, error } = useAction();
  const id = `invite-${projectId}`;
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(null);
        run(
          () => inviteClientAction(projectId, email),
          (r) => {
            setEmail("");
            setDone(r.ok && r.data?.notified ? "Invitación enviada. Le avisamos en su panel." : "Invitación guardada. La verá cuando entre con ese correo.");
          },
        );
      }}
    >
      <label htmlFor={id} className="sr-only">
        Correo de la persona
      </label>
      <input
        id={id}
        type="email"
        required
        className={cx(inputClass, "min-w-0 flex-1")}
        placeholder="correo@ejemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" size="sm" disabled={pending || !email.trim()}>
        {pending ? "Invitando…" : "Invitar"}
      </Button>
      {(error || done) && (
        <p className={cx("w-full text-xs", error ? "text-rose-600" : "text-emerald-700")} role={error ? "alert" : "status"}>
          {error ?? done}
        </p>
      )}
    </form>
  );
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<ProjectMode>("individual");
  const [emails, setEmails] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const { run, pending, error } = useAction();
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const list = emails
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocal(null);
    if (name.trim().length < 2) return setLocal("Ponle al menos un nombre provisional.");
    if (mode === "individual" && list.length > 1) return setLocal("Un proyecto individual es para una sola persona. Elige «Grupal» para invitar a varias.");
    run(() => createProjectAsMentorAction({ name, description, mode, clientEmails: list }), onClose);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="np-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="np-title" className="text-lg font-bold text-slate-900">
          Nuevo proyecto
        </h2>
        <p className="mt-1 text-xs text-slate-500">Al crearlo, cada persona invitada recibe la invitación en su panel y empieza su entrevista al aceptar.</p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field id="np-name" label="Nombre">
            <input ref={first} id="np-name" className={inputClass} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Panadería La Espiga" />
          </Field>
          <Field id="np-desc" label="Descripción (opcional)">
            <textarea id="np-desc" rows={2} className={inputClass} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">Tipo de proyecto</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["individual", "Individual", "Una persona: una entrevista y un brief."],
                  ["group", "Grupal", "Varias personas: una entrevista por persona y un brief del grupo."],
                ] as const
              ).map(([value, title, body]) => (
                <label
                  key={value}
                  className={cx(
                    "cursor-pointer rounded-xl border p-3 text-sm transition-colors",
                    mode === value ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400",
                  )}
                >
                  <input type="radio" name="np-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                  <span className="block font-semibold text-slate-900">{title}</span>
                  <span className="mt-0.5 block text-xs text-slate-600">{body}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field
            id="np-emails"
            label={mode === "group" ? "Correos de las personas" : "Correo de la persona"}
            hint={mode === "group" ? "Separados por comas o en líneas distintas. Puedes invitar más después." : "Puedes dejarlo vacío e invitar después."}
          >
            {mode === "group" ? (
              <textarea id="np-emails" rows={3} className={inputClass} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="ana@ejemplo.com, beto@ejemplo.com" />
            ) : (
              <input id="np-emails" type="email" className={inputClass} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="correo@ejemplo.com" />
            )}
          </Field>
          {(local ?? error) && <Notice tone="error">{local ?? error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Creando…" : "Crear e invitar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
