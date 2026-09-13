-- Run this once in Supabase SQL Editor to enable nested comment replies.
alter table public.post_comments
  add column if not exists parent_id uuid references public.post_comments(id) on delete cascade;

create index if not exists post_comments_parent_id_idx
  on public.post_comments(parent_id);
