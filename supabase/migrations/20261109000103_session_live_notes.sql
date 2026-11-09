-- ════════════════════════════════════════════════════════════════════
-- RAX · Pivot B2B, Fase 4 (Dev A): las notas en vivo pasan a su propia tabla (solo el mentor)
--
-- Problema: la política sessions_select_client (20261107000001) deja que un cliente lea su fila de
-- mentor_sessions completa por la API de Supabase, incluida la columna live_notes, que es privada
-- del mentor. Las políticas de Postgres son por fila, no por columna, así que las notas se mudan a
-- public.session_live_notes, que solo lee y escribe el mentor de la sesión (y el servidor).
--
-- · Se copian las notas existentes y la columna vieja queda vacía y bloqueada en '' (check), para
--   que nada vuelva a escribir ahí por error. Las columnas se borran en la limpieza de la Fase 5.
-- · `version` permite la actualización condicional (concurrencia optimista atómica): el servidor
--   actualiza con `where session_id = … and version = <la que leyó>`.
-- · project_id lo fija un trigger desde la sesión: no se puede apuntar a otro proyecto.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.session_live_notes (
  session_id uuid primary key references public.mentor_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  text text not null default '' check (char_length(text) <= 50000),
  version int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
create index if not exists session_live_notes_project_idx on public.session_live_notes (project_id);

create or replace function public.session_live_notes_fill_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select s.project_id into new.project_id from public.mentor_sessions s where s.id = new.session_id;
  if new.project_id is null then
    raise exception 'La sesión no existe.' using errcode = '23503';
  end if;
  return new;
end $$;

drop trigger if exists session_live_notes_project on public.session_live_notes;
create trigger session_live_notes_project before insert or update on public.session_live_notes
  for each row execute function public.session_live_notes_fill_project();

alter table public.session_live_notes enable row level security;

-- Solo el mentor de la sesión, y solo si sigue siendo mentor del proyecto. Ningún cliente.
drop policy if exists session_live_notes_mentor on public.session_live_notes;
create policy session_live_notes_mentor on public.session_live_notes for all to authenticated
  using (
    public.is_project_mentor(project_id)
    and exists (select 1 from public.mentor_sessions s where s.id = session_id and s.mentor_id = auth.uid())
  )
  with check (
    public.is_project_mentor(project_id)
    and exists (select 1 from public.mentor_sessions s where s.id = session_id and s.mentor_id = auth.uid())
  );

revoke all on public.session_live_notes from anon;
grant select, insert, update on public.session_live_notes to authenticated;
grant all on public.session_live_notes to service_role;

-- Copia de lo que ya había (idempotente) y la columna vieja queda vacía.
insert into public.session_live_notes (session_id, project_id, text, version, updated_at, updated_by)
  select s.id, s.project_id, s.live_notes, 1, coalesce(s.live_notes_updated_at, now()), s.mentor_id
  from public.mentor_sessions s
  where s.live_notes <> ''
on conflict (session_id) do nothing;

update public.mentor_sessions set live_notes = '', live_notes_updated_at = null
  where live_notes <> '' or live_notes_updated_at is not null;

alter table public.mentor_sessions drop constraint if exists mentor_sessions_live_notes_retired;
alter table public.mentor_sessions add constraint mentor_sessions_live_notes_retired check (live_notes = '');

comment on column public.mentor_sessions.live_notes is 'Retirada (20261109000103): las notas en vivo están en session_live_notes.';
