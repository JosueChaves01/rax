-- ════════════════════════════════════════════════════════════════════
-- Una sola llamada abierta por sesión.
-- Si el mentor y la persona emprendedora tocaban «Iniciar» casi a la vez, se abrían dos llamadas
-- y cada quien quedaba en un canal distinto esperando a la otra. La app ya lo corrige; este índice
-- lo garantiza en la base. Antes se cierran los duplicados que hayan quedado (gana la más antigua).
-- ════════════════════════════════════════════════════════════════════

update public.session_calls c
set status = 'ended', ended_at = coalesce(c.ended_at, now())
where c.status = 'active'
  and exists (
    select 1 from public.session_calls o
    where o.session_id = c.session_id
      and o.status = 'active'
      and (o.started_at, o.id::text) < (c.started_at, c.id::text)
  );

create unique index if not exists session_calls_one_active_per_session
  on public.session_calls (session_id)
  where status = 'active';
