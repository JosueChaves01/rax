-- ════════════════════════════════════════════════════════════════════
-- RAX · Pivot B2B, Fase 3 (Dev A): los clientes entran a la llamada de la sesión
-- Hasta acá la señalización (canal privado «call:<id>») y la lectura de llamadas y fragmentos
-- exigían can_read_project, que a propósito NO incluye a los clientes (tienen políticas propias por
-- tabla). Se suma is_project_client para:
--   · can_join_call  → el cliente recibe y envía señales/presencia en la malla P2P de la sesión.
--   · session_calls / session_call_segments (select) → el cliente ve la llamada abierta y la
--     transcripción en vivo de su sesión. Las escrituras siguen siendo del servidor (service role).
-- Las notas en vivo (mentor_sessions.live_notes) y el brief NO cambian: el servicio de la sala
-- nunca se los entrega al cliente.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.can_join_call(topic text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.session_calls c
    where split_part(topic, ':', 1) = 'call'
      and c.id::text = split_part(topic, ':', 2)
      and c.status = 'active'
      and (public.can_read_project(c.project_id) or public.is_project_client(c.project_id))
  );
$$;

revoke all on function public.can_join_call(text) from public;
grant execute on function public.can_join_call(text) to authenticated;

drop policy if exists session_calls_select_client on public.session_calls;
create policy session_calls_select_client on public.session_calls for select to authenticated using (
  public.is_project_client(project_id)
);

drop policy if exists session_call_segments_select_client on public.session_call_segments;
create policy session_call_segments_select_client on public.session_call_segments for select to authenticated using (
  public.is_project_client(project_id)
);
