-- Run once after post-share-delivery-migration.sql. Powers realtime chat, media, voice notes and group polls.
alter table public.direct_messages add column if not exists message_type text not null default 'text' check (message_type in ('text','media','file','voice','shared_post'));
alter table public.direct_messages add column if not exists attachment_url text;
alter table public.direct_messages add column if not exists attachment_name text;
alter table public.channel_messages add column if not exists message_type text not null default 'text' check (message_type in ('text','media','file','voice','poll','shared_post','system'));
alter table public.channel_messages add column if not exists attachment_url text;
alter table public.channel_messages add column if not exists attachment_name text;
alter table public.channel_messages add column if not exists poll_options jsonb;

create table if not exists public.channel_message_poll_votes (
  message_id uuid not null references public.channel_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index integer not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.channel_message_poll_votes enable row level security;
grant select, insert, update on public.channel_message_poll_votes to authenticated;
drop policy if exists "members read chat poll votes" on public.channel_message_poll_votes;
create policy "members read chat poll votes" on public.channel_message_poll_votes for select to authenticated using (exists(select 1 from public.channel_messages m where m.id=message_id and public.is_workspace_member(m.workspace_id)));
drop policy if exists "members vote in chat polls" on public.channel_message_poll_votes;
create policy "members vote in chat polls" on public.channel_message_poll_votes for insert to authenticated with check (user_id=auth.uid() and exists(select 1 from public.channel_messages m where m.id=message_id and public.is_workspace_member(m.workspace_id)));
drop policy if exists "members change their chat poll vote" on public.channel_message_poll_votes;
create policy "members change their chat poll vote" on public.channel_message_poll_votes for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

alter table public.direct_messages replica identity full;
alter table public.channel_messages replica identity full;
do $$ begin alter publication supabase_realtime add table public.direct_messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.channel_messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.channel_message_poll_votes; exception when duplicate_object then null; end $$;
