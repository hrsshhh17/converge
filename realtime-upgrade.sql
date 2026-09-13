-- Run once after social-migration.sql. Enables instant in-app updates.
alter table public.posts replica identity full;
alter table public.post_likes replica identity full;
alter table public.post_comments replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.posts;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.post_likes;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.post_comments;
exception when duplicate_object then null;
end $$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  entity_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
grant select, update on public.notifications to authenticated;
create policy "users read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "users update own notifications" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table public.notifications replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;
