-- Run once in Supabase SQL Editor. This powers secure, self-service workspace invites.
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists workspace_invites_workspace_idx on public.workspace_invites(workspace_id, created_at desc);
alter table public.workspace_invites enable row level security;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.workspaces where id = target_workspace_id and owner_id = auth.uid());
$$;

drop policy if exists "owners manage workspace invites" on public.workspace_invites;
create policy "owners manage workspace invites" on public.workspace_invites for all to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id) and created_by = auth.uid());

create or replace function public.create_workspace_invite(target_workspace_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare invite_token uuid;
begin
  if auth.uid() is null or not public.is_workspace_owner(target_workspace_id) then
    raise exception 'Only the workspace owner can create invite links';
  end if;
  insert into public.workspace_invites(workspace_id, created_by)
  values (target_workspace_id, auth.uid())
  returning token into invite_token;
  return invite_token;
end $$;

create or replace function public.join_workspace_by_invite(invite_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare invite public.workspace_invites; member_role public.workspace_role;
begin
  if auth.uid() is null then raise exception 'Sign in to join this workspace'; end if;
  select * into invite from public.workspace_invites
  where token = invite_token and active = true and (expires_at is null or expires_at > now());
  if invite.id is null then raise exception 'This invite link is invalid or expired'; end if;
  member_role := case when invite.role = 'owner' then 'member'::public.workspace_role else invite.role end;
  insert into public.workspace_members(workspace_id, user_id, role)
  values (invite.workspace_id, auth.uid(), member_role)
  on conflict (workspace_id, user_id) do nothing;
  return invite.workspace_id;
end $$;

grant execute on function public.create_workspace_invite(uuid) to authenticated;
grant execute on function public.join_workspace_by_invite(uuid) to authenticated;
