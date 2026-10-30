-- ════════════════════════════════════════════════════════════════════
-- RAX · Arquitectura Claude Projects (Web y App)
-- Soporte para Instrucciones de Proyecto, Base de Conocimiento (Knowledge),
-- Chunks para RAG automático, múltiples hilos aislados y Artefactos.
-- ════════════════════════════════════════════════════════════════════

-- 1. Instrucciones de Proyecto (System Prompt dedicado)
alter table public.projects
  add column if not exists custom_instructions text default '' check (char_length(custom_instructions) <= 10000);

-- 2. Hilos Múltiples de Chat dentro del Proyecto
alter table public.agent_threads
  drop constraint if exists agent_threads_project_id_creator_id_key;

alter table public.agent_threads
  add column if not exists title text not null default 'Nuevo chat' check (char_length(title) <= 200),
  add column if not exists is_pinned boolean not null default false;

create index if not exists agent_threads_creator_project_idx
  on public.agent_threads (creator_id, project_id, updated_at desc);

-- 3. Artefactos y Citas en Mensajes del Agente
alter table public.agent_messages
  add column if not exists artifacts jsonb not null default '[]'::jsonb check (jsonb_typeof(artifacts) = 'array'),
  add column if not exists citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array');

-- 4. Base de Conocimiento del Proyecto (Project Knowledge)
create table if not exists public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  filename text not null check (char_length(filename) between 1 and 255),
  content text not null,
  file_type text not null default 'markdown' check (file_type in ('markdown', 'text', 'csv', 'code', 'pdf', 'json')),
  token_count integer not null default 0 check (token_count >= 0),
  source text not null default 'upload' check (source in ('upload', 'chat_extracted', 'note')),
  source_message_id uuid references public.agent_messages(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_documents_project_idx
  on public.project_documents (project_id, updated_at desc);

-- 5. Fragmentos para Modo RAG Automático (Retrieval-Augmented Generation)
create table if not exists public.project_document_chunks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  document_id uuid not null references public.project_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  token_count integer not null default 0 check (token_count >= 0),
  embedding_json text,
  tsv tsvector generated always as (to_tsvector('spanish', content)) stored,
  created_at timestamptz not null default now()
);

create index if not exists project_document_chunks_project_doc_idx
  on public.project_document_chunks (project_id, document_id, chunk_index);

create index if not exists project_document_chunks_tsv_idx
  on public.project_document_chunks using gin (tsv);

-- 6. Seguridad y RLS
alter table public.project_documents enable row level security;
alter table public.project_document_chunks enable row level security;

-- Documentos de conocimiento: Lectura para quienes pueden leer el proyecto
drop policy if exists project_documents_select on public.project_documents;
create policy project_documents_select on public.project_documents for select to authenticated using (
  public.can_read_project(project_id)
);

-- Documentos de conocimiento: Inserción para miembros del proyecto
drop policy if exists project_documents_insert on public.project_documents;
create policy project_documents_insert on public.project_documents for insert to authenticated with check (
  created_by = auth.uid()
  and public.is_project_member(project_id)
);

-- Documentos de conocimiento: Actualización para el creador o miembros
drop policy if exists project_documents_update on public.project_documents;
create policy project_documents_update on public.project_documents for update to authenticated using (
  public.is_project_member(project_id)
);

-- Documentos de conocimiento: Borrado para miembros
drop policy if exists project_documents_delete on public.project_documents;
create policy project_documents_delete on public.project_documents for delete to authenticated using (
  public.is_project_member(project_id)
);

-- Chunks de documentos: Lectura para quienes leen el proyecto
drop policy if exists project_document_chunks_select on public.project_document_chunks;
create policy project_document_chunks_select on public.project_document_chunks for select to authenticated using (
  public.can_read_project(project_id)
);

-- Chunks de documentos: Inserción/Borrado para miembros
drop policy if exists project_document_chunks_insert on public.project_document_chunks;
create policy project_document_chunks_insert on public.project_document_chunks for insert to authenticated with check (
  public.is_project_member(project_id)
);

drop policy if exists project_document_chunks_delete on public.project_document_chunks;
create policy project_document_chunks_delete on public.project_document_chunks for delete to authenticated using (
  public.is_project_member(project_id)
);

-- 7. Permisos de Rol
grant select, insert, update, delete on public.project_documents to authenticated;
grant select, insert, delete on public.project_document_chunks to authenticated;
grant all on public.project_documents, public.project_document_chunks to service_role;

