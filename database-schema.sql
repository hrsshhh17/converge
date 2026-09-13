-- Run this once in Supabase: SQL Editor -> New query.
create extension if not exists "pgcrypto";

create type public.workspace_role as enum ('owner', 'admin', 'member', 'guest');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  job_title text,
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  owner_id uuid not null references auth.users(id) on delete cascade,
  personality text not null default 'Startup',
  privacy text not null default 'Invite only',
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  kind text not null default 'group',
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.channels enable row level security;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace_id and user_id = auth.uid()
  );
$$;

create policy "profiles readable by signed in users" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

create policy "members read workspaces" on public.workspaces for select to authenticated using (owner_id = auth.uid() or public.is_workspace_member(id));
create policy "users create owned workspaces" on public.workspaces for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update workspace" on public.workspaces for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "members read member list" on public.workspace_members for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "users join as themselves" on public.workspace_members for insert to authenticated with check (user_id = auth.uid());

create policy "members read channels" on public.channels for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "workspace owners create channels" on public.channels for insert to authenticated with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
