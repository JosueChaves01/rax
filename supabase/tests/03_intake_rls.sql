-- Pruebas de RLS de la transcripción del intake (20261109000201_intake_transcript.sql): la entrevista
-- de una persona no la lee el resto del grupo, y desde la API nadie escribe mensajes de intake.
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

-- Mara (mentora), Cami (dueña / cliente principal) y Beto (otra persona del grupo).
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-00000000000a', 'mara3@test', '{"name":"Mara"}'),
  ('c0000000-0000-0000-0000-00000000000c', 'cami3@test', '{"name":"Cami"}'),
  ('c0000000-0000-0000-0000-00000000000b', 'beto3@test', '{"name":"Beto"}');
update public.profiles set role = 'mentor', onboarded_at = now() where email = 'mara3@test';
update public.profiles set onboarded_at = now() where email in ('cami3@test', 'beto3@test');

select pg_temp.act(null);
insert into public.projects (id, owner_id, mentor_id, name, mode) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-00000000000a', 'Panadería', 'group');
insert into public.project_members (project_id, profile_id, role) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'owner'),
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000b', 'collaborator');
insert into public.conversations (id, project_id) values ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001');
-- El servidor guarda la entrevista de Beto (su respuesta y la del asistente).
insert into public.messages (conversation_id, project_id, author, author_id, content, intake_client_id) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'entrepreneur', 'c0000000-0000-0000-0000-00000000000b', 'Hago la repostería', 'c0000000-0000-0000-0000-00000000000b');
insert into public.messages (conversation_id, project_id, author, provider, content, intake_client_id) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'assistant', 'simulated', '¿Qué te quita el sueño?', 'c0000000-0000-0000-0000-00000000000b');
-- Y un mensaje de la conversación vieja (sin intake).
insert into public.messages (conversation_id, project_id, author, author_id, content) values
  ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'entrepreneur', 'c0000000-0000-0000-0000-00000000000c', 'Mensaje viejo');

select pg_temp.act('c0000000-0000-0000-0000-00000000000b');
select pg_temp.expect('Beto lee su propia entrevista', (select count(*) from public.messages where intake_client_id is not null) = 2);

select pg_temp.act('c0000000-0000-0000-0000-00000000000c');
select pg_temp.expect('la dueña no lee la entrevista de otra persona del grupo', (select count(*) from public.messages where intake_client_id is not null) = 0);
select pg_temp.expect('la dueña sigue leyendo la conversación vieja', (select count(*) from public.messages where intake_client_id is null) = 1);
select pg_temp.expect_denied('nadie escribe mensajes de intake desde la API',
  $$insert into public.messages (conversation_id, project_id, author, author_id, content, intake_client_id)
    values ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'entrepreneur', 'c0000000-0000-0000-0000-00000000000c', 'x', 'c0000000-0000-0000-0000-00000000000c')$$);

rollback;
