-- ════════════════════════════════════════════════════════════════════
-- RAX · Onboarding por tipo de usuario, aprobación de mentores y ajustes
-- para que el servidor (Next.js) sea quien arma cada proyecto.
-- ════════════════════════════════════════════════════════════════════

-- ── Onboarding ─────────────────────────────────────────────────────
-- intent: cómo dijo la persona que usará RAX. mentor_status: la solicitud para ser mentor
-- la aprueba la administración; nadie se autodeclara mentor.
alter table public.profiles
  add column onboarding jsonb not null default '{}'::jsonb check (pg_column_size(onboarding) < 8192),
  add column onboarded_at timestamptz,
  add column mentor_status text not null default 'none' check (mentor_status in ('none', 'pending', 'approved', 'rejected'));

comment on column public.profiles.onboarding is 'Respuestas del onboarding (por rol). Sin datos sensibles.';

-- El rol y la aprobación como mentor solo los cambia la administración.
-- La persona puede pasar de none/rejected a pending (pedir ser mentor) y nada más.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'Solo la administración cambia roles' using errcode = '42501';
  end if;
  if new.mentor_status is distinct from old.mentor_status
     and not (new.mentor_status = 'pending' and old.mentor_status in ('none', 'rejected')) then
    raise exception 'Solo la administración aprueba mentores' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'El correo se cambia desde la cuenta' using errcode = '42501';
  end if;
  return new;
end $$;

-- Ya no hay modo de demostración: todos los datos son reales.
alter table public.projects drop column if exists is_demo;

-- ── Proyecto: el servidor crea membresía, conversación, diagnóstico y primer mensaje ──
-- Antes lo hacía un trigger; ahora el servidor (con la service role) crea esas filas con sus
-- propios ids para que dominio y base coincidan. Quien llame directo a la API solo crea el proyecto.
drop trigger if exists projects_bootstrap on public.projects;
drop function if exists public.bootstrap_project();

-- Solo quien terminó el onboarding como emprendedor crea proyectos.
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated with check (
  owner_id = auth.uid()
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'entrepreneur' and onboarded_at is not null)
);

-- El primer mensaje de cada conversación es texto fijo de la plataforma (no generado por un modelo):
-- autor asistente sin proveedor. Las respuestas de un modelo siempre llevan proveedor (lo exige el servidor).
alter table public.messages drop constraint if exists messages_check1;

-- ── Historial: el trigger registra cada cambio; el servidor completa el tipo exacto y el motivo ──
comment on table public.diagnosis_item_history is
  'Una fila por cambio, escrita por trigger. El servidor (service role) puede precisar change, actor y reason.';

-- Al crear un proyecto, `insert … returning` (lo que hace supabase-js con .select()) evalúa la política
-- de lectura sobre la fila nueva; las funciones auxiliares todavía no la ven en esa misma sentencia.
-- La condición de dueño va directa sobre la fila.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (
  owner_id = auth.uid() or public.can_read_project(id) or public.is_admin()
);

-- La administración también ve en la auditoría las solicitudes y aprobaciones de mentoría.
drop policy if exists audit_select on public.audit_events;
create policy audit_select on public.audit_events for select to authenticated using (
  public.is_admin() and action in ('mentor.assigned', 'mentor.revoked', 'mentor.applied', 'mentor.approved',
                                   'mentor.rejected', 'access.denied', 'project.created', 'member.added')
  or (project_id is not null and public.is_project_owner(project_id))
);
