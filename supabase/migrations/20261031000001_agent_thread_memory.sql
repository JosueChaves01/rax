-- ════════════════════════════════════════════════════════════════════
-- RAX · Memoria persistente de cada hilo del agente
-- Cada hilo guarda un resumen acumulado de los mensajes que salieron de la ventana reciente,
-- las decisiones de la persona y las preguntas abiertas. La escribe solo el servidor
-- (service role) después de cada turno; quien creó el hilo la puede leer por la política existente.
-- ════════════════════════════════════════════════════════════════════

alter table public.agent_threads
  add column if not exists memory jsonb
    check (memory is null or (
      jsonb_typeof(memory) = 'object'
      and pg_column_size(memory) <= 32768
    ));

comment on column public.agent_threads.memory is
  'Memoria compacta del hilo: {summary, decisions[], openQuestions[], coveredMessageCount, updatedAt}.';
