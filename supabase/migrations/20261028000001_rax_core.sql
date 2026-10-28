-- ════════════════════════════════════════════════════════════════════
-- RAX · Fase Cero · Esquema de dominio
-- Ver docs/domain-model.md. Los nombres en snake_case corresponden 1:1
-- con types/domain.ts (camelCase). Cada estado vive en su propia columna.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Tipos enumerados ───────────────────────────────────────────────
create type public.user_role as enum ('entrepreneur', 'mentor', 'admin');
create type public.project_member_role as enum ('owner', 'collaborator');
create type public.assignment_status as enum ('active', 'revoked');
create type public.project_status as enum ('active', 'paused', 'archived');
create type public.initiative_nature as enum ('exploring_idea', 'designing_solution', 'operating_business', 'unknown');
create type public.message_author as enum ('entrepreneur', 'assistant', 'system');
create type public.ai_provider as enum ('simulated', 'openrouter');
create type public.interview_dimension as enum ('nature', 'stage', 'people', 'origin', 'problem', 'evidence', 'assumptions', 'resources', 'immediate_goal');
create type public.diagnosis_category as enum ('context', 'people_market', 'problem', 'solutions', 'financial', 'operational', 'commercial', 'legal', 'risk', 'open_question');
create type public.info_type as enum ('entrepreneur_statement', 'documented_observation', 'verifiable_evidence', 'ai_interpretation', 'hypothesis', 'human_correction', 'unknown', 'agreed_decision');
create type public.review_status as enum ('proposed', 'confirmed', 'corrected', 'rejected', 'needs_clarification');
create type public.uncertainty as enum ('low', 'medium', 'high', 'unknown');
create type public.source_kind as enum ('conversation', 'entrepreneur_edit', 'mentor', 'ai', 'evidence', 'experiment');
create type public.item_change_kind as enum ('created', 'edited', 'confirmed', 'rejected', 'clarification_requested', 'marked_unknown', 'evidence_attached', 'prioritized');
create type public.mentor_session_kind as enum ('first_review', 'second_review');
create type public.mentor_session_status as enum ('pending', 'in_progress', 'completed');
create type public.mentor_decision as enum ('continue', 'reformulate', 'deepen', 'pause', 'discard');
create type public.session_note_kind as enum ('observation', 'question', 'suggestion', 'agreement');
create type public.hypothesis_status as enum ('draft', 'pending_approval', 'approved', 'testing', 'supported', 'weakened', 'inconclusive', 'reformulated', 'discarded');
create type public.experiment_status as enum ('design', 'ready', 'running', 'results_pending', 'reviewed');
create type public.result_outcome as enum ('positive', 'negative', 'mixed', 'inconclusive');
create type public.task_status as enum ('todo', 'doing', 'done', 'blocked');
create type public.evidence_kind as enum ('note', 'link', 'file');
create type public.comment_target as enum ('diagnosis_item', 'hypothesis', 'experiment');

-- ── Utilidad: updated_at ───────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── Personas ───────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text not null,
  role public.user_role not null default 'entrepreneur',
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Perfil de cada usuario autenticado. El rol solo lo cambia la administración.';

-- ── Proyectos ──────────────────────────────────────────────────────
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  nature public.initiative_nature not null default 'unknown',
  status public.project_status not null default 'active',
  is_demo boolean not null default false,
  share_conversation_with_mentor boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_owner_idx on public.projects (owner_id);
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.project_member_role not null,
  created_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);
create index project_members_profile_idx on public.project_members (profile_id);

create table public.mentor_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  mentor_id uuid not null references public.profiles (id) on delete cascade,
  status public.assignment_status not null default 'active',
  assigned_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((status = 'revoked') = (revoked_at is not null))
);
-- Una sola asignación activa por mentor y proyecto.
create unique index mentor_assignments_active_uq on public.mentor_assignments (project_id, mentor_id) where status = 'active';
create index mentor_assignments_mentor_idx on public.mentor_assignments (mentor_id) where status = 'active';

-- ── Conversación ───────────────────────────────────────────────────
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author public.message_author not null,
  author_id uuid references public.profiles (id),
  content text not null check (char_length(content) between 1 and 8000),
  provider public.ai_provider,
  dimension public.interview_dimension,
  created_at timestamptz not null default now(),
  check ((author = 'entrepreneur') = (author_id is not null)),
  check (author <> 'assistant' or provider is not null)
);
create index messages_project_idx on public.messages (project_id, created_at);

-- ── Diagnóstico ────────────────────────────────────────────────────
create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  summary text check (char_length(summary) <= 3000),
  summary_confirmed_at timestamptz,
  summary_confirmed_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  check ((summary_confirmed_at is null) = (summary_confirmed_by is null))
);
-- El estado del diagnóstico (exploring … ready_for_experiments) se DERIVA en la aplicación
-- (features/diagnosis/rules.ts) y no se almacena, para que no pueda contradecir los datos.
create trigger diagnoses_touch before update on public.diagnoses for each row execute function public.touch_updated_at();

create table public.diagnosis_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  category public.diagnosis_category not null,
  title text not null check (char_length(title) between 1 and 120),
  content text not null check (char_length(content) between 1 and 2000),
  info_type public.info_type not null,
  review_status public.review_status not null default 'proposed',
  uncertainty public.uncertainty not null default 'medium',
  source_kind public.source_kind not null,
  source_ref_id uuid,
  source_quote text check (char_length(source_quote) <= 400),
  -- null = autor IA. Las personas siempre quedan identificadas.
  author_id uuid references public.profiles (id),
  related_item_ids uuid[] not null default '{}',
  evidence_ids uuid[] not null default '{}',
  priority_rank int check (priority_rank between 1 and 50),
  priority_rationale text,
  priority_set_by uuid references public.profiles (id),
  priority_set_at timestamptz,
  version int not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((priority_rank is null) = (priority_rationale is null)),
  check (priority_rank is null or category = 'problem'),
  check (info_type <> 'unknown' or uncertainty = 'unknown')
);
create index diagnosis_items_project_idx on public.diagnosis_items (project_id, category);

create table public.diagnosis_item_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.diagnosis_items (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  version int not null,
  change public.item_change_kind not null,
  before jsonb,
  after jsonb not null,
  actor_id uuid references public.profiles (id), -- null = IA
  reason text check (char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);
create index diagnosis_item_history_item_idx on public.diagnosis_item_history (item_id, version);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  target_type public.comment_target not null,
  target_id uuid not null,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index comments_target_idx on public.comments (target_id);

-- ── Mentoría ───────────────────────────────────────────────────────
create table public.mentor_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  mentor_id uuid not null references public.profiles (id),
  kind public.mentor_session_kind not null,
  status public.mentor_session_status not null default 'pending',
  briefing jsonb,
  decision public.mentor_decision,
  decision_justification text check (char_length(decision_justification) <= 2000),
  decision_hypothesis_id uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((status = 'completed') = (completed_at is not null)),
  check (decision is null or (kind = 'second_review' and decision_justification is not null and decided_at is not null))
);
-- Solo una revisión abierta de cada tipo por proyecto.
create unique index mentor_sessions_open_uq on public.mentor_sessions (project_id, kind) where status <> 'completed';

create table public.session_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mentor_sessions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  kind public.session_note_kind not null,
  body text not null check (char_length(body) between 1 and 2000),
  related_item_id uuid references public.diagnosis_items (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── Hipótesis y experimentos ───────────────────────────────────────
create table public.hypotheses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  statement text not null check (char_length(statement) between 1 and 600),
  related_item_id uuid references public.diagnosis_items (id) on delete set null,
  segment text not null default '',
  why_it_matters text not null default '',
  current_evidence text not null default '',
  uncertainty public.uncertainty not null default 'high',
  cost_of_being_wrong text not null default '',
  evaluation_criterion text not null default '',
  status public.hypothesis_status not null default 'draft',
  proposed_by uuid references public.profiles (id), -- null = IA
  approved_by uuid references public.profiles (id),
  superseded_by uuid references public.hypotheses (id),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hypotheses_project_idx on public.hypotheses (project_id);
alter table public.mentor_sessions add constraint mentor_sessions_hypothesis_fk foreign key (decision_hypothesis_id) references public.hypotheses (id);

create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  hypothesis_id uuid not null references public.hypotheses (id) on delete restrict,
  question text not null,
  method text not null default '',
  participants text not null default '',
  activities text[] not null default '{}',
  resources text not null default '',
  budget numeric(14, 2) check (budget >= 0), -- null = desconocido; nunca se inventa
  duration_days int check (duration_days between 1 and 365),
  metric text not null default '',
  success_criterion text not null default '',
  rejection_criterion text not null default '',
  risks text not null default '',
  owner_id uuid not null references public.profiles (id),
  review_date date,
  evidence_plan text not null default '',
  status public.experiment_status not null default 'design',
  criteria_locked_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('design', 'ready') or criteria_locked_at is not null)
);
create index experiments_hypothesis_idx on public.experiments (hypothesis_id);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind public.evidence_kind not null,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  url text check (url ~* '^https?://'),
  file_name text,
  file_mime_type text check (file_mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv')),
  file_size_bytes bigint check (file_size_bytes between 1 and 10485760),
  storage_path text,
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (kind <> 'link' or url is not null),
  check (kind <> 'file' or (file_name is not null and file_mime_type is not null and file_size_bytes is not null))
);

create table public.experiment_results (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  outcome public.result_outcome not null,
  observed text not null check (char_length(observed) between 1 and 2000),
  metric_value text not null default '',
  learnings text not null default '',
  limitations text not null default '',
  evidence_ids uuid[] not null default '{}',
  recorded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  experiment_id uuid references public.experiments (id) on delete set null,
  assignee_id uuid not null references public.profiles (id),
  status public.task_status not null default 'todo',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

-- ── Auditoría ──────────────────────────────────────────────────────
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects (id) on delete set null,
  actor_id uuid references public.profiles (id), -- null = IA o sistema
  actor_kind text not null default 'person' check (actor_kind in ('person', 'ai', 'system')),
  action text not null,
  target_id uuid,
  -- Solo metadatos mínimos. Nunca contenido de mensajes, secretos ni claves.
  meta jsonb not null default '{}'::jsonb check (pg_column_size(meta) < 4096),
  created_at timestamptz not null default now()
);
create index audit_events_project_idx on public.audit_events (project_id, created_at);
