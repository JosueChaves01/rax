-- Ensure only entrepreneur profiles can hold owner/collaborator project membership.
-- This protects deployed databases where project_members may contain cross-role rows.

create or replace function public.is_project_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.projects p
    join public.profiles profile on profile.id = p.owner_id
    where p.id = pid and p.owner_id = auth.uid() and profile.role = 'entrepreneur'
  );
$$;

create or replace function public.is_project_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_project_owner(pid)
      or exists (
        select 1
        from public.project_members member
        join public.profiles profile on profile.id = member.profile_id
        where member.project_id = pid
          and member.profile_id = auth.uid()
          and member.role = 'collaborator'
          and profile.role = 'entrepreneur'
      );
$$;

drop policy if exists members_insert on public.project_members;
create policy members_insert on public.project_members for insert to authenticated with check (
  public.is_project_owner(project_id)
  and role = 'collaborator'
  and exists (select 1 from public.profiles where id = profile_id and role = 'entrepreneur')
);

revoke all on function public.is_project_owner(uuid), public.is_project_member(uuid) from public;
grant execute on function public.is_project_owner(uuid), public.is_project_member(uuid) to authenticated;
