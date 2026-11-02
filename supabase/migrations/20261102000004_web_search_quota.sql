-- Cupo diario de búsquedas en internet del agente (web_search / read_web_page).
-- Sin esta migración el agente igual busca: el conteo falla, se registra en el log y no bloquea.
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage
  add constraint ai_usage_kind_check check (kind in ('agent_message', 'audio_chunk', 'web_search'));
