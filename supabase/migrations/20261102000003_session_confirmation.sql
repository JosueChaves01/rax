-- Confirmación de las revisiones y sesiones de mentoría.
-- El emprendedor pide la revisión con una fecha; el mentor de la sesión la confirma (o propone otra y
-- queda confirmada). confirmed_at vacío = fecha pedida y todavía sin confirmar.
-- La política sessions_mentor_update ya permite al mentor asignado actualizar su sesión.

alter table public.mentor_sessions
  add column if not exists confirmed_at timestamptz;

-- Una sesión confirmada tiene fecha.
alter table public.mentor_sessions
  drop constraint if exists mentor_sessions_confirmed_has_date;
alter table public.mentor_sessions
  add constraint mentor_sessions_confirmed_has_date check (confirmed_at is null or scheduled_at is not null);
