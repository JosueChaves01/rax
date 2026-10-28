-- ════════════════════════════════════════════════════════════════════
-- RAX · Almacenamiento privado de evidencias
-- Ruta obligatoria: <project_id>/<archivo>. Tipos y tamaño limitados en el bucket.
-- ════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv'])
on conflict (id) do nothing;

create policy evidence_files_read on storage.objects for select to authenticated using (
  bucket_id = 'evidence' and public.can_read_project(((storage.foldername(name))[1])::uuid)
);

create policy evidence_files_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'evidence' and public.is_project_member(((storage.foldername(name))[1])::uuid)
);
