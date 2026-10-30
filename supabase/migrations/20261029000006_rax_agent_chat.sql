-- Private, unified-agent chat storage. Kept separate from interview conversations/messages.
create table if not exists public.agent_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'error', 'closed')),
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, creator_id),
  unique (id, project_id)
);

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  project_id uuid not null,
  author text not null check (author in ('user', 'assistant')),
  author_id uuid not null references public.profiles(id),
  content text not null check (length(content) between 1 and 10000),
  proposals jsonb not null default '[]'::jsonb check (jsonb_typeof(proposals) = 'array'),
  status text not null default 'complete' check (status in ('complete', 'failed')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  foreign key (thread_id, project_id) references public.agent_threads(id, project_id) on delete cascade,
  check (author <> 'user' or (status = 'complete' and proposals = '[]'::jsonb and error_code is null and error_message is null))
);

create index if not exists agent_messages_thread_created_idx on public.agent_messages(thread_id, created_at, id);
alter table public.agent_threads enable row level security;
alter table public.agent_messages enable row level security;

drop policy if exists agent_threads_select on public.agent_threads;
create policy agent_threads_select on public.agent_threads for select to authenticated using (
  creator_id = auth.uid() and public.can_read_project(project_id)
);
drop policy if exists agent_threads_insert on public.agent_threads;
create policy agent_threads_insert on public.agent_threads for insert to authenticated with check (
  creator_id = auth.uid()
  and public.can_read_project(project_id)
  and status = 'active' and last_error_code is null and last_error_message is null
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('entrepreneur', 'mentor'))
);

drop policy if exists agent_messages_select on public.agent_messages;
create policy agent_messages_select on public.agent_messages for select to authenticated using (
  exists (
    select 1 from public.agent_threads t
    where t.id = thread_id and t.project_id = project_id
      and t.creator_id = auth.uid() and public.can_read_project(t.project_id)
  )
);
drop policy if exists agent_messages_user_insert on public.agent_messages;
create policy agent_messages_user_insert on public.agent_messages for insert to authenticated with check (
  author = 'user' and author_id = auth.uid()
  and exists (
    select 1 from public.agent_threads t
    where t.id = thread_id and t.project_id = project_id
      and t.creator_id = auth.uid() and public.can_read_project(t.project_id)
  )
);

grant select, insert on public.agent_threads to authenticated;
grant select, insert on public.agent_messages to authenticated;
grant all on public.agent_threads, public.agent_messages to service_role;
