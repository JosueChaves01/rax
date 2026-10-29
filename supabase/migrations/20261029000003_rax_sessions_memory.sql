-- Migration 20261029000003_rax_sessions_memory.sql
-- Fase 4: Ciclo de sesiones de mentoría y memoria contextual

-- 1. Ampliación de tipos enumerados de sesiones y notas
alter type public.mentor_session_kind add value if not exists 'exploratory';
alter type public.mentor_session_kind add value if not exists 'follow_up';
alter type public.mentor_session_kind add value if not exists 'evaluation';

alter type public.session_note_kind add value if not exists 'commitment';
alter type public.session_note_kind add value if not exists 'blocker';
alter type public.session_note_kind add value if not exists 'decision';

-- 2. Nuevas columnas en mentor_sessions para ciclo y memoria
alter table public.mentor_sessions
  add column if not exists scheduled_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists relation_id uuid references public.mentorship_relations (id) on delete set null,
  add column if not exists pre_session_briefing jsonb,
  add column if not exists post_session_synthesis jsonb;

create index if not exists mentor_sessions_relation_idx on public.mentor_sessions (relation_id);
create index if not exists mentor_sessions_scheduled_idx on public.mentor_sessions (scheduled_at);

-- 3. Privacidad dual en notas de sesión (pública compartida vs privada del mentor)
alter table public.session_notes
  add column if not exists is_private boolean not null default false;

-- 4. Actualización de RLS en session_notes: notas privadas solo las ve su autor
drop policy if exists notes_select on public.session_notes;
create policy notes_select on public.session_notes for select to authenticated using (
  public.can_read_project(project_id) and (not is_private or author_id = auth.uid())
);

