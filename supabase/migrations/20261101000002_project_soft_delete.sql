-- ════════════════════════════════════════════════════════════════════
-- RAX · Borrar proyectos (borrado lógico)
-- La persona dueña puede borrar un proyecto creado por error. La fila queda con `deleted_at` y
-- desaparece para todos: dueño, colaboradores, mentores y administración. Como todas las políticas
-- de las tablas hijas pasan por estas funciones auxiliares, basta con que ignoren los proyectos
-- borrados para que también se oculten conversación, diagnóstico, sesiones, tareas, documentos, etc.
-- Si hiciera falta recuperarlo: `update public.projects set deleted_at = null where id = '…';`
-- ════════════════════════════════════════════════════════════════════

alter table public.projects add column if not exists deleted_at timestamptz;
create index if not exists projects_active_owner_idx on public.projects (owner_id) where deleted_at is null;

-- Security definer: se usa dentro de otras políticas sin depender de que quien consulta vea la fila.
create or replace function public.is_project_active(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = pid and deleted_at is null);
$$;

create or replace function public.is_project_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.projects p
    join public.profiles profile on profile.id = p.owner_id
    where p.id = pid and p.deleted_at is null and p.owner_id = auth.uid() and profile.role = 'entrepreneur'
  );
$$;

create or replace function public.is_project_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_project_owner(pid)
      or exists (
        select 1
        from public.project_members member
        join public.profiles profile on profile.id = member.profile_id
        join public.projects p on p.id = member.project_id
        where member.project_id = pid
          and p.deleted_at is null
          and member.profile_id = auth.uid()
          and member.role = 'collaborator'
          and profile.role = 'entrepreneur'
      );
$$;

create or replace function public.is_assigned_mentor(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.mentor_assignments a
    join public.profiles p on p.id = a.mentor_id
    join public.projects pr on pr.id = a.project_id
    where a.project_id = pid and pr.deleted_at is null
      and a.mentor_id = auth.uid() and a.status = 'active' and p.role = 'mentor'
  );
$$;

create or replace function public.mentor_can_read_conversation(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_assigned_mentor(pid)
     and exists (select 1 from public.projects where id = pid and deleted_at is null and share_conversation_with_mentor);
$$;

-- Un proyecto borrado no lo ve nadie, ni la administración. La condición de dueño sigue directa sobre
-- la fila (ver 20261028000004: `insert … returning` todavía no ve la fila desde las funciones).
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated using (
  deleted_at is null and (owner_id = auth.uid() or public.can_read_project(id) or public.is_admin())
);

-- Las relaciones de mentoría guardan mentor y emprendedor directamente: también se ocultan con su proyecto.
create or replace function public.can_read_relation(rel_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.mentorship_relations r
    join public.projects p on p.id = r.project_id
    where r.id = rel_id and p.deleted_at is null and (
      r.mentor_id = auth.uid()
      or r.entrepreneur_id = auth.uid()
      or public.can_read_project(r.project_id)
    )
  ) or public.is_admin();
$$;

drop policy if exists "relations_read" on public.mentorship_relations;
create policy "relations_read" on public.mentorship_relations
for select to authenticated using (
  public.is_project_active(project_id)
  and (mentor_id = auth.uid() or entrepreneur_id = auth.uid() or public.can_read_project(project_id) or public.is_admin())
);

revoke all on function public.is_project_active(uuid), public.is_project_owner(uuid), public.is_project_member(uuid), public.is_assigned_mentor(uuid),
  public.mentor_can_read_conversation(uuid), public.can_read_relation(uuid) from public;
grant execute on function public.is_project_active(uuid), public.is_project_owner(uuid), public.is_project_member(uuid), public.is_assigned_mentor(uuid),
  public.mentor_can_read_conversation(uuid), public.can_read_relation(uuid) to authenticated, service_role;
