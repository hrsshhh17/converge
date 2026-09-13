create table if not exists public.workspace_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  starts_at timestamptz not null,
  visibility text not null default 'private' check (visibility in ('private','workspace')),
  created_at timestamptz not null default now()
);
alter table public.workspace_events enable row level security;
drop policy if exists "members read visible workspace events" on public.workspace_events;
create policy "members read visible workspace events" on public.workspace_events for select using (
  exists(select 1 from public.workspace_members m where m.workspace_id=workspace_events.workspace_id and m.user_id=auth.uid())
  and (visibility='workspace' or creator_id=auth.uid())
);
drop policy if exists "members create workspace events" on public.workspace_events;
create policy "members create workspace events" on public.workspace_events for insert with check (
  creator_id=auth.uid() and exists(select 1 from public.workspace_members m where m.workspace_id=workspace_events.workspace_id and m.user_id=auth.uid())
);
drop policy if exists "creators manage workspace events" on public.workspace_events;
create policy "creators manage workspace events" on public.workspace_events for delete using (creator_id=auth.uid());
drop policy if exists "creators update workspace events" on public.workspace_events;
create policy "creators update workspace events" on public.workspace_events for update using (creator_id=auth.uid()) with check (creator_id=auth.uid());
alter table public.workspace_events replica identity full;
do $$ begin alter publication supabase_realtime add table public.workspace_events; exception when duplicate_object then null; end $$;
