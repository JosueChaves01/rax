-- Pruebas de RLS y guardas. Ejecutar sobre una base con 00_local_stubs.sql + migraciones.
-- Cada bloque cambia de usuario con set_config(..., true) dentro de la transacción.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.act(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', case when uid is null then 'service_role' else 'authenticated' end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
end $$;

create function pg_temp.expect_denied(label text, stmt text) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FALLO: % debía ser rechazado y afectó % filas', label, n; end if;
  exception when insufficient_privilege or check_violation or raise_exception then
    null; -- rechazado como se esperaba
  end;
  raise notice 'ok  %', label;
end $$;

create function pg_temp.expect(label text, cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALLO: %', label; end if;
  raise notice 'ok  %', label;
end $$;

-- Personas (el trigger crea perfiles).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@test', '{"name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'luis@test', '{"name":"Luis"}'),
  ('00000000-0000-0000-0000-00000000000c', 'carla@test', '{"name":"Carla"}'),
  ('00000000-0000-0000-0000-00000000000d', 'diego@test', '{"name":"Diego"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@test', '{"name":"Admin"}');
update public.profiles set role = 'mentor' where email in ('carla@test', 'diego@test');
update public.profiles set role = 'admin' where email = 'admin@test';

-- Sin onboarding no se crean proyectos.
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_denied('sin onboarding no se crean proyectos',
  $$insert into public.projects (owner_id, name) values ('00000000-0000-0000-0000-00000000000a', 'Prematuro')$$);
update public.profiles set onboarded_at = now(), onboarding = '{"intent":"entrepreneur"}' where id = auth.uid();

-- Ana crea su proyecto; el servidor (service role) crea conversación, diagnóstico y membresía.
insert into public.projects (id, owner_id, name) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Almuerzos saludables');
select pg_temp.expect_denied('el dueño no agrega un mentor como colaborador',
  $$insert into public.project_members (project_id, profile_id, role)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'collaborator')$$);
select pg_temp.expect_denied('el dueño no agrega un admin como colaborador',
  $$insert into public.project_members (project_id, profile_id, role)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ad', 'collaborator')$$);
select pg_temp.expect_denied('el cliente no crea la conversación',
  $$insert into public.conversations (project_id) values ('10000000-0000-0000-0000-000000000001')$$);
select pg_temp.expect_denied('el cliente no se agrega como dueño de otro proyecto',
  $$insert into public.project_members (project_id, profile_id, role) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'owner')$$);
select pg_temp.act(null);
insert into public.project_members (project_id, profile_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner');
insert into public.conversations (project_id) values ('10000000-0000-0000-0000-000000000001');
insert into public.diagnoses (project_id) values ('10000000-0000-0000-0000-000000000001');
select pg_temp.act('00000000-0000-0000-0000-0000000000ad');
select pg_temp.act(null);
insert into public.project_members (project_id, profile_id, role)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ad', 'collaborator');
select pg_temp.act('00000000-0000-0000-0000-0000000000ad');
select pg_temp.expect('admin con fila collaborator heredada no es miembro de proyecto',
  not public.is_project_member('10000000-0000-0000-0000-000000000001'));
select pg_temp.expect('admin no obtiene acceso al contenido del proyecto', (select count(*) from public.diagnosis_items) = 0);
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
insert into public.messages (conversation_id, project_id, author, content)
select id, project_id, 'assistant', 'Hola. Texto fijo de la plataforma.' from public.conversations;
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect('Ana ve su proyecto con conversación y diagnóstico',
  (select count(*) from public.conversations) = 1 and (select count(*) from public.diagnoses) = 1);
select pg_temp.expect_denied('el cliente no escribe respuestas del asistente',
  $$insert into public.messages (conversation_id, project_id, author, content, provider)
    select id, project_id, 'assistant', 'inventado', 'openrouter' from public.conversations$$);
select pg_temp.expect_denied('Ana no puede crear proyectos a nombre de Luis',
  $$insert into public.projects (owner_id, name) values ('00000000-0000-0000-0000-00000000000b', 'Ajeno')$$);
select pg_temp.expect_denied('Ana no puede ascenderse a admin (trigger)',
  $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a'$$);
select pg_temp.expect_denied('Ana no se aprueba como mentora',
  $$update public.profiles set mentor_status = 'approved' where id = '00000000-0000-0000-0000-00000000000a'$$);
update public.profiles set mentor_status = 'pending' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect('Ana sí puede pedir ser mentora',
  (select mentor_status from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'pending');
insert into public.messages (conversation_id, project_id, author, author_id, content)
select id, project_id, 'entrepreneur', '00000000-0000-0000-0000-00000000000a', 'Vendo almuerzos a oficinas'
from public.conversations where project_id = '10000000-0000-0000-0000-000000000001';
insert into public.diagnosis_items (id, project_id, category, title, content, info_type, source_kind, author_id)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'problem',
        'Problema', 'No hay opciones sanas cerca', 'entrepreneur_statement', 'entrepreneur_edit',
        '00000000-0000-0000-0000-00000000000a');
select pg_temp.expect('el historial registra la creación',
  (select count(*) from public.diagnosis_item_history where item_id = '20000000-0000-0000-0000-000000000001') = 1);

-- Escenario F: otro emprendedor no ve nada del proyecto.
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect('Luis no ve el proyecto de Ana', (select count(*) from public.projects) = 0);
select pg_temp.expect('Luis no ve mensajes ni elementos',
  (select count(*) from public.messages) = 0 and (select count(*) from public.diagnosis_items) = 0
  and (select count(*) from public.diagnosis_item_history) = 0);
select pg_temp.expect_denied('Luis no puede escribir en el diagnóstico de Ana',
  $$insert into public.diagnosis_items (project_id, category, title, content, info_type, source_kind, author_id)
    values ('10000000-0000-0000-0000-000000000001', 'problem', 'x', 'x', 'entrepreneur_statement', 'entrepreneur_edit',
            '00000000-0000-0000-0000-00000000000b')$$);
select pg_temp.expect_denied('Luis no puede editar elementos de Ana',
  $$update public.diagnosis_items set content = 'hackeado'$$);

-- Mentor sin asignación tampoco ve nada.
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect('Carla sin asignación no ve el proyecto', (select count(*) from public.projects) = 0);
select pg_temp.expect_denied('una mentora no puede autoasignarse',
  $$insert into public.mentor_assignments (project_id, mentor_id, assigned_by)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c',
            '00000000-0000-0000-0000-00000000000c')$$);

-- La administración asigna a Carla.
select pg_temp.act('00000000-0000-0000-0000-0000000000ad');
insert into public.mentor_assignments (project_id, mentor_id, assigned_by)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c',
        '00000000-0000-0000-0000-0000000000ad');

-- Notas de sesión: el dueño ve las compartidas; solo el autor mentor ve las privadas.
select pg_temp.act(null);
insert into public.mentor_sessions (id, project_id, mentor_id, kind, status)
values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-00000000000c', 'follow_up', 'pending');
insert into public.session_notes (id, session_id, project_id, author_id, kind, body, is_private)
values
  ('51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'observation', 'Compartida', false),
  ('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'observation', 'Privada', true);
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect('Ana ve la nota compartida, no la privada',
  (select count(*) filter (where not is_private) = 1 and count(*) filter (where is_private) = 0
   from public.session_notes where session_id = '50000000-0000-0000-0000-000000000001'));
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect('Carla autora ve sus notas compartidas y privadas',
  (select count(*) = 2 from public.session_notes where session_id = '50000000-0000-0000-0000-000000000001'));
select pg_temp.act('00000000-0000-0000-0000-0000000000ad');
insert into public.mentor_assignments (project_id, mentor_id, assigned_by)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d',
        '00000000-0000-0000-0000-0000000000ad');
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect('un mentor asignado distinto del autor solo ve notas compartidas',
  (select count(*) filter (where not is_private) = 1 and count(*) filter (where is_private) = 0
   from public.session_notes where session_id = '50000000-0000-0000-0000-000000000001'));

select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect('Carla asignada ve el proyecto y el diagnóstico',
  (select count(*) from public.projects) = 1 and (select count(*) from public.diagnosis_items) = 1);
select pg_temp.expect('Carla no ve la conversación si Ana no la compartió', (select count(*) from public.messages) = 0);
select pg_temp.expect_denied('la mentora no reescribe el contenido del emprendedor',
  $$update public.diagnosis_items set content = 'otra cosa'$$);
update public.diagnosis_items set priority_rank = 1, priority_rationale = 'Es lo más urgente',
  priority_set_by = '00000000-0000-0000-0000-00000000000c', priority_set_at = now();
select pg_temp.expect('la mentora sí puede priorizar y la versión sube',
  (select version from public.diagnosis_items where id = '20000000-0000-0000-0000-000000000001') = 2);

-- Ana comparte la conversación.
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
update public.projects set share_conversation_with_mentor = true where id = '10000000-0000-0000-0000-000000000001';
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect('con permiso, Carla ve la conversación', (select count(*) from public.messages) = 2);

-- Chat del agente: un hilo privado por actor, separado de la conversación compartida.
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
insert into public.agent_threads (id, project_id, creator_id) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a');
insert into public.agent_messages (id, thread_id, project_id, author, author_id, content) values
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'user', '00000000-0000-0000-0000-00000000000a', 'Consulta privada');
select pg_temp.expect_denied('el cliente no suplanta mensajes del agente',
  $$insert into public.agent_messages (thread_id, project_id, author, author_id, content)
    values ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'assistant', '00000000-0000-0000-0000-00000000000a', 'respuesta falsa')$$);
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect('la mentora asignada no lee el hilo privado de Ana',
  (select count(*) = 0 from public.agent_messages where thread_id = '60000000-0000-0000-0000-000000000001'));
insert into public.agent_threads (id, project_id, creator_id) values
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c');
insert into public.agent_messages (thread_id, project_id, author, author_id, content) values
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'user', '00000000-0000-0000-0000-00000000000c', 'Consulta de mentor');
select pg_temp.expect('la mentora solo ve su propio hilo',
  (select count(*) = 1 from public.agent_messages where thread_id = '60000000-0000-0000-0000-000000000002'));

-- Hipótesis: solo la mentora asignada aprueba.
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
insert into public.hypotheses (id, project_id, statement, proposed_by, status) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Al menos 8 de 20 oficinas reservan una semana de prueba', '00000000-0000-0000-0000-00000000000a', 'draft');
select pg_temp.expect_denied('no se crean hipótesis ya aprobadas',
  $$insert into public.hypotheses (project_id, statement, proposed_by, status) values
    ('10000000-0000-0000-0000-000000000001', 'x', '00000000-0000-0000-0000-00000000000a', 'approved')$$);
update public.hypotheses set status = 'pending_approval' where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.expect_denied('el emprendedor no aprueba su propia hipótesis',
  $$update public.hypotheses set status = 'approved' where id = '30000000-0000-0000-0000-000000000001'$$);
select pg_temp.act('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_denied('un mentor no asignado no aprueba',
  $$update public.hypotheses set status = 'approved' where id = '30000000-0000-0000-0000-000000000001'$$);
select pg_temp.act(null);
select pg_temp.expect_denied('el servidor (IA) no simula una aprobación',
  $$update public.hypotheses set status = 'approved' where id = '30000000-0000-0000-0000-000000000001'$$);
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
update public.hypotheses set status = 'approved' where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.expect('la mentora asignada aprueba y queda registrada',
  (select approved_by from public.hypotheses where id = '30000000-0000-0000-0000-000000000001')
  = '00000000-0000-0000-0000-00000000000c');

-- Experimento: criterios bloqueados al iniciar.
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
insert into public.experiments (id, project_id, hypothesis_id, question, metric, success_criterion,
  rejection_criterion, owner_id, status, criteria_locked_at)
values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', '¿Reservan?', 'Reservas', '>= 8', '< 4',
  '00000000-0000-0000-0000-00000000000a', 'design', null);
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect_denied('la mentora no inicia el experimento del emprendedor',
  $$update public.experiments set status = 'running', criteria_locked_at = now()$$);
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
update public.experiments set status = 'running', criteria_locked_at = now();
select pg_temp.expect_denied('no se cambian criterios después de iniciar',
  $$update public.experiments set success_criterion = '>= 2' where id = '40000000-0000-0000-0000-000000000001'$$);

-- IA (servidor) no pisa contenido revisado.
select pg_temp.act(null);
select pg_temp.expect_denied('la IA no modifica un elemento escrito por una persona',
  $$update public.diagnosis_items set content = 'reinterpretado' where id = '20000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_denied('la IA no registra evidencia verificable',
  $$insert into public.diagnosis_items (project_id, category, title, content, info_type, source_kind)
    values ('10000000-0000-0000-0000-000000000001', 'problem', 'x', 'x', 'verifiable_evidence', 'ai')$$);

-- Storage: carpeta = id del proyecto.
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
insert into storage.objects (bucket_id, name) values ('evidence', '10000000-0000-0000-0000-000000000001/acta.pdf');
select pg_temp.act('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_denied('Luis no sube archivos al proyecto de Ana',
  $$insert into storage.objects (bucket_id, name) values ('evidence', '10000000-0000-0000-0000-000000000001/x.pdf')$$);
select pg_temp.expect('Luis no ve archivos de Ana', (select count(*) from storage.objects) = 0);
select pg_temp.act('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect('la mentora asignada ve la evidencia', (select count(*) from storage.objects) = 1);

-- Nada se borra desde el cliente.
select pg_temp.act('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_denied('el dueño no borra historial',
  $$delete from public.diagnosis_item_history$$);
select pg_temp.expect_denied('el dueño no borra elementos', $$delete from public.diagnosis_items$$);

-- Anónimo no ve nada.
select set_config('role', 'anon', true);
select pg_temp.expect_denied('anónimo no lee proyectos', $$select 1 from public.projects$$);

rollback;
