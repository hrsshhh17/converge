-- Converge social workspace: run once in Supabase SQL Editor.
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts add column if not exists archived_at timestamptz;

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1200),
  created_at timestamptz not null default now()
);

-- Enables a comment to be stored as a reply to another comment.
alter table public.post_comments add column if not exists parent_id uuid references public.post_comments(id) on delete cascade;
create index if not exists post_comments_parent_id_idx on public.post_comments(parent_id);

create table public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_shares enable row level security;
grant select, insert, update, delete on public.posts, public.post_likes, public.post_comments to authenticated;
grant select, insert, delete on public.post_shares to authenticated;

create policy "workspace members read posts" on public.posts for select to authenticated using (public.is_workspace_member(workspace_id));
create policy "members create their own posts" on public.posts for insert to authenticated with check (author_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy "authors update own posts" on public.posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors delete own posts" on public.posts for delete to authenticated using (author_id = auth.uid());

create policy "workspace members read likes" on public.post_likes for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id and public.is_workspace_member(p.workspace_id)));
create policy "members like as themselves" on public.post_likes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and public.is_workspace_member(p.workspace_id)));
create policy "members remove own like" on public.post_likes for delete to authenticated using (user_id = auth.uid());

create policy "workspace members read comments" on public.post_comments for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id and public.is_workspace_member(p.workspace_id)));
create policy "members write own comments" on public.post_comments for insert to authenticated with check (author_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and public.is_workspace_member(p.workspace_id)));
create policy "authors delete own comments" on public.post_comments for delete to authenticated using (author_id = auth.uid());

create policy "workspace members read shares" on public.post_shares for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id and public.is_workspace_member(p.workspace_id)));
create policy "members share as themselves" on public.post_shares for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and public.is_workspace_member(p.workspace_id)));
create policy "members remove own shares" on public.post_shares for delete to authenticated using (user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
create policy "public avatar viewing" on storage.objects for select using (bucket_id = 'avatars');
create policy "users upload their own avatar" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users update their own avatar" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete their own avatar" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Give members who signed up before the first schema run a profile record.
insert into public.profiles (id, full_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;
