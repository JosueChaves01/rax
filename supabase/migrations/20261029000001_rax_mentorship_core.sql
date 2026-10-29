-- ════════════════════════════════════════════════════════════════════
-- RAX · Fase 1 · Núcleo de Relación de Mentoría, Acuerdos y Objetivos
-- Extiende el modelo hacia el ciclo integral de acompañamiento empresarial.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Tipos enumerados ───────────────────────────────────────────────
create type public.mentorship_stage as enum (
  'exploration',
  'diagnosis',
  'agreement',
  'active_mentoring',
  'evaluation',
  'renewed',
  'closed'
);

create type public.compatibility_status as enum (
  'pending',
  'proceed',
  'needs_info',
  'declined'
);

create type public.agreement_frequency as enum (
  'weekly',
  'biweekly',
  'monthly',
  'on_demand'
);

create type public.agreement_status as enum (
  'draft',
  'confirmed_by_mentor',
  'confirmed_by_entrepreneur',
  'active',
  'superseded'
);

create type public.goal_kind as enum (
  'metric',
  'qualitative',
  'capability',
  'strategic'
);

create type public.goal_priority as enum (
  'high',
  'medium',
  'low'
);

create type public.goal_status as enum (
  'active',
  'achieved',
  'partially_achieved',
  'deferred',
  'discarded'
);

-- ── 2. Tabla: mentorship_relations ────────────────────────────────────
create table public.mentorship_relations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  entrepreneur_id uuid not null references public.profiles (id) on delete cascade,
  mentor_id uuid not null references public.profiles (id) on delete cascade,
  stage public.mentorship_stage not null default 'exploration',
  compatibility_status public.compatibility_status not null default 'pending',
  compatibility_rationale text check (compatibility_rationale is null or char_length(compatibility_rationale) <= 2000),
  compatibility_decided_at timestamptz,
  version int not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mentorship_relations is 'Vínculo formal entre un mentor y un emprendedor dentro de un proyecto, gobernando sus etapas.';

create index mentorship_relations_project_idx on public.mentorship_relations (project_id);
create index mentorship_relations_entrepreneur_idx on public.mentorship_relations (entrepreneur_id);
create index mentorship_relations_mentor_idx on public.mentorship_relations (mentor_id);

create trigger mentorship_relations_touch
before update on public.mentorship_relations
for each row execute function public.touch_updated_at();

create trigger mentorship_relations_bump
before update on public.mentorship_relations
for each row execute function public.bump_version();

-- ── 3. Tabla: mentorship_agreements ───────────────────────────────────
create table public.mentorship_agreements (
  id uuid primary key default gen_random_uuid(),
  relation_id uuid not null references public.mentorship_relations (id) on delete cascade,
  version int not null default 1 check (version >= 1),
  frequency public.agreement_frequency not null default 'weekly',
  session_duration_minutes int not null check (session_duration_minutes between 15 and 240),
  authorized_channels text[] not null default '{}',
  scope text not null default '' check (char_length(scope) <= 4000),
  mentor_commitments text not null default '' check (char_length(mentor_commitments) <= 4000),
  entrepreneur_commitments text not null default '' check (char_length(entrepreneur_commitments) <= 4000),
  confidentiality_terms text not null default '' check (char_length(confidentiality_terms) <= 4000),
  expected_duration_weeks int not null check (expected_duration_weeks between 1 and 104),
  status public.agreement_status not null default 'draft',
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.mentorship_agreements is 'Acuerdos de trabajo formales y versionados que rigen la relación de mentoría.';

create index mentorship_agreements_relation_idx on public.mentorship_agreements (relation_id);

-- ── 4. Tabla: mentorship_goals ────────────────────────────────────────
create table public.mentorship_goals (
  id uuid primary key default gen_random_uuid(),
  relation_id uuid not null references public.mentorship_relations (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  why_it_matters text not null default '' check (char_length(why_it_matters) <= 2000),
  kind public.goal_kind not null default 'qualitative',
  baseline text not null default '' check (char_length(baseline) <= 2000),
  target_result text not null check (char_length(target_result) between 3 and 2000),
  metric_indicator text check (metric_indicator is null or char_length(metric_indicator) <= 500),
  target_date date,
  priority public.goal_priority not null default 'medium',
  related_diagnosis_item_ids uuid[] not null default '{}',
  status public.goal_status not null default 'active',
  version int not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.mentorship_goals is 'Objetivos SMART o cualitativos de la mentoría con línea base documentada.';

create index mentorship_goals_relation_idx on public.mentorship_goals (relation_id);

create trigger mentorship_goals_touch
before update on public.mentorship_goals
for each row execute function public.touch_updated_at();

create trigger mentorship_goals_bump
before update on public.mentorship_goals
for each row execute function public.bump_version();

-- ── 5. Seguridad: RLS y políticas de acceso ───────────────────────────
alter table public.mentorship_relations enable row level security;
alter table public.mentorship_agreements enable row level security;
alter table public.mentorship_goals enable row level security;

-- Funciones auxiliares de relación
create or replace function public.is_relation_participant(rel_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.mentorship_relations
    where id = rel_id and (mentor_id = auth.uid() or entrepreneur_id = auth.uid())
  ) or public.is_admin();
$$;

create or replace function public.can_read_relation(rel_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.mentorship_relations r
    where r.id = rel_id and (
      r.mentor_id = auth.uid()
      or r.entrepreneur_id = auth.uid()
      or public.can_read_project(r.project_id)
    )
  ) or public.is_admin();
$$;

revoke all on function public.is_relation_participant, public.can_read_relation from public;
grant execute on function public.is_relation_participant, public.can_read_relation to authenticated;

-- Políticas para mentorship_relations
create policy "relations_read" on public.mentorship_relations
for select to authenticated using (
  mentor_id = auth.uid()
  or entrepreneur_id = auth.uid()
  or public.can_read_project(project_id)
  or public.is_admin()
);

create policy "relations_insert" on public.mentorship_relations
for insert to authenticated with check (
  (public.is_project_owner(project_id) and entrepreneur_id = auth.uid())
  or (public.is_assigned_mentor(project_id) and mentor_id = auth.uid())
  or public.is_admin()
);

create policy "relations_update" on public.mentorship_relations
for update to authenticated using (
  mentor_id = auth.uid()
  or entrepreneur_id = auth.uid()
  or public.is_admin()
);

-- Políticas para mentorship_agreements
create policy "agreements_read" on public.mentorship_agreements
for select to authenticated using (
  public.can_read_relation(relation_id)
);

create policy "agreements_insert" on public.mentorship_agreements
for insert to authenticated with check (
  public.is_relation_participant(relation_id)
);

create policy "agreements_update" on public.mentorship_agreements
for update to authenticated using (
  public.is_relation_participant(relation_id)
);

-- Políticas para mentorship_goals
create policy "goals_read" on public.mentorship_goals
for select to authenticated using (
  public.can_read_relation(relation_id)
);

create policy "goals_insert" on public.mentorship_goals
for insert to authenticated with check (
  public.is_relation_participant(relation_id)
);

create policy "goals_update" on public.mentorship_goals
for update to authenticated using (
  public.is_relation_participant(relation_id)
);

