-- Pruebas de RLS del pivot B2B (20261107000001_b2b_pivot_core.sql): mentor dueño operativo,
-- clientes por invitación, documentos publicados, intake, evaluaciones y notificaciones.
\set ON_ERROR_STOP 1
begin;

create function pg_temp.act(uid uuid, mail text default null) returns void language plpgsql as $$
begin
  perform set_config('role', case when uid is null then 'service_role' else 'authenticated' end, true);
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claim.email', coalesce(mail, ''), true);
end $$;

create function pg_temp.expect_denied(label text, stmt text) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'FALLO: % debía ser rechazado y afectó % filas', label, n; end if;
  exception when insufficient_privilege or check_violation or unique_violation or raise_exception then
    null;
  end;
  raise notice 'ok  %', label;
end $$;

create function pg_temp.expect(label text, cond boolean) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALLO: %', label; end if;
  raise notice 'ok  %', label;
end $$;

-- Personas: Mara (mentora), Cami y Beto (clientes), Ximena (ajena), Tomás (mentor ajeno).
insert into auth.users (id, email, raw_user_meta_data) values
  ('b0000000-0000-0000-0000-00000000000a', 'mara@test', '{"name":"Mara"}'),
  ('b0000000-0000-0000-0000-00000000000c', 'cami@test', '{"name":"Cami"}'),
  ('b0000000-0000-0000-0000-00000000000b', 'beto@test', '{"name":"Beto"}'),
  ('b0000000-0000-0000-0000-00000000000e', 'ximena@test', '{"name":"Ximena"}'),
  ('b0000000-0000-0000-0000-00000000000f', 'tomas@test', '{"name":"Tomás"}');
update public.profiles set role = 'mentor', onboarded_at = now()
  where email in ('mara@test', 'tomas@test');
update public.profiles set onboarded_at = now() where email in ('cami@test', 'beto@test', 'ximena@test');

-- ── La mentora crea el proyecto sin cliente ─────────────────────────
select pg_temp.act('b0000000-0000-0000-0000-00000000000c', 'cami@test');
select pg_temp.expect_denied('un cliente no crea proyectos como mentor',
  $$insert into public.projects (mentor_id, name) values ('b0000000-0000-0000-0000-00000000000c', 'Falso')$$);

select pg_temp.act('b0000000-0000-0000-0000-00000000000a', 'mara@test');
insert into public.projects (id, mentor_id, name, mode) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'Panadería de barrio', 'group');
select pg_temp.expect('la mentora es mentora del proyecto', public.is_project_mentor('b1000000-0000-0000-0000-000000000001'));
select pg_temp.expect('la mentora lee su proyecto', (select count(*) from public.projects where id = 'b1000000-0000-0000-0000-000000000001') = 1);
select pg_temp.expect('can_read_project incluye a la mentora', public.can_read_project('b1000000-0000-0000-0000-000000000001'));
select pg_temp.expect_denied('la mentora no cambia la etapa directo',
  $$update public.projects set cycle_stage = 'cycle' where id = 'b1000000-0000-0000-0000-000000000001'$$);
update public.projects set client_context = 'Contexto que completa la mentora' where id = 'b1000000-0000-0000-0000-000000000001';
select pg_temp.expect('la mentora completa el contexto del cliente',
  (select client_context from public.projects where id = 'b1000000-0000-0000-0000-000000000001') <> '');

select pg_temp.act('b0000000-0000-0000-0000-00000000000f', 'tomas@test');
select pg_temp.expect('un mentor ajeno no es mentor del proyecto', not public.is_project_mentor('b1000000-0000-0000-0000-000000000001'));
select pg_temp.expect('un mentor ajeno no ve el proyecto', (select count(*) from public.projects where id = 'b1000000-0000-0000-0000-000000000001') = 0);

-- ── Invitaciones ────────────────────────────────────────────────────
select pg_temp.act('b0000000-0000-0000-0000-00000000000a', 'mara@test');
insert into public.project_invitations (id, project_id, email, invited_by) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'cami@test', 'b0000000-0000-0000-0000-00000000000a'),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'beto@test', 'b0000000-0000-0000-0000-00000000000a');
select pg_temp.expect('la mentora ve sus invitaciones', (select count(*) from public.project_invitations) = 2);

select pg_temp.act('b0000000-0000-0000-0000-00000000000e', 'ximena@test');
select pg_temp.expect('una persona ajena no ve invitaciones de otros', (select count(*) from public.project_invitations) = 0);
select pg_temp.expect_denied('una persona ajena no se invita sola',
  $$insert into public.project_invitations (project_id, email, invited_by)
    values ('b1000000-0000-0000-0000-000000000001', 'ximena@test', 'b0000000-0000-0000-0000-00000000000e')$$);

select pg_temp.act('b0000000-0000-0000-0000-00000000000c', 'Cami@Test');
select pg_temp.expect('la invitada ve su invitación (correo sin distinguir mayúsculas)', (select count(*) from public.project_invitations) = 1);
select pg_temp.expect_denied('la invitada no cambia el correo de la invitación',
  $$update public.project_invitations set email = 'otra@test' where id = 'b2000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_denied('la invitada no pasa la invitación a revocada',
  $$update public.project_invitations set status = 'revoked', responded_by = auth.uid() where id = 'b2000000-0000-0000-0000-000000000001'$$);
update public.project_invitations set status = 'accepted', responded_by = auth.uid(), responded_at = now()
  where id = 'b2000000-0000-0000-0000-000000000001';
select pg_temp.expect('la invitada acepta', (select status from public.project_invitations where id = 'b2000000-0000-0000-0000-000000000001') = 'accepted');
select pg_temp.expect_denied('una invitación respondida no se vuelve a cambiar',
  $$update public.project_invitations set status = 'declined', responded_by = auth.uid() where id = 'b2000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect('antes de la membresía no es cliente', not public.is_project_client('b1000000-0000-0000-0000-000000000001'));

-- El servidor (service role) da de alta la membresía al aceptar.
select pg_temp.act(null);
insert into public.project_members (project_id, profile_id, role) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000c', 'client'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'client');

select pg_temp.act('b0000000-0000-0000-0000-00000000000c', 'cami@test');
select pg_temp.expect('Cami es cliente del proyecto', public.is_project_client('b1000000-0000-0000-0000-000000000001'));
select pg_temp.expect('Cami no es mentora del proyecto', not public.is_project_mentor('b1000000-0000-0000-0000-000000000001'));
select pg_temp.expect('Cami ve el proyecto', (select count(*) from public.projects where id = 'b1000000-0000-0000-0000-000000000001') = 1);
select pg_temp.expect('can_read_project no incluye a clientes', not public.can_read_project('b1000000-0000-0000-0000-000000000001'));
select pg_temp.expect('Cami ve a la mentora', (select count(*) from public.profiles where id = 'b0000000-0000-0000-0000-00000000000a') = 1);
select pg_temp.expect_denied('Cami no edita el proyecto',
  $$update public.projects set name = 'Mío' where id = 'b1000000-0000-0000-0000-000000000001'$$);

-- ── Documentos publicados ───────────────────────────────────────────
select pg_temp.act('b0000000-0000-0000-0000-00000000000a', 'mara@test');
insert into public.project_documents (id, project_id, title, filename, content, created_by, visibility, audience_client_id) values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Borrador', 'borrador.md', 'Solo mentora', 'b0000000-0000-0000-0000-00000000000a', 'mentor_only', null),
  ('b3000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Guía grupal', 'guia.md', 'Para todo el grupo', 'b0000000-0000-0000-0000-00000000000a', 'published', null),
  ('b3000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'Para Beto', 'beto.md', 'Solo para Beto', 'b0000000-0000-0000-0000-00000000000a', 'published', 'b0000000-0000-0000-0000-00000000000b');
insert into public.project_document_chunks (project_id, document_id, chunk_index, content) values
  ('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 0, 'Solo mentora'),
  ('b1000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000002', 0, 'Para todo el grupo');
select pg_temp.expect('la mentora ve todos los documentos', (select count(*) from public.project_documents) = 3);

select pg_temp.act('b0000000-0000-0000-0000-00000000000c', 'cami@test');
select pg_temp.expect('Cami solo ve lo publicado para el grupo',
  (select array_agg(title order by title) from public.project_documents) = array['Guía grupal']);
select pg_temp.expect('Cami solo ve fragmentos publicados', (select count(*) from public.project_document_chunks) = 1);
select pg_temp.expect_denied('Cami no sube documentos',
  $$insert into public.project_documents (project_id, title, filename, content, created_by)
    values ('b1000000-0000-0000-0000-000000000001', 'X', 'x.md', 'x', 'b0000000-0000-0000-0000-00000000000c')$$);
select pg_temp.expect_denied('Cami no publica documentos',
  $$update public.project_documents set visibility = 'published' where id = 'b3000000-0000-0000-0000-000000000001'$$);

select pg_temp.act('b0000000-0000-0000-0000-00000000000b', 'beto@test');
select pg_temp.expect('Beto ve lo del grupo y lo suyo', (select count(*) from public.project_documents) = 2);

-- ── Notas de sesión y comentarios ───────────────────────────────────
select pg_temp.act(null);
insert into public.mentor_sessions (id, project_id, mentor_id, kind, status) values
  ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'follow_up', 'pending');
insert into public.session_notes (session_id, project_id, author_id, kind, body, is_private) values
  ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'observation', 'Visible', false),
  ('b4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'observation', 'Privada', true);
select pg_temp.act('b0000000-0000-0000-0000-00000000000c', 'cami@test');
select pg_temp.expect('Cami ve la sesión', (select count(*) from public.mentor_sessions) = 1);
select pg_temp.expect('Cami no ve notas privadas', (select array_agg(body) from public.session_notes) = array['Visible']);
insert into public.comments (project_id, target_type, target_id, author_id, body) values
  ('b1000000-0000-0000-0000-000000000001', 'document', 'b3000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000c', '¿Esto aplica a mi local?');
select pg_temp.expect('Cami comenta material publicado', (select count(*) from public.comments) = 1);

-- ── Intake: el brief solo lo ve la mentora ──────────────────────────
select pg_temp.act(null);
insert into public.intake_briefs (project_id, client_id, status, coverage, brief) values
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000c', 'submitted', '{"q1":"answered"}', '{"summary":"Brief de Cami"}'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'in_progress', '{}', null),
  ('b1000000-0000-0000-0000-000000000001', null, 'not_started', '{}', '{"summary":"Consolidado"}');
select pg_temp.expect_denied('solo hay un brief consolidado por proyecto',
  $$insert into public.intake_briefs (project_id, client_id) values ('b1000000-0000-0000-0000-000000000001', null)$$);
select pg_temp.act('b0000000-0000-0000-0000-00000000000c', 'cami@test');
select pg_temp.expect('Cami no lee la tabla de briefs', (select count(*) from public.intake_briefs) = 0);
select pg_temp.expect('Cami ve solo su avance', (select count(*) from public.intake_progress) = 1
  and (select status from public.intake_progress) = 'submitted');
select pg_temp.expect_denied('Cami no escribe su intake directo',
  $$insert into public.intake_briefs (project_id, client_id) values ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000e')$$);
select pg_temp.act('b0000000-0000-0000-0000-00000000000a', 'mara@test');
select pg_temp.expect('la mentora lee todos los briefs', (select count(*) from public.intake_briefs where brief is not null) = 2);
update public.intake_briefs set status = 'reviewed', reviewed_at = now()
  where client_id = 'b0000000-0000-0000-0000-00000000000c';
select pg_temp.expect('la mentora marca revisado', (select count(*) from public.intake_progress where status = 'reviewed') = 1);

-- ── Evaluaciones ────────────────────────────────────────────────────
insert into public.assessments (id, project_id, created_by, title, status) values
  ('b5000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'Borrador', 'draft'),
  ('b5000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'Publicada', 'published');
select pg_temp.act('b0000000-0000-0000-0000-00000000000c', 'cami@test');
select pg_temp.expect('Cami solo ve evaluaciones publicadas', (select array_agg(title) from public.assessments) = array['Publicada']);
select pg_temp.expect_denied('Cami no responde un borrador',
  $$insert into public.assessment_submissions (assessment_id, client_id) values ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000c')$$);
select pg_temp.expect_denied('Cami no se pone puntaje',
  $$insert into public.assessment_submissions (assessment_id, client_id, score) values ('b5000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000c', 10)$$);
insert into public.assessment_submissions (id, assessment_id, client_id, answers, status) values
  ('b6000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000c', '[{"questionId":"q1","value":"sí"}]', 'submitted');
select pg_temp.act('b0000000-0000-0000-0000-00000000000b', 'beto@test');
select pg_temp.expect('Beto no ve la entrega de Cami', (select count(*) from public.assessment_submissions) = 0);
select pg_temp.act('b0000000-0000-0000-0000-00000000000a', 'mara@test');
select pg_temp.expect('la mentora ve las entregas', (select count(*) from public.assessment_submissions) = 1);
update public.assessment_submissions set status = 'reviewed', score = 8, mentor_feedback = 'Bien', reviewed_at = now()
  where id = 'b6000000-0000-0000-0000-000000000001';
select pg_temp.expect('la mentora revisa la entrega', (select score from public.assessment_submissions) = 8);

-- ── Perfil y RAG del mentor ─────────────────────────────────────────
insert into public.mentor_profiles (mentor_id, headline) values ('b0000000-0000-0000-0000-00000000000a', 'Mentora de comercios');
insert into public.mentor_documents (id, mentor_id, title, filename, content) values
  ('b7000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'Metodología', 'metodo.md', 'Paso a paso');
insert into public.mentor_document_chunks (mentor_id, document_id, chunk_index, content) values
  ('b0000000-0000-0000-0000-00000000000a', 'b7000000-0000-0000-0000-000000000001', 0, 'Paso a paso');
select pg_temp.expect('la mentora ve su RAG', (select count(*) from public.mentor_document_chunks) = 1);
select pg_temp.act('b0000000-0000-0000-0000-00000000000c', 'cami@test');
select pg_temp.expect('el cliente no lee el perfil ni el RAG del mentor',
  (select count(*) from public.mentor_profiles) = 0 and (select count(*) from public.mentor_documents) = 0
  and (select count(*) from public.mentor_document_chunks) = 0);
select pg_temp.expect_denied('un cliente no crea un perfil de mentor',
  $$insert into public.mentor_profiles (mentor_id) values ('b0000000-0000-0000-0000-00000000000c')$$);
select pg_temp.act('b0000000-0000-0000-0000-00000000000f', 'tomas@test');
select pg_temp.expect('otro mentor no lee el RAG ajeno', (select count(*) from public.mentor_documents) = 0);

-- ── Notificaciones ──────────────────────────────────────────────────
select pg_temp.act(null);
insert into public.notifications (id, profile_id, kind, payload) values
  ('b8000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000c', 'project_invitation', '{"projectId":"b1000000-0000-0000-0000-000000000001"}'),
  ('b8000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'project_invitation', '{}');
select pg_temp.act('b0000000-0000-0000-0000-00000000000c', 'cami@test');
select pg_temp.expect('Cami ve solo sus notificaciones', (select count(*) from public.notifications) = 1);
update public.notifications set read_at = now() where id = 'b8000000-0000-0000-0000-000000000001';
select pg_temp.expect('Cami marca su notificación como leída', (select read_at is not null from public.notifications));
select pg_temp.expect_denied('Cami no cambia el contenido de la notificación',
  $$update public.notifications set kind = 'otra' where id = 'b8000000-0000-0000-0000-000000000001'$$);
select pg_temp.expect_denied('Cami no crea notificaciones',
  $$insert into public.notifications (profile_id, kind) values ('b0000000-0000-0000-0000-00000000000b', 'spam')$$);

-- ── Migración de datos de un proyecto existente ─────────────────────
select pg_temp.act(null);
update public.profiles set onboarded_at = now() where id = 'b0000000-0000-0000-0000-00000000000e';
insert into public.projects (id, owner_id, name) values ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000e', 'Proyecto viejo');
insert into public.project_members (project_id, profile_id, role) values ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000e', 'owner');
insert into public.diagnoses (project_id, summary) values ('b1000000-0000-0000-0000-000000000002', 'Resumen confirmado del diagnóstico');
insert into public.mentor_assignments (project_id, mentor_id, status, assigned_by) values
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000f', 'active', 'b0000000-0000-0000-0000-00000000000f');
insert into public.mentor_sessions (project_id, mentor_id, kind, status, completed_at) values
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000f', 'first_review', 'completed', now());
select public.rax_b2b_backfill();
select public.rax_b2b_backfill(); -- idempotente
select pg_temp.expect('backfill: mentor_id desde la asignación',
  (select mentor_id from public.projects where id = 'b1000000-0000-0000-0000-000000000002') = 'b0000000-0000-0000-0000-00000000000f');
select pg_temp.expect('backfill: el dueño pasa a cliente',
  (select role::text from public.project_members where project_id = 'b1000000-0000-0000-0000-000000000002') = 'client');
select pg_temp.expect('backfill: etapa cycle tras la primera revisión',
  (select cycle_stage from public.projects where id = 'b1000000-0000-0000-0000-000000000002') = 'cycle');
select pg_temp.expect('backfill: brief revisado desde el diagnóstico (una sola vez)',
  (select count(*) from public.intake_briefs where project_id = 'b1000000-0000-0000-0000-000000000002' and status = 'reviewed'
     and brief ->> 'summary' = 'Resumen confirmado del diagnóstico') = 1);
select pg_temp.act('b0000000-0000-0000-0000-00000000000e', 'ximena@test');
select pg_temp.expect('backfill: la dueña sigue viendo su proyecto', (select count(*) from public.projects where id = 'b1000000-0000-0000-0000-000000000002') = 1);
select pg_temp.expect_denied('backfill no lo ejecuta una persona', $$select public.rax_b2b_backfill()$$);

rollback;
