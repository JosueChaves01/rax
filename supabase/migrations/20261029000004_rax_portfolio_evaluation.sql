-- ============================================================================
-- RAX — Migración 20261029000004: Cartera del Mentor, Recursos y Evaluación de Ciclo
-- ============================================================================

-- 1. Tabla de recursos reutilizables del mentor (frameworks, plantillas, guías)
create table if not exists public.mentor_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('framework', 'questionnaire', 'template', 'guide', 'experiment_pattern')),
  description text not null,
  content text not null,
  tags jsonb not null default '[]'::jsonb,
  author_mentor_id uuid references public.profiles(id) on delete set null,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mentor_resources_category on public.mentor_resources(category);
create index if not exists idx_mentor_resources_author on public.mentor_resources(author_mentor_id);

alter table public.mentor_resources enable row level security;

-- Lectura: recursos públicos o propios
create policy resources_select on public.mentor_resources
  for select using (
    is_public = true or (auth.uid() is not null and author_mentor_id = auth.uid())
  );

-- Inserción: mentores o administradores
create policy resources_insert on public.mentor_resources
  for insert with check (
    auth.uid() is not null and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('mentor', 'admin')
    )
  );

-- Modificación: autor o administrador
create policy resources_update on public.mentor_resources
  for update using (
    auth.uid() is not null and (
      author_mentor_id = auth.uid() or exists (
        select 1 from public.profiles where id = auth.uid() and role = 'admin'
      )
    )
  );

-- 2. Tabla de intervenciones y alertas de cartera para el mentor
create table if not exists public.mentor_interventions (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.profiles(id) on delete cascade,
  relation_id uuid not null references public.mentorship_relations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  project_name text not null default '',
  urgency text not null check (urgency in ('high', 'medium', 'low')),
  category text not null check (category in ('unresolved_blocker', 'stalled_progress', 'session_prep_needed', 'pending_agreement', 'goal_stalled', 'cycle_review_needed')),
  title text not null,
  explanation jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed', 'snoozed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mentor_interventions_mentor on public.mentor_interventions(mentor_id);
create index if not exists idx_mentor_interventions_relation on public.mentor_interventions(relation_id);

alter table public.mentor_interventions enable row level security;

create policy interventions_all on public.mentor_interventions
  for all using (mentor_id = auth.uid());

-- 3. Tabla de evaluaciones formales de ciclo (Fase 6: Evaluación y Cierre)
create table if not exists public.cycle_evaluations (
  id uuid primary key default gen_random_uuid(),
  relation_id uuid not null references public.mentorship_relations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  cycle_number integer not null default 1,
  evaluated_at timestamptz not null default now(),
  evaluated_by uuid not null references public.profiles(id),
  goal_evaluations jsonb not null default '[]'::jsonb,
  autonomy_assessment jsonb not null default '{}'::jsonb,
  mentor_feedback text not null default '',
  entrepreneur_feedback text,
  decision text not null check (decision in ('renew', 'close', 'new_stage')),
  next_cycle_focus text,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_cycle_evaluations_relation on public.cycle_evaluations(relation_id);
create index if not exists idx_cycle_evaluations_project on public.cycle_evaluations(project_id);

alter table public.cycle_evaluations enable row level security;

-- Lectura: quien puede leer el proyecto
create policy cycle_evaluations_select on public.cycle_evaluations
  for select using (public.can_read_project(project_id));

-- Inserción / edición: mentor asignado o administrador
create policy cycle_evaluations_manage on public.cycle_evaluations
  for all using (
    public.can_read_project(project_id) and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('mentor', 'admin')
    )
  );

grant select, insert, update on public.mentor_resources to authenticated;
grant select, insert, update, delete on public.mentor_interventions to authenticated;
grant select, insert, update on public.cycle_evaluations to authenticated;

