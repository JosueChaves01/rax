-- ════════════════════════════════════════════════════════════════════
-- RAX · Fase Cero · Seguridad: RLS, reglas de integridad y trazabilidad
-- Replica en la base de datos la matriz de lib/authz.ts. El servidor de la app
-- también verifica permisos: esta capa existe para que una solicitud manipulada
-- directamente contra la API de Supabase tampoco pueda saltarse las reglas.
-- ════════════════════════════════════════════════════════════════════

-- ── Funciones de relación (security definer para evitar recursión de RLS) ──
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_project_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = pid and owner_id = auth.uid());
$$;

create or replace function public.is_project_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_project_owner(pid)
      or exists (select 1 from public.project_members where project_id = pid and profile_id = auth.uid());
$$;

create or replace function public.is_assigned_mentor(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.mentor_assignments a
    join public.profiles p on p.id = a.mentor_id
    where a.project_id = pid and a.mentor_id = auth.uid() and a.status = 'active' and p.role = 'mentor'
  );
$$;

create or replace function public.can_read_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_project_member(pid) or public.is_assigned_mentor(pid);
$$;

create or replace function public.mentor_can_read_conversation(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_assigned_mentor(pid)
     and exists (select 1 from public.projects where id = pid and share_conversation_with_mentor);
$$;

revoke all on function public.is_admin, public.is_project_owner, public.is_project_member,
  public.is_assigned_mentor, public.can_read_project, public.mentor_can_read_conversation from public;
grant execute on function public.is_admin, public.is_project_owner, public.is_project_member,
  public.is_assigned_mentor, public.can_read_project, public.mentor_can_read_conversation to authenticated;

-- ── Integridad: versionado optimista ───────────────────────────────
-- La versión la incrementa la base de datos; el cliente filtra con `where version = esperada`.
create or replace function public.bump_version() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

create trigger diagnosis_items_version before update on public.diagnosis_items for each row execute function public.bump_version();
create trigger hypotheses_version before update on public.hypotheses for each row execute function public.bump_version();
create trigger experiments_version before update on public.experiments for each row execute function public.bump_version();

-- ── Integridad: historial automático de elementos del diagnóstico ──
create or replace function public.record_item_history() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  kind public.item_change_kind;
begin
  if tg_op = 'INSERT' then
    kind := 'created';
  elsif new.review_status = 'rejected' and old.review_status <> 'rejected' then
    kind := 'rejected';
  elsif new.info_type = 'unknown' and old.info_type <> 'unknown' then
    kind := 'marked_unknown';
  elsif new.review_status = 'needs_clarification' and old.review_status <> 'needs_clarification' then
    kind := 'clarification_requested';
  elsif new.priority_rank is distinct from old.priority_rank or new.priority_rationale is distinct from old.priority_rationale then
    kind := 'prioritized';
  elsif new.evidence_ids <> old.evidence_ids then
    kind := 'evidence_attached';
  elsif new.review_status = 'confirmed' and old.review_status <> 'confirmed' and new.content = old.content then
    kind := 'confirmed';
  else
    kind := 'edited';
  end if;
  insert into public.diagnosis_item_history (item_id, project_id, version, change, before, after, actor_id, reason)
  values (
    new.id, new.project_id, new.version, kind,
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new),
    auth.uid(),
    nullif(current_setting('rax.change_reason', true), '')
  );
  return new;
end $$;

create trigger diagnosis_items_history after insert or update on public.diagnosis_items
  for each row execute function public.record_item_history();

-- ── Reglas de dominio que la base de datos también hace cumplir ────

-- Lo que un mentor puede cambiar de un elemento: prioridad y pedido de aclaración. Nada de contenido.
-- Y la IA (sin auth.uid(), vía service role) no puede pisar elementos ya revisados por personas.
create or replace function public.guard_diagnosis_item() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    -- Escrituras del servidor en nombre de la IA.
    if tg_op = 'UPDATE' and (old.author_id is not null or old.review_status <> 'proposed') then
      raise exception 'La IA no puede modificar un elemento revisado por una persona' using errcode = '42501';
    end if;
    if new.info_type in ('verifiable_evidence', 'agreed_decision', 'human_correction') and new.author_id is null then
      raise exception 'La IA no puede registrar evidencia, decisiones ni correcciones' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and not public.is_project_member(old.project_id) then
    if new.title is distinct from old.title or new.content is distinct from old.content
       or new.category is distinct from old.category or new.info_type is distinct from old.info_type
       or new.uncertainty is distinct from old.uncertainty or new.evidence_ids is distinct from old.evidence_ids
       or (new.review_status is distinct from old.review_status and new.review_status <> 'needs_clarification') then
      raise exception 'El mentor solo puede priorizar o pedir aclaraciones' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger diagnosis_items_guard before insert or update on public.diagnosis_items
  for each row execute function public.guard_diagnosis_item();

-- Aprobar una hipótesis requiere al mentor asignado; ninguna otra persona puede simularlo.
create or replace function public.guard_hypothesis() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    if auth.uid() is null or not public.is_assigned_mentor(new.project_id) then
      raise exception 'Solo el mentor asignado aprueba hipótesis' using errcode = '42501';
    end if;
    new.approved_by := auth.uid();
  end if;
  return new;
end $$;

create trigger hypotheses_guard before update on public.hypotheses for each row execute function public.guard_hypothesis();

-- Los criterios del experimento quedan fijos al iniciarlo.
create or replace function public.guard_experiment() returns trigger
language plpgsql as $$
begin
  if old.criteria_locked_at is not null and (
       new.metric is distinct from old.metric
    or new.success_criterion is distinct from old.success_criterion
    or new.rejection_criterion is distinct from old.rejection_criterion
    or new.criteria_locked_at is distinct from old.criteria_locked_at) then
    raise exception 'Los criterios se bloquearon al iniciar el experimento' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger experiments_guard before update on public.experiments for each row execute function public.guard_experiment();

-- El rol de un perfil solo lo cambia la administración.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Solo la administración cambia roles' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger profiles_role_guard before update on public.profiles for each row execute function public.guard_profile_role();

-- Al crear un proyecto: membresía del dueño, conversación y diagnóstico vacíos.
create or replace function public.bootstrap_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, profile_id, role) values (new.id, new.owner_id, 'owner');
  insert into public.conversations (project_id) values (new.id);
  insert into public.diagnoses (project_id) values (new.id);
  return new;
end $$;

create trigger projects_bootstrap after insert on public.projects for each row execute function public.bootstrap_project();

-- Perfil automático al registrarse (rol emprendedor por defecto).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), new.email);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security
-- Sin política = sin acceso. No hay políticas de DELETE: nada se borra desde el cliente.
-- ════════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.mentor_assignments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.diagnoses enable row level security;
alter table public.diagnosis_items enable row level security;
alter table public.diagnosis_item_history enable row level security;
alter table public.comments enable row level security;
alter table public.mentor_sessions enable row level security;
alter table public.session_notes enable row level security;
alter table public.hypotheses enable row level security;
alter table public.experiments enable row level security;
alter table public.experiment_results enable row level security;
alter table public.tasks enable row level security;
alter table public.evidence enable row level security;
alter table public.audit_events enable row level security;

-- Perfiles: el propio, los de quienes comparten un proyecto conmigo, o todos si soy admin.
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_admin()
  or exists (
    select 1 from public.projects p
    where public.can_read_project(p.id)
      and (p.owner_id = profiles.id
        or exists (select 1 from public.mentor_assignments a where a.project_id = p.id and a.mentor_id = profiles.id and a.status = 'active')
        or exists (select 1 from public.project_members m where m.project_id = p.id and m.profile_id = profiles.id))
  )
);
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Proyectos: lectura por miembros y mentores asignados. El admin ve metadatos (no contenido de otras tablas).
create policy projects_select on public.projects for select to authenticated using (public.can_read_project(id) or public.is_admin());
create policy projects_insert on public.projects for insert to authenticated with check (
  owner_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'entrepreneur')
);
create policy projects_update on public.projects for update to authenticated using (public.is_project_owner(id)) with check (public.is_project_owner(id));

create policy members_select on public.project_members for select to authenticated using (public.can_read_project(project_id));
create policy members_insert on public.project_members for insert to authenticated with check (public.is_project_owner(project_id) and role = 'collaborator');

create policy assignments_select on public.mentor_assignments for select to authenticated using (
  public.is_admin() or mentor_id = auth.uid() or public.is_project_member(project_id)
);
create policy assignments_admin_insert on public.mentor_assignments for insert to authenticated with check (public.is_admin() and assigned_by = auth.uid());
create policy assignments_admin_update on public.mentor_assignments for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Conversación: miembros; el mentor solo si el emprendedor la compartió.
create policy conversations_select on public.conversations for select to authenticated using (
  public.is_project_member(project_id) or public.mentor_can_read_conversation(project_id)
);
create policy messages_select on public.messages for select to authenticated using (
  public.is_project_member(project_id) or public.mentor_can_read_conversation(project_id)
);
-- Desde el cliente solo se insertan mensajes propios del emprendedor. Las respuestas del asistente
-- las escribe el servidor con la service role después de validar la salida del modelo.
create policy messages_insert_own on public.messages for insert to authenticated with check (
  public.is_project_member(project_id) and author = 'entrepreneur' and author_id = auth.uid() and provider is null
);

create policy diagnoses_select on public.diagnoses for select to authenticated using (public.can_read_project(project_id));
create policy diagnoses_update on public.diagnoses for update to authenticated using (public.is_project_owner(project_id)) with check (
  public.is_project_owner(project_id) and (summary_confirmed_by is null or summary_confirmed_by = auth.uid())
);

create policy items_select on public.diagnosis_items for select to authenticated using (public.can_read_project(project_id));
create policy items_insert on public.diagnosis_items for insert to authenticated with check (
  public.is_project_member(project_id) and author_id = auth.uid()
  and info_type in ('entrepreneur_statement', 'documented_observation', 'hypothesis', 'unknown')
);
-- Miembros editan; el mentor asignado también puede actualizar, pero el trigger guard_diagnosis_item
-- limita sus cambios a prioridad y pedido de aclaración.
create policy items_update on public.diagnosis_items for update to authenticated using (public.can_read_project(project_id)) with check (public.can_read_project(project_id));

-- Historial y auditoría: solo lectura desde el cliente (los escriben triggers o el servidor).
create policy history_select on public.diagnosis_item_history for select to authenticated using (public.can_read_project(project_id));
create policy audit_select on public.audit_events for select to authenticated using (
  public.is_admin() and action in ('mentor.assigned', 'mentor.revoked', 'access.denied', 'project.created', 'member.added')
  or (project_id is not null and public.is_project_owner(project_id))
);

create policy comments_select on public.comments for select to authenticated using (public.can_read_project(project_id));
create policy comments_insert on public.comments for insert to authenticated with check (public.can_read_project(project_id) and author_id = auth.uid());

create policy sessions_select on public.mentor_sessions for select to authenticated using (public.can_read_project(project_id));
create policy sessions_request on public.mentor_sessions for insert to authenticated with check (
  public.is_project_owner(project_id) and status = 'pending' and decision is null
  and exists (select 1 from public.mentor_assignments a where a.project_id = mentor_sessions.project_id and a.mentor_id = mentor_sessions.mentor_id and a.status = 'active')
);
create policy sessions_mentor_update on public.mentor_sessions for update to authenticated using (
  mentor_id = auth.uid() and public.is_assigned_mentor(project_id)
) with check (mentor_id = auth.uid() and public.is_assigned_mentor(project_id));

create policy notes_select on public.session_notes for select to authenticated using (public.can_read_project(project_id));
create policy notes_insert on public.session_notes for insert to authenticated with check (
  author_id = auth.uid()
  and exists (select 1 from public.mentor_sessions s where s.id = session_id and s.mentor_id = auth.uid() and s.status <> 'completed')
  and public.is_assigned_mentor(project_id)
);

create policy hypotheses_select on public.hypotheses for select to authenticated using (public.can_read_project(project_id));
create policy hypotheses_insert on public.hypotheses for insert to authenticated with check (
  public.can_read_project(project_id) and proposed_by = auth.uid() and status = 'draft'
);
create policy hypotheses_update on public.hypotheses for update to authenticated using (public.can_read_project(project_id)) with check (public.can_read_project(project_id));

create policy experiments_select on public.experiments for select to authenticated using (public.can_read_project(project_id));
create policy experiments_insert on public.experiments for insert to authenticated with check (public.can_read_project(project_id) and status = 'design');
create policy experiments_update on public.experiments for update to authenticated using (public.can_read_project(project_id)) with check (
  public.can_read_project(project_id)
  -- Iniciar es decisión del dueño.
  and (status <> 'running' or public.is_project_owner(project_id))
);

create policy results_select on public.experiment_results for select to authenticated using (public.can_read_project(project_id));
create policy results_insert on public.experiment_results for insert to authenticated with check (
  public.is_project_member(project_id) and recorded_by = auth.uid()
  and exists (select 1 from public.experiments e where e.id = experiment_id and e.project_id = experiment_results.project_id and e.status = 'running')
);

create policy tasks_select on public.tasks for select to authenticated using (public.can_read_project(project_id));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.can_read_project(project_id));
create policy tasks_update on public.tasks for update to authenticated using (public.can_read_project(project_id)) with check (public.can_read_project(project_id));

create policy evidence_select on public.evidence for select to authenticated using (public.can_read_project(project_id));
create policy evidence_insert on public.evidence for insert to authenticated with check (public.is_project_member(project_id) and uploaded_by = auth.uid());

-- Permisos de tabla para el rol autenticado (RLS decide las filas).
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.profiles, public.projects, public.project_members, public.mentor_assignments,
  public.messages, public.diagnoses, public.diagnosis_items, public.comments, public.mentor_sessions,
  public.session_notes, public.hypotheses, public.experiments, public.experiment_results, public.tasks,
  public.evidence to authenticated;
revoke insert, update, delete on public.diagnosis_item_history, public.audit_events, public.conversations from authenticated;
revoke all on all tables in schema public from anon;
