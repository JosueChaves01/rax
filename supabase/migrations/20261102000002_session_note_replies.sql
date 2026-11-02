-- Notas de sesión editables y con respuestas.
-- 1. El autor de una nota puede corregirla (updated_at registra la última edición).
-- 2. Cualquiera que vea el proyecto y la nota (emprendedor, colaborador, mentor) puede responderla;
--    solo el autor de la respuesta la edita. Las respuestas a notas privadas solo las ve el autor de la nota.

alter table public.session_notes
  add column if not exists updated_at timestamptz;

drop policy if exists notes_update on public.session_notes;
create policy notes_update on public.session_notes for update to authenticated
  using (author_id = auth.uid() and public.can_read_project(project_id))
  with check (author_id = auth.uid() and public.can_read_project(project_id));

create table if not exists public.session_note_replies (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.session_notes (id) on delete cascade,
  session_id uuid not null references public.mentor_sessions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists session_note_replies_note_idx on public.session_note_replies (note_id, created_at);
create index if not exists session_note_replies_session_idx on public.session_note_replies (session_id);
create index if not exists session_note_replies_project_idx on public.session_note_replies (project_id);

alter table public.session_note_replies enable row level security;

-- La nota existe, es del mismo proyecto y sesión, y quien consulta puede verla.
create or replace function public.can_see_session_note(p_note_id uuid, p_project_id uuid, p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.session_notes n
    where n.id = p_note_id
      and n.project_id = p_project_id
      and n.session_id = p_session_id
      and (not n.is_private or n.author_id = auth.uid())
  ) and public.can_read_project(p_project_id);
$$;

revoke all on function public.can_see_session_note(uuid, uuid, uuid) from public;
grant execute on function public.can_see_session_note(uuid, uuid, uuid) to authenticated;

drop policy if exists note_replies_select on public.session_note_replies;
create policy note_replies_select on public.session_note_replies for select to authenticated
  using (public.can_see_session_note(note_id, project_id, session_id));

drop policy if exists note_replies_insert on public.session_note_replies;
create policy note_replies_insert on public.session_note_replies for insert to authenticated
  with check (author_id = auth.uid() and public.can_see_session_note(note_id, project_id, session_id));

drop policy if exists note_replies_update on public.session_note_replies;
create policy note_replies_update on public.session_note_replies for update to authenticated
  using (author_id = auth.uid() and public.can_see_session_note(note_id, project_id, session_id))
  with check (author_id = auth.uid() and public.can_see_session_note(note_id, project_id, session_id));

grant select, insert, update on public.session_note_replies to authenticated;
grant all on public.session_note_replies to service_role;
