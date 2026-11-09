-- ════════════════════════════════════════════════════════════════════
-- RAX · Pivot B2B, Fase 5 (Dev A): lo que la persona cliente lee por la API de Supabase
--
-- 1. Sesiones. sessions_select_client (20261107000001) le dejaba leer la fila completa de
--    mentor_sessions: incluye `briefing` y `pre_session_briefing` (la preparación del mentor) y
--    `post_session_synthesis` (su síntesis interna). RLS es por fila, no por columna, así que se
--    quita la política y el cliente lee la vista `client_sessions`, con solo las columnas seguras.
--    Los servicios (sala, llamada, ciclo, portal) leen la tabla como sistema DESPUÉS de verificar
--    que quien mira es cliente del proyecto (lib/services/session-visibility.ts).
--
-- 2. Comentarios. comments_select_client / comments_insert_client aceptaban cualquier documento del
--    proyecto: un cliente podía leer (o escribir) comentarios de un borrador sin publicar o de material
--    publicado solo para otra persona del grupo. Ahora el documento tiene que estar publicado para él.
--
-- 3. Tareas. tasks_select_client mostraba todas las tareas del proyecto, también las del mentor.
--    Ahora el cliente ve las tareas asignadas a personas cliente del proyecto (las suyas y, en un
--    proyecto grupal, los compromisos del grupo), nunca las del mentor.
--
-- Sin cambios (revisadas): members_select_client y profiles_select_b2b (solo quienes comparten el
-- proyecto), notes_select_client (solo notas no privadas), session_calls/segments (su llamada).
--
-- Queda para la limpieza posterior al flag (ver docs/b2b-rollout.md): la política vieja
-- sessions_select usa can_read_project, que incluye a la dueña (owner_id). En los proyectos migrados
-- la dueña también es cliente y sigue leyendo la fila completa hasta que se retire el flujo viejo.
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Sesiones ─────────────────────────────────────────────────────
drop policy if exists sessions_select_client on public.mentor_sessions;

-- La vista corre con los permisos de su dueño (no security_invoker) y filtra ella misma por cliente;
-- security_barrier evita que un filtro de quien consulta se evalúe antes y filtre datos ocultos.
drop view if exists public.client_sessions;
create view public.client_sessions with (security_barrier = true) as
  select s.id, s.project_id, s.mentor_id, s.relation_id, s.kind, s.status, s.session_number, s.agenda,
         s.scheduled_at, s.confirmed_at, s.started_at, s.completed_at, s.created_at
  from public.mentor_sessions s
  where public.is_project_client(s.project_id);
comment on view public.client_sessions is
  'Sesiones que ve la persona cliente B2B: sin briefing, pre_session_briefing ni post_session_synthesis.';
revoke all on public.client_sessions from anon, authenticated;
grant select on public.client_sessions to authenticated, service_role;

-- ── 2. Comentarios: solo sobre material publicado para mí, o sobre una sesión de mi proyecto ──
-- Funciones security definer: el cliente ya no lee mentor_sessions y la política no debe depender
-- de lo que RLS le muestre de project_documents.
create or replace function public.client_can_see_document(doc uuid, pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_project_client(pid) and exists (
    select 1 from public.project_documents d
    where d.id = doc and d.project_id = pid and d.visibility = 'published'
      and (d.audience_client_id is null or d.audience_client_id = auth.uid())
  );
$$;
create or replace function public.client_can_see_session(sid uuid, pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_project_client(pid) and exists (
    select 1 from public.mentor_sessions s where s.id = sid and s.project_id = pid
  );
$$;
revoke all on function public.client_can_see_document(uuid, uuid), public.client_can_see_session(uuid, uuid) from public;
grant execute on function public.client_can_see_document(uuid, uuid), public.client_can_see_session(uuid, uuid)
  to authenticated, service_role;

drop policy if exists comments_select_client on public.comments;
create policy comments_select_client on public.comments for select to authenticated using (
  (target_type::text = 'document' and public.client_can_see_document(target_id, project_id))
  or (target_type::text = 'session' and public.client_can_see_session(target_id, project_id))
);
drop policy if exists comments_insert_client on public.comments;
create policy comments_insert_client on public.comments for insert to authenticated with check (
  author_id = auth.uid()
  and (
    (target_type::text = 'document' and public.client_can_see_document(target_id, project_id))
    or (target_type::text = 'session' and public.client_can_see_session(target_id, project_id))
  )
);

-- ── 3. Tareas: las de personas cliente del proyecto, no las del mentor ──
drop policy if exists tasks_select_client on public.tasks;
create policy tasks_select_client on public.tasks for select to authenticated using (
  public.is_project_client(project_id)
  and (
    assignee_id = auth.uid()
    or exists (
      select 1 from public.project_members m
      where m.project_id = tasks.project_id and m.profile_id = tasks.assignee_id and m.role::text = 'client'
    )
  )
);
