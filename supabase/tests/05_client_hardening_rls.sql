-- Pruebas de 20261109000104_client_read_hardening.sql: la persona cliente no lee la preparación del
-- mentor (solo la vista client_sessions), comenta solo material publicado para ella y no ve las
-- tareas del mentor.
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

-- Mara (mentora), Cami y Beto (clientes del grupo), Ximena (ajena).
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-00000000000a', 'mara5@test', '{"name":"Mara"}'),
  ('e0000000-0000-0000-0000-00000000000c', 'cami5@test', '{"name":"Cami"}'),
  ('e0000000-0000-0000-0000-00000000000b', 'beto5@test', '{"name":"Beto"}'),
  ('e0000000-0000-0000-0000-00000000000e', 'ximena5@test', '{"name":"Ximena"}');
update public.profiles set role = 'mentor', onboarded_at = now() where email = 'mara5@test';
update public.profiles set onboarded_at = now() where email in ('cami5@test', 'beto5@test', 'ximena5@test');

select pg_temp.act(null);
insert into public.projects (id, mentor_id, name, mode) values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'Taller grupal', 'group');
insert into public.project_members (project_id, profile_id, role) values
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000c', 'client'),
  ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000b', 'client');
insert into public.mentor_sessions (id, project_id, mentor_id, kind, status, session_number, briefing, pre_session_briefing, post_session_synthesis) values
  ('e4000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a',
   'follow_up', 'pending', 2, '{"secret":"brief"}', '{"secret":"prep"}', '{"secret":"synth"}');
insert into public.project_documents (id, project_id, title, filename, content, created_by, visibility, audience_client_id) values
  ('e3000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'Borrador', 'b.md', 'x', 'e0000000-0000-0000-0000-00000000000a', 'mentor_only', null),
  ('e3000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001', 'Guía', 'g.md', 'x', 'e0000000-0000-0000-0000-00000000000a', 'published', null),
  ('e3000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001', 'Para Beto', 'p.md', 'x', 'e0000000-0000-0000-0000-00000000000a', 'published', 'e0000000-0000-0000-0000-00000000000b');
insert into public.comments (project_id, target_type, target_id, author_id, body) values
  ('e1000000-0000-0000-0000-000000000001', 'document', 'e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'Nota sobre el borrador'),
  ('e1000000-0000-0000-0000-000000000001', 'document', 'e3000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000a', 'Sobre la guía'),
  ('e1000000-0000-0000-0000-000000000001', 'document', 'e3000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-00000000000a', 'Solo para Beto'),
  ('e1000000-0000-0000-0000-000000000001', 'session', 'e4000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000a', 'Sobre la sesión');
insert into public.tasks (project_id, title, assignee_id) values
  ('e1000000-0000-0000-0000-000000000001', 'Preparar material (mentora)', 'e0000000-0000-0000-0000-00000000000a'),
  ('e1000000-0000-0000-0000-000000000001', 'Compromiso de Cami', 'e0000000-0000-0000-0000-00000000000c'),
  ('e1000000-0000-0000-0000-000000000001', 'Compromiso de Beto', 'e0000000-0000-0000-0000-00000000000b');

-- La vista no tiene las columnas de preparación.
select pg_temp.expect('client_sessions no expone briefing ni síntesis',
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'client_sessions'
              and column_name in ('briefing', 'pre_session_briefing', 'post_session_synthesis', 'live_notes')));
select pg_temp.expect('la política sessions_select_client ya no existe',
  not exists (select 1 from pg_policies where tablename = 'mentor_sessions' and policyname = 'sessions_select_client'));

-- ── Cami (cliente) ─────────────────────────────────────────────────
select pg_temp.act('e0000000-0000-0000-0000-00000000000c');
select pg_temp.expect('Cami no lee la fila de mentor_sessions', (select count(*) from public.mentor_sessions) = 0);
select pg_temp.expect('Cami no lee el briefing', (select count(*) from public.mentor_sessions where pre_session_briefing is not null) = 0);
select pg_temp.expect('Cami ve su sesión con número y estado',
  (select session_number from public.client_sessions where id = 'e4000000-0000-0000-0000-000000000001') = 2);
select pg_temp.expect('Cami ve comentarios de la guía y de la sesión, no del borrador ni de lo de Beto',
  (select array_agg(body order by body) from public.comments) = array['Sobre la guía', 'Sobre la sesión']);
insert into public.comments (project_id, target_type, target_id, author_id, body) values
  ('e1000000-0000-0000-0000-000000000001', 'document', 'e3000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-00000000000c', 'Gracias'),
  ('e1000000-0000-0000-0000-000000000001', 'session', 'e4000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000c', 'Llego tarde');
select pg_temp.expect('Cami comenta la guía y la sesión', (select count(*) from public.comments where author_id = auth.uid()) = 2);
select pg_temp.expect_denied('Cami no comenta un borrador',
  $$insert into public.comments (project_id, target_type, target_id, author_id, body)
    values ('e1000000-0000-0000-0000-000000000001', 'document', 'e3000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000c', 'x')$$);
select pg_temp.expect_denied('Cami no comenta material de Beto',
  $$insert into public.comments (project_id, target_type, target_id, author_id, body)
    values ('e1000000-0000-0000-0000-000000000001', 'document', 'e3000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-00000000000c', 'x')$$);
select pg_temp.expect_denied('Cami no comenta una sesión de otro proyecto con su project_id',
  $$insert into public.comments (project_id, target_type, target_id, author_id, body)
    values ('e1000000-0000-0000-0000-000000000001', 'session', gen_random_uuid(), 'e0000000-0000-0000-0000-00000000000c', 'x')$$);
select pg_temp.expect('Cami ve los compromisos del grupo, no las tareas de la mentora',
  (select array_agg(title order by title) from public.tasks) = array['Compromiso de Beto', 'Compromiso de Cami']);

-- ── Beto ve lo publicado para él ───────────────────────────────────
select pg_temp.act('e0000000-0000-0000-0000-00000000000b');
select pg_temp.expect('Beto ve el comentario de su material',
  (select count(*) from public.comments where body = 'Solo para Beto') = 1);

-- ── Ximena (ajena) ─────────────────────────────────────────────────
select pg_temp.act('e0000000-0000-0000-0000-00000000000e');
select pg_temp.expect('una persona ajena no ve sesiones', (select count(*) from public.client_sessions) = 0);
select pg_temp.expect('una persona ajena no ve comentarios', (select count(*) from public.comments) = 0);
select pg_temp.expect('una persona ajena no ve tareas', (select count(*) from public.tasks) = 0);

-- ── La mentora sigue leyendo todo ──────────────────────────────────
select pg_temp.act('e0000000-0000-0000-0000-00000000000a');
select pg_temp.expect('la mentora lee la sesión completa',
  (select pre_session_briefing->>'secret' from public.mentor_sessions where id = 'e4000000-0000-0000-0000-000000000001') = 'prep');
select pg_temp.expect('la mentora ve todas las tareas', (select count(*) from public.tasks) = 3);
select pg_temp.expect('la mentora ve todos los comentarios', (select count(*) from public.comments) = 6);

rollback;
