-- ════════════════════════════════════════════════════════════════════
-- RAX · Pivot B2B (Fase 0 · Punto Cero): esquema base y RLS
-- El mentor es el dueño operativo del proyecto; el cliente entra por invitación (notificación en el
-- panel), responde la entrevista de intake y ve solo lo que el mentor publica.
--
-- Todo es aditivo: nada se borra y el flujo actual sigue igual. Las funciones viejas
-- (is_project_owner / is_project_member) no se tocan; se agregan is_project_mentor / is_project_client.
--
-- Valores nuevos de enum: Postgres no deja usar un valor agregado con `alter type … add value` en la
-- misma transacción. Por eso en este archivo los roles y tipos nuevos se comparan como texto
-- (`role::text = 'client'`) y el script de datos vive en una función que se ejecuta después.
-- ════════════════════════════════════════════════════════════════════

-- ── Enums ───────────────────────────────────────────────────────────
alter type public.project_member_role add value if not exists 'client';
alter type public.mentor_session_kind add value if not exists 'kickoff';
alter type public.comment_target add value if not exists 'document';
alter type public.comment_target add value if not exists 'session';

-- ── Proyecto ────────────────────────────────────────────────────────
-- mentor_id: dueño operativo (queda nullable hasta migrar los proyectos existentes).
-- owner_id: cliente principal; nullable hasta que acepte la invitación.
alter table public.projects
  add column if not exists mentor_id uuid references public.profiles(id),
  add column if not exists mode text not null default 'individual'
    check (mode in ('individual', 'group')),
  add column if not exists cycle_stage text not null default 'intake'
    check (cycle_stage in ('intake', 'kickoff', 'cycle', 'closed')),
  add column if not exists client_context text not null default ''
    check (char_length(client_context) <= 8000);
alter table public.projects alter column owner_id drop not null;
create index if not exists projects_active_mentor_idx on public.projects (mentor_id) where deleted_at is null;

-- ── Invitaciones (por correo, se aceptan desde el panel) ────────────
create table if not exists public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Siempre en minúsculas: así se compara con el correo de la cuenta.
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  responded_by uuid references public.profiles(id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, email)
);
create index if not exists project_invitations_email_idx on public.project_invitations (email) where status = 'pending';

-- ── Notificaciones del panel (campana) ──────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 60),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_profile_idx on public.notifications (profile_id, created_at desc);

-- ── Perfil y RAG del mentor (fuera del proyecto) ────────────────────
create table if not exists public.mentor_profiles (
  mentor_id uuid primary key references public.profiles(id) on delete cascade,
  headline text not null default '' check (char_length(headline) <= 200),
  bio text not null default '' check (char_length(bio) <= 4000),
  methodology text not null default '' check (char_length(methodology) <= 10000),
  focus_areas text[] not null default '{}',
  interview_guide jsonb not null default '[]'::jsonb check (jsonb_typeof(interview_guide) = 'array'),
  assistant_tone text not null default '' check (char_length(assistant_tone) <= 2000),
  updated_at timestamptz not null default now()
);

create table if not exists public.mentor_documents (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  filename text not null check (char_length(filename) between 1 and 255),
  content text not null,
  file_type text not null default 'markdown' check (file_type in ('markdown', 'text', 'csv', 'code', 'pdf', 'json')),
  token_count integer not null default 0 check (token_count >= 0),
  kind text not null default 'methodology' check (kind in ('methodology', 'template', 'reference', 'example')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mentor_documents_mentor_idx on public.mentor_documents (mentor_id, updated_at desc);

create table if not exists public.mentor_document_chunks (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid not null references public.mentor_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  token_count integer not null default 0 check (token_count >= 0),
  tsv tsvector generated always as (to_tsvector('spanish', content)) stored,
  created_at timestamptz not null default now()
);
create index if not exists mentor_document_chunks_doc_idx on public.mentor_document_chunks (mentor_id, document_id, chunk_index);
create index if not exists mentor_document_chunks_tsv_idx on public.mentor_document_chunks using gin (tsv);

-- ── Intake (pre Sesión 1) ───────────────────────────────────────────
-- Una fila por cliente. En proyectos grupales hay además una fila con client_id null: el brief
-- consolidado del grupo. `nulls not distinct` hace que esa fila también sea única.
create table if not exists public.intake_briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid references public.profiles(id),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'submitted', 'reviewed')),
  guide_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(guide_snapshot) = 'array'),
  coverage jsonb not null default '{}'::jsonb check (jsonb_typeof(coverage) = 'object'),
  brief jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_briefs_project_client_key unique nulls not distinct (project_id, client_id)
);

-- ── Sesiones y ciclo ────────────────────────────────────────────────
alter table public.mentor_sessions
  add column if not exists session_number integer check (session_number is null or session_number >= 1),
  add column if not exists agenda jsonb not null default '[]'::jsonb check (jsonb_typeof(agenda) = 'array'),
  add column if not exists live_notes text not null default '' check (char_length(live_notes) <= 50000),
  add column if not exists live_notes_updated_at timestamptz;

-- ── Evaluaciones (exámenes) ─────────────────────────────────────────
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id uuid references public.mentor_sessions(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 200),
  instructions text not null default '' check (char_length(instructions) <= 8000),
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists assessments_project_idx on public.assessments (project_id, created_at desc);

create table if not exists public.assessment_submissions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  client_id uuid not null references public.profiles(id),
  answers jsonb not null default '[]'::jsonb check (jsonb_typeof(answers) = 'array'),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reviewed')),
  score numeric,
  mentor_feedback text check (mentor_feedback is null or char_length(mentor_feedback) <= 8000),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  unique (assessment_id, client_id)
);

-- ── Documentos publicados ───────────────────────────────────────────
-- audience_client_id null = para todo el grupo (o la única persona en proyectos individuales).
alter table public.project_documents
  add column if not exists visibility text not null default 'mentor_only'
    check (visibility in ('mentor_only', 'published')),
  add column if not exists published_at timestamptz,
  add column if not exists mentor_session_id uuid references public.mentor_sessions(id) on delete set null,
  add column if not exists doc_kind text not null default 'material'
    check (doc_kind in ('material', 'summary', 'transcript', 'agreement', 'intake')),
  add column if not exists audience_client_id uuid references public.profiles(id) on delete set null;

-- ── Agente: hilos con alcance ───────────────────────────────────────
alter table public.agent_threads
  add column if not exists scope text not null default 'project'
    check (scope in ('project', 'intake', 'session_room')),
  add column if not exists mentor_session_id uuid references public.mentor_sessions(id) on delete cascade;

-- ════════════════════════════════════════════════════════════════════
-- Funciones de relación
-- ════════════════════════════════════════════════════════════════════

-- Mentor del proyecto: el que lo creó (mentor_id) o el que tiene una asignación activa.
create or replace function public.is_project_mentor(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    join public.profiles me on me.id = auth.uid()
    where p.id = pid and p.deleted_at is null and me.role = 'mentor'
      and (
        p.mentor_id = auth.uid()
        or exists (
          select 1 from public.mentor_assignments a
          where a.project_id = p.id and a.mentor_id = auth.uid() and a.status = 'active'
        )
      )
  );
$$;

-- Cliente del proyecto: miembro con rol `client` (se compara como texto, ver encabezado).
create or replace function public.is_project_client(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    join public.projects p on p.id = m.project_id
    where m.project_id = pid and p.deleted_at is null
      and m.profile_id = auth.uid() and m.role::text = 'client'
  );
$$;

-- El mentor del proyecto lee todo el proyecto, igual que un mentor asignado. El cliente NO entra
-- acá: tiene políticas propias por tabla para que nunca vea material sin publicar ni notas privadas.
create or replace function public.can_read_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_project_member(pid) or public.is_assigned_mentor(pid) or public.is_project_mentor(pid);
$$;

revoke all on function public.is_project_mentor(uuid), public.is_project_client(uuid), public.can_read_project(uuid) from public;
grant execute on function public.is_project_mentor(uuid), public.is_project_client(uuid), public.can_read_project(uuid)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════
-- Guardas
-- ════════════════════════════════════════════════════════════════════

-- mentor_id, cycle_stage y mode los escribe solo el servidor (service role) después de verificar
-- permisos (createProjectAsMentor, advanceCycleStage). Desde la API nadie se nombra mentor.
create or replace function public.guard_project_b2b() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.cycle_stage <> 'intake' then
      raise exception 'El proyecto empieza en intake' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.mentor_id is distinct from old.mentor_id
     or new.cycle_stage is distinct from old.cycle_stage
     or new.mode is distinct from old.mode then
    raise exception 'Solo el servidor cambia mentor, etapa o modo del proyecto' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists projects_b2b_guard on public.projects;
create trigger projects_b2b_guard before insert or update on public.projects
  for each row execute function public.guard_project_b2b();

create or replace function public.touch_b2b_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists mentor_profiles_touch on public.mentor_profiles;
create trigger mentor_profiles_touch before update on public.mentor_profiles
  for each row execute function public.touch_b2b_updated_at();
drop trigger if exists mentor_documents_touch on public.mentor_documents;
create trigger mentor_documents_touch before update on public.mentor_documents
  for each row execute function public.touch_b2b_updated_at();
drop trigger if exists intake_briefs_touch on public.intake_briefs;
create trigger intake_briefs_touch before update on public.intake_briefs
  for each row execute function public.touch_b2b_updated_at();

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════════

alter table public.project_invitations enable row level security;
alter table public.notifications enable row level security;
alter table public.mentor_profiles enable row level security;
alter table public.mentor_documents enable row level security;
alter table public.mentor_document_chunks enable row level security;
alter table public.intake_briefs enable row level security;
alter table public.assessments enable row level security;
alter table public.assessment_submissions enable row level security;

-- ── Proyectos ───────────────────────────────────────────────────────
-- Un mentor crea proyectos a su nombre, sin cliente todavía. La condición va directa sobre la fila
-- (ver 20261028000004: `insert … returning` no ve la fila nueva desde las funciones auxiliares).
drop policy if exists projects_insert_mentor on public.projects;
create policy projects_insert_mentor on public.projects for insert to authenticated with check (
  mentor_id = auth.uid() and owner_id is null
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'mentor' and onboarded_at is not null)
);
drop policy if exists projects_select_b2b on public.projects;
create policy projects_select_b2b on public.projects for select to authenticated using (
  deleted_at is null and (mentor_id = auth.uid() or public.is_project_mentor(id) or public.is_project_client(id))
);
drop policy if exists projects_update_mentor on public.projects;
create policy projects_update_mentor on public.projects for update to authenticated
  using (public.is_project_mentor(id)) with check (public.is_project_mentor(id));

drop policy if exists members_select_client on public.project_members;
create policy members_select_client on public.project_members for select to authenticated using (
  public.is_project_client(project_id)
);

-- Perfiles de quienes comparten un proyecto B2B conmigo (mentor ↔ clientes, clientes del grupo).
drop policy if exists profiles_select_b2b on public.profiles;
create policy profiles_select_b2b on public.profiles for select to authenticated using (
  exists (
    select 1 from public.projects p
    where p.deleted_at is null
      and (public.is_project_mentor(p.id) or public.is_project_client(p.id))
      and (p.mentor_id = profiles.id
        or exists (select 1 from public.project_members m where m.project_id = p.id and m.profile_id = profiles.id))
  )
);

-- ── Sesiones, notas, tareas y comentarios: el cliente lee lo de su proyecto ──
drop policy if exists sessions_select_client on public.mentor_sessions;
create policy sessions_select_client on public.mentor_sessions for select to authenticated using (
  public.is_project_client(project_id)
);
drop policy if exists notes_select_client on public.session_notes;
create policy notes_select_client on public.session_notes for select to authenticated using (
  public.is_project_client(project_id) and not is_private
);
drop policy if exists tasks_select_client on public.tasks;
create policy tasks_select_client on public.tasks for select to authenticated using (
  public.is_project_client(project_id)
);
drop policy if exists comments_select_client on public.comments;
create policy comments_select_client on public.comments for select to authenticated using (
  public.is_project_client(project_id) and target_type::text in ('document', 'session')
);
drop policy if exists comments_insert_client on public.comments;
create policy comments_insert_client on public.comments for insert to authenticated with check (
  author_id = auth.uid() and public.is_project_client(project_id) and target_type::text in ('document', 'session')
);

-- ── Documentos: el cliente solo ve lo publicado para él o para todo el grupo ──
drop policy if exists project_documents_select_client on public.project_documents;
create policy project_documents_select_client on public.project_documents for select to authenticated using (
  public.is_project_client(project_id)
  and visibility = 'published'
  and (audience_client_id is null or audience_client_id = auth.uid())
);
drop policy if exists project_documents_insert_mentor on public.project_documents;
create policy project_documents_insert_mentor on public.project_documents for insert to authenticated with check (
  created_by = auth.uid() and public.is_project_mentor(project_id)
);
drop policy if exists project_documents_update_mentor on public.project_documents;
create policy project_documents_update_mentor on public.project_documents for update to authenticated
  using (public.is_project_mentor(project_id)) with check (public.is_project_mentor(project_id));
drop policy if exists project_documents_delete_mentor on public.project_documents;
create policy project_documents_delete_mentor on public.project_documents for delete to authenticated using (
  public.is_project_mentor(project_id)
);

drop policy if exists project_document_chunks_select_client on public.project_document_chunks;
create policy project_document_chunks_select_client on public.project_document_chunks for select to authenticated using (
  public.is_project_client(project_id)
  and exists (
    select 1 from public.project_documents d
    where d.id = document_id and d.visibility = 'published'
      and (d.audience_client_id is null or d.audience_client_id = auth.uid())
  )
);
drop policy if exists project_document_chunks_insert_mentor on public.project_document_chunks;
create policy project_document_chunks_insert_mentor on public.project_document_chunks for insert to authenticated with check (
  public.is_project_mentor(project_id)
);
drop policy if exists project_document_chunks_delete_mentor on public.project_document_chunks;
create policy project_document_chunks_delete_mentor on public.project_document_chunks for delete to authenticated using (
  public.is_project_mentor(project_id)
);

-- ── Invitaciones ────────────────────────────────────────────────────
drop policy if exists invitations_select on public.project_invitations;
create policy invitations_select on public.project_invitations for select to authenticated using (
  public.is_project_mentor(project_id) or email = lower(auth.email())
);
drop policy if exists invitations_insert_mentor on public.project_invitations;
create policy invitations_insert_mentor on public.project_invitations for insert to authenticated with check (
  public.is_project_mentor(project_id) and invited_by = auth.uid() and status = 'pending'
);
-- El mentor reabre o revoca; la persona invitada solo acepta o rechaza una invitación pendiente.
drop policy if exists invitations_update_mentor on public.project_invitations;
create policy invitations_update_mentor on public.project_invitations for update to authenticated
  using (public.is_project_mentor(project_id))
  with check (public.is_project_mentor(project_id) and status in ('pending', 'revoked'));
drop policy if exists invitations_update_invitee on public.project_invitations;
create policy invitations_update_invitee on public.project_invitations for update to authenticated
  using (email = lower(auth.email()) and status = 'pending')
  with check (email = lower(auth.email()) and status in ('accepted', 'declined') and responded_by = auth.uid());

-- ── Notificaciones: cada persona las suyas; las crea el servidor ────
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications for select to authenticated using (profile_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ── Perfil y RAG del mentor: solo el propio mentor ──────────────────
-- El cliente nunca lee el RAG del mentor; lo usa el servidor (service role) dentro del turno del agente.
drop policy if exists mentor_profiles_own on public.mentor_profiles;
create policy mentor_profiles_own on public.mentor_profiles for all to authenticated
  using (mentor_id = auth.uid())
  with check (mentor_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'mentor'));
drop policy if exists mentor_documents_own on public.mentor_documents;
create policy mentor_documents_own on public.mentor_documents for all to authenticated
  using (mentor_id = auth.uid())
  with check (mentor_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'mentor'));
drop policy if exists mentor_document_chunks_own on public.mentor_document_chunks;
create policy mentor_document_chunks_own on public.mentor_document_chunks for all to authenticated
  using (mentor_id = auth.uid())
  with check (
    mentor_id = auth.uid()
    and exists (select 1 from public.mentor_documents d where d.id = document_id and d.mentor_id = auth.uid())
  );

-- ── Intake: el brief es solo para el mentor ─────────────────────────
-- El cliente ve su avance (estado y cobertura, sin el brief) en la vista intake_progress.
-- Las escrituras del intake las hace el servidor (service role) tras verificar permisos.
drop policy if exists intake_briefs_select_mentor on public.intake_briefs;
create policy intake_briefs_select_mentor on public.intake_briefs for select to authenticated using (
  public.is_project_mentor(project_id)
);
drop policy if exists intake_briefs_update_mentor on public.intake_briefs;
create policy intake_briefs_update_mentor on public.intake_briefs for update to authenticated
  using (public.is_project_mentor(project_id)) with check (public.is_project_mentor(project_id));

create or replace view public.intake_progress as
  select id, project_id, client_id, status, coverage, submitted_at, reviewed_at, updated_at
  from public.intake_briefs
  where client_id = auth.uid() or public.is_project_mentor(project_id);

-- ── Evaluaciones ────────────────────────────────────────────────────
drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments for select to authenticated using (
  public.is_project_mentor(project_id)
  or (public.is_project_client(project_id) and status in ('published', 'closed'))
);
drop policy if exists assessments_insert_mentor on public.assessments;
create policy assessments_insert_mentor on public.assessments for insert to authenticated with check (
  public.is_project_mentor(project_id) and created_by = auth.uid()
);
drop policy if exists assessments_update_mentor on public.assessments;
create policy assessments_update_mentor on public.assessments for update to authenticated
  using (public.is_project_mentor(project_id)) with check (public.is_project_mentor(project_id));

create or replace function public.assessment_project(aid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select project_id from public.assessments where id = aid;
$$;
revoke all on function public.assessment_project(uuid) from public;
grant execute on function public.assessment_project(uuid) to authenticated, service_role;

drop policy if exists submissions_select on public.assessment_submissions;
create policy submissions_select on public.assessment_submissions for select to authenticated using (
  client_id = auth.uid() or public.is_project_mentor(public.assessment_project(assessment_id))
);
drop policy if exists submissions_insert_own on public.assessment_submissions;
create policy submissions_insert_own on public.assessment_submissions for insert to authenticated with check (
  client_id = auth.uid() and status in ('draft', 'submitted') and score is null and mentor_feedback is null
  and public.is_project_client(public.assessment_project(assessment_id))
  and exists (select 1 from public.assessments a where a.id = assessment_id and a.status = 'published')
);
drop policy if exists submissions_update_own on public.assessment_submissions;
create policy submissions_update_own on public.assessment_submissions for update to authenticated
  using (client_id = auth.uid() and status = 'draft')
  with check (client_id = auth.uid() and status in ('draft', 'submitted') and score is null and mentor_feedback is null);
drop policy if exists submissions_review_mentor on public.assessment_submissions;
create policy submissions_review_mentor on public.assessment_submissions for update to authenticated
  using (public.is_project_mentor(public.assessment_project(assessment_id)))
  with check (public.is_project_mentor(public.assessment_project(assessment_id)));

-- ── Permisos de tabla (RLS decide las filas) ────────────────────────
-- Se parte de cero (Supabase da todo por defecto a anon y authenticated) y se concede lo justo.
revoke all on public.project_invitations, public.notifications, public.mentor_profiles, public.mentor_documents,
  public.mentor_document_chunks, public.intake_briefs, public.intake_progress, public.assessments,
  public.assessment_submissions from anon, authenticated;
grant select, insert, update, delete on public.mentor_profiles, public.mentor_documents, public.mentor_document_chunks to authenticated;
grant select, insert, update on public.assessments, public.assessment_submissions to authenticated;
-- Invitaciones: nadie cambia proyecto, correo ni quién invitó; solo el estado y quién respondió.
grant select, insert on public.project_invitations to authenticated;
grant update (status, responded_by, responded_at) on public.project_invitations to authenticated;
-- Notificaciones: las crea el servidor; la persona solo las marca como leídas.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- Intake: lo escribe el servidor; el mentor puede actualizar (marcar revisado, corregir el brief).
grant select, update on public.intake_briefs to authenticated;
grant select on public.intake_progress to authenticated;
grant all on public.project_invitations, public.notifications, public.mentor_profiles, public.mentor_documents,
  public.mentor_document_chunks, public.intake_briefs, public.assessments, public.assessment_submissions to service_role;
grant select on public.intake_progress to service_role;

-- ════════════════════════════════════════════════════════════════════
-- Migración de datos de proyectos existentes (idempotente)
-- NO se ejecuta acá: se corre una vez al encender RAX_B2B_FLOW, con la service role:
--   select public.rax_b2b_backfill();
-- Se puede repetir sin duplicar nada. Devuelve cuántas filas tocó cada paso.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.rax_b2b_backfill() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n_mentor int;
  n_clients int;
  n_stage int;
  n_briefs int;
begin
  -- 1. mentor_id = mentor de la asignación activa más reciente.
  update public.projects p set mentor_id = a.mentor_id
  from (
    select distinct on (project_id) project_id, mentor_id
    from public.mentor_assignments
    where status = 'active'
    order by project_id, created_at desc
  ) a
  where p.id = a.project_id and p.mentor_id is null;
  get diagnostics n_mentor = row_count;

  -- 2. El dueño actual pasa a ser cliente del proyecto.
  insert into public.project_members (project_id, profile_id, role)
  select p.id, p.owner_id, 'client'::public.project_member_role
  from public.projects p
  where p.owner_id is not null and p.deleted_at is null
  on conflict (project_id, profile_id) do update set role = excluded.role
    where public.project_members.role::text = 'owner';
  get diagnostics n_clients = row_count;

  -- 3. Etapa del ciclo desde las sesiones: segunda revisión completada → closed;
  --    primera revisión completada → cycle; el resto se queda en intake.
  update public.projects p set cycle_stage = s.stage
  from (
    select pr.id,
      case
        when exists (select 1 from public.mentor_sessions ms where ms.project_id = pr.id
                     and ms.kind::text = 'second_review' and ms.status = 'completed') then 'closed'
        when exists (select 1 from public.mentor_sessions ms where ms.project_id = pr.id
                     and ms.kind::text = 'first_review' and ms.status = 'completed') then 'cycle'
        else 'intake'
      end as stage
    from public.projects pr
    where pr.deleted_at is null
  ) s
  where p.id = s.id and p.cycle_stage = 'intake' and s.stage <> 'intake';
  get diagnostics n_stage = row_count;

  -- 4. El resumen del diagnóstico (congelado) se copia como brief ya revisado.
  insert into public.intake_briefs (project_id, client_id, status, brief, submitted_at, reviewed_at)
  select d.project_id, p.owner_id, 'reviewed',
    jsonb_build_object(
      'summary', d.summary,
      'answers', '[]'::jsonb,
      'gaps', '[]'::jsonb,
      'risks', '[]'::jsonb,
      'suggestedAgenda', '[]'::jsonb,
      'generatedAt', to_jsonb(d.updated_at),
      'model', 'legacy-diagnosis'
    ),
    d.updated_at, now()
  from public.diagnoses d
  join public.projects p on p.id = d.project_id
  where p.deleted_at is null and d.summary is not null and btrim(d.summary) <> ''
  on conflict on constraint intake_briefs_project_client_key do nothing;
  get diagnostics n_briefs = row_count;

  return jsonb_build_object('mentors', n_mentor, 'clients', n_clients, 'stages', n_stage, 'briefs', n_briefs);
end $$;

revoke all on function public.rax_b2b_backfill() from public, anon, authenticated;
grant execute on function public.rax_b2b_backfill() to service_role;
