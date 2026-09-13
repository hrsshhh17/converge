-- Run this if you already ran social-migration.sql before today.
alter table public.posts add column if not exists archived_at timestamptz;

create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.post_shares enable row level security;
grant select, insert, delete on public.post_shares to authenticated;

create policy "workspace members read shares" on public.post_shares for select to authenticated using (exists (select 1 from public.posts p where p.id = post_id and public.is_workspace_member(p.workspace_id)));
create policy "members share as themselves" on public.post_shares for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and public.is_workspace_member(p.workspace_id)));
create policy "members remove own shares" on public.post_shares for delete to authenticated using (user_id = auth.uid());

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;
create policy "public avatar viewing" on storage.objects for select using (bucket_id = 'avatars');
create policy "users upload their own avatar" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users update their own avatar" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users delete their own avatar" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
