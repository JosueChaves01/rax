-- ════════════════════════════════════════════════════════════════════
-- RAX · Llamadas con transcripción dentro de una sesión de mentoría
-- El mentor de la sesión y la persona emprendedora (dueña o colaboradora) se conectan por WebRTC.
-- Cada navegador transcribe su propio micrófono (Groq Whisper, desde el servidor) y los fragmentos
-- quedan en session_call_segments. Al colgar, la transcripción completa se guarda como documento
-- del proyecto (contexto del agente) y alimenta la síntesis pos-sesión.
-- Las escrituras las hace el servidor (service role) después de verificar a quien participa.
-- La señalización usa Supabase Realtime (canal privado «call:<id>»), restringido a quienes
-- pueden leer el proyecto de la llamada.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.session_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mentor_sessions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  started_by uuid not null references public.profiles (id),
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by uuid references public.profiles (id),
  transcript_document_id uuid references public.project_documents (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((status = 'ended') = (ended_at is not null))
);

-- Una sola llamada abierta por sesión: quien llega después se une a la misma.
create unique index if not exists session_calls_open_uq on public.session_calls (session_id) where status = 'active';
create index if not exists session_calls_project_idx on public.session_calls (project_id, started_at desc);

create table if not exists public.session_call_segments (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.session_calls (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  speaker_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 8000),
  offset_ms integer not null default 0 check (offset_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists session_call_segments_call_idx on public.session_call_segments (call_id, offset_ms);

alter table public.session_calls enable row level security;
alter table public.session_call_segments enable row level security;

drop policy if exists session_calls_select on public.session_calls;
create policy session_calls_select on public.session_calls for select to authenticated using (
  public.can_read_project(project_id)
);

drop policy if exists session_call_segments_select on public.session_call_segments;
create policy session_call_segments_select on public.session_call_segments for select to authenticated using (
  public.can_read_project(project_id)
);

grant select on public.session_calls, public.session_call_segments to authenticated;
grant all on public.session_calls, public.session_call_segments to service_role;

-- ── Señalización por Realtime (canales privados «call:<uuid>») ─────────
-- Solo quienes pueden leer el proyecto de una llamada abierta reciben y envían mensajes del canal.
create or replace function public.can_join_call(topic text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.session_calls c
    where split_part(topic, ':', 1) = 'call'
      and c.id::text = split_part(topic, ':', 2)
      and c.status = 'active'
      and public.can_read_project(c.project_id)
  );
$$;

revoke all on function public.can_join_call(text) from public;
grant execute on function public.can_join_call(text) to authenticated;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute 'drop policy if exists rax_call_signaling_read on realtime.messages';
    execute 'create policy rax_call_signaling_read on realtime.messages for select to authenticated using (
      realtime.messages.extension in (''broadcast'', ''presence'') and public.can_join_call(realtime.topic())
    )';
    execute 'drop policy if exists rax_call_signaling_write on realtime.messages';
    execute 'create policy rax_call_signaling_write on realtime.messages for insert to authenticated with check (
      realtime.messages.extension in (''broadcast'', ''presence'') and public.can_join_call(realtime.topic())
    )';
  end if;
end $$;
