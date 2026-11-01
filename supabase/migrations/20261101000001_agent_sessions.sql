-- ════════════════════════════════════════════════════════════════════
-- RAX · Sesiones del asistente (Proyecto → Sesión → Hilo, estilo Claude Projects)
-- Una sesión agrupa varios hilos sobre un mismo frente de trabajo y guarda notas que el agente
-- mantiene (objetivo, resumen, decisiones, preguntas abiertas, próximos pasos). Los hilos de una
-- misma sesión comparten esas notas; los de otras sesiones no se mezclan.
-- Las notas las escribe solo el servidor (service role); quien creó la sesión las puede leer.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Nueva sesión' check (char_length(title) between 1 and 200),
  goal text not null default '' check (char_length(goal) <= 2000),
  notes jsonb check (notes is null or (jsonb_typeof(notes) = 'object' and pg_column_size(notes) <= 32768)),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id)
);

create index if not exists agent_sessions_creator_project_idx
  on public.agent_sessions (creator_id, project_id, updated_at desc);

comment on column public.agent_sessions.notes is
  'Notas de la sesión que mantiene el agente: {summary, decisions[], openQuestions[], nextSteps[], updatedAt}.';

-- Cada hilo puede pertenecer a una sesión del mismo proyecto (los hilos viejos quedan sin sesión
-- y la app los agrupa en «Sesión general» la primera vez que se abre el proyecto).
alter table public.agent_threads
  add column if not exists session_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agent_threads_session_fk') then
    alter table public.agent_threads
      add constraint agent_threads_session_fk
      foreign key (session_id, project_id) references public.agent_sessions(id, project_id) on delete cascade;
  end if;
end $$;

create index if not exists agent_threads_session_idx on public.agent_threads (session_id, updated_at desc);

-- Seguridad: cada persona ve y crea solo sus sesiones en proyectos que puede leer.
alter table public.agent_sessions enable row level security;

drop policy if exists agent_sessions_select on public.agent_sessions;
create policy agent_sessions_select on public.agent_sessions for select to authenticated using (
  creator_id = auth.uid() and public.can_read_project(project_id)
);

drop policy if exists agent_sessions_insert on public.agent_sessions;
create policy agent_sessions_insert on public.agent_sessions for insert to authenticated with check (
  creator_id = auth.uid()
  and public.can_read_project(project_id)
  and status = 'active' and notes is null
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('entrepreneur', 'mentor'))
);

-- Renombrar, archivar y mover hilos lo hace el servidor después de verificar a quien los creó.
grant select, insert on public.agent_sessions to authenticated;
grant all on public.agent_sessions to service_role;
