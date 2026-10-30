-- ════════════════════════════════════════════════════════════════════
-- RAX · Corrección de permisos y grants para flujos de mentoría
-- Asegura acceso de tabla e inserción a roles authenticated y service_role
-- ════════════════════════════════════════════════════════════════════

-- 1. Tablas de relaciones y acuerdos de mentoría
grant select, insert, update, delete on public.mentorship_relations to authenticated;
grant select, insert, update, delete on public.mentorship_agreements to authenticated;
grant select, insert, update, delete on public.mentorship_goals to authenticated;

grant all on public.mentorship_relations to service_role;
grant all on public.mentorship_agreements to service_role;
grant all on public.mentorship_goals to service_role;

-- 2. Asignación de mentores
grant select, insert, update on public.mentor_assignments to authenticated;
grant all on public.mentor_assignments to service_role;

-- 3. Hilos y mensajes de chat de agente
grant select, insert, update on public.agent_threads to authenticated;
grant select, insert, update on public.agent_messages to authenticated;
grant all on public.agent_threads, public.agent_messages to service_role;

-- 4. Ejecución de funciones de seguridad
grant execute on function public.is_relation_participant(uuid), public.can_read_relation(uuid) to authenticated, service_role;
grant execute on function public.is_project_owner(uuid), public.is_project_member(uuid) to authenticated, service_role;

