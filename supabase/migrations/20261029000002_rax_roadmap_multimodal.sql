-- RAX Fase 3: Hoja de Ruta y Acciones Multimodales
-- Añade tabla roadmap_milestones y enriquece tasks para soportar acciones operativas,
-- de aprendizaje, estratégicas y diagnósticos empáticos de retraso.

create table if not exists public.roadmap_milestones (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  relation_id text references public.mentorship_relations(id) on delete set null,
  goal_id text references public.mentorship_goals(id) on delete set null,
  title text not null,
  description text,
  target_date date,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'achieved', 'deferred')),
  order_index integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices de consulta rápida
create index if not exists idx_roadmap_milestones_project on public.roadmap_milestones(project_id);
create index if not exists idx_roadmap_milestones_relation on public.roadmap_milestones(relation_id);
create index if not exists idx_roadmap_milestones_goal on public.roadmap_milestones(goal_id);

-- Enriquecer tabla tasks existente con tipología multimodal y accountability no punitivo
alter table public.tasks
  add column if not exists action_type text,
  add column if not exists milestone_id text references public.roadmap_milestones(id) on delete set null,
  add column if not exists goal_id text references public.mentorship_goals(id) on delete set null,
  add column if not exists blocked_reason text,
  add column if not exists delay_hypothesis jsonb,
  add column if not exists evidence_ids jsonb default '[]'::jsonb;

create index if not exists idx_tasks_milestone on public.tasks(milestone_id);
create index if not exists idx_tasks_goal on public.tasks(goal_id);

-- RLS: Seguridad a nivel de fila
alter table public.roadmap_milestones enable row level security;

-- Política de lectura para miembros del proyecto o mentores asignados
create policy "roadmap_milestones_select" on public.roadmap_milestones
  for select using (
    exists (
      select 1 from public.project_members
      where project_members.project_id = roadmap_milestones.project_id
        and project_members.profile_id = auth.uid()
    ) or exists (
      select 1 from public.mentor_assignments
      where mentor_assignments.project_id = roadmap_milestones.project_id
        and mentor_assignments.mentor_id = auth.uid()
        and mentor_assignments.status = 'active'
    )
  );

-- Política de inserción y modificación
create policy "roadmap_milestones_modify" on public.roadmap_milestones
  for all using (
    exists (
      select 1 from public.project_members
      where project_members.project_id = roadmap_milestones.project_id
        and project_members.profile_id = auth.uid()
    ) or exists (
      select 1 from public.mentor_assignments
      where mentor_assignments.project_id = roadmap_milestones.project_id
        and mentor_assignments.mentor_id = auth.uid()
        and mentor_assignments.status = 'active'
    )
  );

-- Trigger de actualización de timestamp
create trigger set_roadmap_milestones_updated_at
  before update on public.roadmap_milestones
  for each row execute function public.touch_updated_at();
