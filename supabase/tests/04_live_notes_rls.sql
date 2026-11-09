-- Pruebas de RLS de las notas en vivo (20261109000103_session_live_notes.sql): solo el mentor de la
-- sesión las lee y escribe; el cliente (que sí lee su fila de mentor_sessions) nunca las ve.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.act(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', case when uid is null then 'service_role' else 'authenticated' end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
end $$;

create function pg_temp.expect(label text, cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALLO: %', label; end if;
  raise notice 'ok  %', label;
end $$;

create function pg_temp.expect_denied(label text, stmt text) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FALLO: % debía ser rechazado y afectó % filas', label, n; end if;
  exception when insufficient_privilege or check_violation then
    null;
  end;
  raise notice 'ok  %', label;
end $$;

-- Mara (mentora del proyecto), Cami (cliente) y Tomás (mentor ajeno).
insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-00000000000a', 'mara4@test', '{"name":"Mara"}'),
  ('d0000000-0000-0000-0000-00000000000c', 'cami4@test', '{"name":"Cami"}'),
  ('d0000000-0000-0000-0000-00000000000f', 'tomas4@test', '{"name":"Tomás"}');
update public.profiles set role = 'mentor', onboarded_at = now() where email in ('mara4@test', 'tomas4@test');
update public.profiles set onboarded_at = now() where email = 'cami4@test';

select pg_temp.act(null);
insert into public.projects (id, mentor_id, name) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a', 'Panadería');
insert into public.projects (id, mentor_id, name) values
  ('d1000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-00000000000f', 'Otro proyecto');
insert into public.project_members (project_id, profile_id, role) values
  ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000c', 'client');
insert into public.mentor_sessions (id, project_id, mentor_id, kind, status) values
  ('d4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a', 'follow_up', 'in_progress');

select pg_temp.expect_denied('la columna vieja live_notes quedó retirada',
  $$update public.mentor_sessions set live_notes = 'secreto' where id = 'd4000000-0000-0000-0000-000000000001'$$);

-- La mentora escribe sus notas; project_id lo fija la sesión aunque intente otro.
select pg_temp.act('d0000000-0000-0000-0000-00000000000a');
insert into public.session_live_notes (session_id, project_id, text, updated_by) values
  ('d4000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002', 'Privado de la mentora', 'd0000000-0000-0000-0000-00000000000a');
select pg_temp.expect('la mentora lee sus notas', (select text from public.session_live_notes) = 'Privado de la mentora');
select pg_temp.expect('project_id sale de la sesión',
  (select project_id from public.session_live_notes) = 'd1000000-0000-0000-0000-000000000001');
-- Actualización condicional por versión (lo que hace saveLiveNotes).
update public.session_live_notes set text = 'v2', version = 2 where session_id = 'd4000000-0000-0000-0000-000000000001' and version = 1;
update public.session_live_notes set text = 'pisado', version = 2 where session_id = 'd4000000-0000-0000-0000-000000000001' and version = 1;
select pg_temp.expect('la escritura con versión vieja no pisa', (select text from public.session_live_notes) = 'v2');

select pg_temp.act('d0000000-0000-0000-0000-00000000000c');
select pg_temp.expect('Cami ve su sesión', (select count(*) from public.mentor_sessions where id = 'd4000000-0000-0000-0000-000000000001') = 1);
select pg_temp.expect('Cami no ve notas en la fila de la sesión', (select live_notes from public.mentor_sessions where id = 'd4000000-0000-0000-0000-000000000001') = '');
select pg_temp.expect('Cami no lee las notas en vivo', (select count(*) from public.session_live_notes) = 0);
select pg_temp.expect_denied('Cami no edita las notas en vivo',
  $$update public.session_live_notes set text = 'x' where session_id = 'd4000000-0000-0000-0000-000000000001'$$);

select pg_temp.act('d0000000-0000-0000-0000-00000000000f');
select pg_temp.expect('un mentor ajeno no lee las notas', (select count(*) from public.session_live_notes) = 0);

rollback;
