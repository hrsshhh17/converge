-- Run after comment-replies-migration.sql in Supabase SQL Editor.
alter table public.post_comments add column if not exists pinned_at timestamptz;

create table if not exists public.comment_likes (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_likes enable row level security;
grant select, insert, delete on public.comment_likes to authenticated;

drop policy if exists "workspace members read comment likes" on public.comment_likes;
drop policy if exists "members like comments as themselves" on public.comment_likes;
drop policy if exists "members remove own comment like" on public.comment_likes;
drop policy if exists "comment authors update their comment" on public.post_comments;
drop policy if exists "post owners can moderate comments" on public.post_comments;

create policy "workspace members read comment likes" on public.comment_likes for select to authenticated using (
  exists (select 1 from public.post_comments c join public.posts p on p.id=c.post_id where c.id=comment_id and public.is_workspace_member(p.workspace_id))
);
create policy "members like comments as themselves" on public.comment_likes for insert to authenticated with check (user_id=auth.uid());
create policy "members remove own comment like" on public.comment_likes for delete to authenticated using (user_id=auth.uid());

create policy "comment authors update their comment" on public.post_comments for update to authenticated using (author_id=auth.uid()) with check (author_id=auth.uid());
create policy "post owners can moderate comments" on public.post_comments for delete to authenticated using (
  exists (select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid())
);
