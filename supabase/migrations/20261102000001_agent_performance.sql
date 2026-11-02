-- ════════════════════════════════════════════════════════════════════
-- RAX · Rendimiento y escalabilidad del agente
-- 1. Métricas por respuesta del agente (modelo, tiempos, tokens, herramientas).
-- 2. Búsqueda de fragmentos de conocimiento en Postgres con el índice de texto completo existente,
--    en vez de traer todos los fragmentos al servidor y puntuarlos en JavaScript.
-- 3. Uso diario de IA por persona, para que nadie agote el cupo gratis de todos.
-- La app funciona sin esta migración (cae a las alternativas en memoria), pero sin métricas,
-- con búsqueda más lenta y sin límites.
-- ════════════════════════════════════════════════════════════════════

-- 1. Métricas: las escribe solo el servidor al guardar la respuesta del agente.
alter table public.agent_messages
  add column if not exists metrics jsonb check (metrics is null or jsonb_typeof(metrics) = 'object');

-- Mensajes más recientes de un hilo (ventana del agente) sin recorrer el hilo entero.
create index if not exists agent_messages_thread_recent_idx on public.agent_messages (thread_id, created_at desc);

-- 2. Búsqueda de fragmentos. Corre con los permisos de quien llama (security invoker), así que las
-- políticas RLS de project_document_chunks siguen decidiendo qué puede leer cada persona.
-- La consulta se arma con OR entre las palabras (las vacías las descarta el diccionario español).
create or replace function public.search_project_chunks(p_project_id uuid, p_query text, p_limit integer default 8)
returns table (
  id uuid,
  project_id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  token_count integer,
  embedding_json text,
  created_at timestamptz,
  score real
)
language sql
stable
security invoker
set search_path = public
as $$
  with words as (
    select distinct w
    from regexp_split_to_table(lower(coalesce(p_query, '')), '[^[:alnum:]áéíóúüñ]+') as w
    where char_length(w) > 2
    limit 30
  ),
  q as (
    select to_tsquery('spanish', string_agg(w, ' | ')) as tsq from words
  )
  select c.id, c.project_id, c.document_id, c.chunk_index, c.content, c.token_count, c.embedding_json, c.created_at,
         ts_rank_cd(c.tsv, q.tsq) as score
  from public.project_document_chunks c, q
  where q.tsq is not null
    and c.project_id = p_project_id
    and c.tsv @@ q.tsq
  order by score desc, c.chunk_index
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

revoke all on function public.search_project_chunks(uuid, text, integer) from public, anon;
grant execute on function public.search_project_chunks(uuid, text, integer) to authenticated, service_role;

-- 3. Uso diario de IA. Sin políticas: solo el servidor (service role) lee y escribe.
create table if not exists public.ai_usage (
  actor_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('agent_message', 'audio_chunk')),
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (actor_id, day, kind)
);

alter table public.ai_usage enable row level security;

-- Suma y devuelve el total del día en una sola sentencia (sin carreras entre pedidos simultáneos).
create or replace function public.add_ai_usage(p_actor_id uuid, p_kind text, p_day date, p_amount integer default 1)
returns integer
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.ai_usage as u (actor_id, day, kind, count, updated_at)
  values (p_actor_id, p_day, p_kind, greatest(coalesce(p_amount, 1), 0), now())
  on conflict (actor_id, day, kind)
  do update set count = u.count + excluded.count, updated_at = now()
  returning u.count;
$$;

revoke all on function public.add_ai_usage(uuid, text, date, integer) from public, anon, authenticated;
grant execute on function public.add_ai_usage(uuid, text, date, integer) to service_role;
