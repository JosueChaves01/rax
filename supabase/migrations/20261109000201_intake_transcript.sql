-- ════════════════════════════════════════════════════════════════════
-- RAX · Pivot B2B (Fase 1, Dev B): transcripción del intake por persona
-- La entrevista de intake se guarda en conversations/messages del proyecto. En un proyecto grupal
-- cada persona hace su propia entrevista, así que cada mensaje del intake dice de quién es la
-- entrevista (`intake_client_id`), también las respuestas del asistente (que no tienen author_id).
-- `intake_client_id` vacío = mensaje de la entrevista vieja (flujo actual, sin cambios).
-- ════════════════════════════════════════════════════════════════════

alter table public.messages
  add column if not exists intake_client_id uuid references public.profiles(id) on delete cascade;

create index if not exists messages_intake_idx on public.messages (project_id, intake_client_id, created_at)
  where intake_client_id is not null;

-- La entrevista de una persona no la lee el resto del grupo (ni el cliente principal, que es
-- owner_id y ve la conversación vieja). La ven ella y el mentor del proyecto. Política restrictiva:
-- se suma (AND) a las de lectura que ya existen.
drop policy if exists messages_intake_private on public.messages;
create policy messages_intake_private on public.messages as restrictive for select to authenticated using (
  intake_client_id is null or intake_client_id = auth.uid() or public.is_project_mentor(project_id)
);

-- Desde la API nadie escribe mensajes de intake: los guarda el servidor (service role) después de
-- verificar que quien escribe es cliente del proyecto.
drop policy if exists messages_intake_server_only on public.messages;
create policy messages_intake_server_only on public.messages as restrictive for insert to authenticated with check (
  intake_client_id is null
);
