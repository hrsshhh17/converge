-- Run once in Supabase SQL Editor before using Saved posts.
create table if not exists public.post_saves (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

alter table public.post_saves enable row level security;
grant select, insert, delete on public.post_saves to authenticated;

create policy "members can read post saves"
on public.post_saves for select to authenticated
using (exists (
  select 1 from public.posts p
  join public.workspace_members wm on wm.workspace_id = p.workspace_id
  where p.id = post_saves.post_id and wm.user_id = auth.uid()
));

create policy "members can save posts"
on public.post_saves for insert to authenticated
with check (
  user_id = auth.uid() and exists (
    select 1 from public.posts p
    join public.workspace_members wm on wm.workspace_id = p.workspace_id
    where p.id = post_saves.post_id and wm.user_id = auth.uid()
  )
);

create policy "users can remove their own saves"
on public.post_saves for delete to authenticated
using (user_id = auth.uid());
