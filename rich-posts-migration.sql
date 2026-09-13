-- Run once in Supabase SQL Editor before enabling media and polls.
alter table public.posts add column if not exists post_type text not null default 'update'
  check (post_type in ('update', 'media', 'file', 'poll'));
alter table public.posts add column if not exists attachment_url text;
alter table public.posts add column if not exists attachment_name text;
alter table public.posts add column if not exists poll_options jsonb;

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index integer not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);
alter table public.poll_votes enable row level security;
grant select, insert, update, delete on public.poll_votes to authenticated;

create policy "members can read poll votes" on public.poll_votes for select to authenticated
using (exists(select 1 from public.posts p join public.workspace_members wm on wm.workspace_id=p.workspace_id where p.id=poll_votes.post_id and wm.user_id=auth.uid()));
create policy "members can vote once" on public.poll_votes for insert to authenticated
with check (user_id=auth.uid() and exists(select 1 from public.posts p join public.workspace_members wm on wm.workspace_id=p.workspace_id where p.id=poll_votes.post_id and wm.user_id=auth.uid()));
create policy "voters can change their vote" on public.poll_votes for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

insert into storage.buckets(id,name,public) values ('workspace-media','workspace-media',true) on conflict(id) do nothing;
create policy "members upload workspace media" on storage.objects for insert to authenticated
with check(bucket_id='workspace-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "members update own workspace media" on storage.objects for update to authenticated
using(bucket_id='workspace-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "public workspace media viewing" on storage.objects for select to public using(bucket_id='workspace-media');
