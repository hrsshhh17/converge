-- Run once in Supabase SQL Editor. It stores shared posts in direct and group conversations.
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.channel_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now()
);

-- A workspace has one automatic, workspace-wide group. Its name is editable,
-- so identity must never depend on the display name.
alter table public.channels add column if not exists is_workspace_group boolean not null default false;
insert into public.channels (workspace_id, name, kind, is_workspace_group)
select w.id, 'All members', 'group', true from public.workspaces w
where not exists (
  select 1 from public.channels c where c.workspace_id=w.id and c.kind='group'
);
with ranked_groups as (
  select c.id,row_number() over (
    partition by c.workspace_id
    order by c.is_workspace_group desc,(c.name='All members') desc,c.created_at asc,c.id asc
  ) as position
  from public.channels c where c.kind='group'
)
update public.channels c
set is_workspace_group=(ranked_groups.position=1)
from ranked_groups where ranked_groups.id=c.id;
create unique index if not exists channels_one_workspace_group
on public.channels(workspace_id) where is_workspace_group;

create index if not exists direct_messages_workspace_recipient_idx on public.direct_messages(workspace_id, recipient_id, created_at desc);
create index if not exists channel_messages_channel_idx on public.channel_messages(channel_id, created_at desc);

alter table public.direct_messages enable row level security;
alter table public.channel_messages enable row level security;
grant select, insert on public.direct_messages, public.channel_messages to authenticated;

-- Group joins are also bell notifications. This safely upgrades the existing
-- notification table if notification-v2-migration.sql has already been run.
do $$ begin
  if to_regclass('public.activity_notifications') is not null then
    alter table public.activity_notifications alter column post_id drop not null;
    alter table public.activity_notifications drop constraint if exists activity_notifications_kind_check;
    alter table public.activity_notifications add constraint activity_notifications_kind_check check (kind in ('post_like','post_comment','comment_reply','comment_like','mention','group_join'));
  end if;
end $$;

drop policy if exists "members read their direct messages" on public.direct_messages;
create policy "members read their direct messages" on public.direct_messages for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
drop policy if exists "members send direct messages" on public.direct_messages;
create policy "members send direct messages" on public.direct_messages for insert to authenticated with check (
  sender_id = auth.uid() and public.is_workspace_member(workspace_id) and exists (
    select 1 from public.workspace_members where workspace_id = direct_messages.workspace_id and user_id = recipient_id
  )
);

drop policy if exists "workspace members read group messages" on public.channel_messages;
create policy "workspace members read group messages" on public.channel_messages for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists "members send group messages" on public.channel_messages;
create policy "members send group messages" on public.channel_messages for insert to authenticated with check (
  sender_id = auth.uid() and public.is_workspace_member(workspace_id) and exists (
    select 1 from public.channels where id = channel_id and workspace_id = channel_messages.workspace_id and kind = 'group'
  )
);

-- Replaces the earlier invite join RPC so every new member is immediately in
-- the workspace-wide group and everyone can see the join event.
create or replace function public.join_workspace_by_invite(invite_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  invite public.workspace_invites;
  member_role public.workspace_role;
  group_id uuid;
  member_name text;
  inserted_rows integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in to join this workspace'; end if;
  select * into invite from public.workspace_invites
  where token = invite_token and active = true and (expires_at is null or expires_at > now());
  if invite.id is null then raise exception 'This invite link is invalid or expired'; end if;
  member_role := case when invite.role = 'owner' then 'member'::public.workspace_role else invite.role end;
  insert into public.workspace_members(workspace_id, user_id, role)
  values (invite.workspace_id, auth.uid(), member_role)
  on conflict (workspace_id, user_id) do nothing;
  get diagnostics inserted_rows = row_count;
  if inserted_rows > 0 then
    select id into group_id from public.channels
    where workspace_id = invite.workspace_id and is_workspace_group and kind = 'group'
    limit 1;
    select coalesce(nullif(full_name, ''), 'A new member') into member_name from public.profiles where id = auth.uid();
    if group_id is not null then
      insert into public.channel_messages(workspace_id, channel_id, sender_id, body)
      values (invite.workspace_id, group_id, auth.uid(), member_name || ' joined the chat');
    end if;
    if to_regclass('public.activity_notifications') is not null then
      insert into public.activity_notifications(recipient_id, actor_id, post_id, kind)
      select user_id, auth.uid(), null, 'group_join'
      from public.workspace_members
      where workspace_id = invite.workspace_id and user_id <> auth.uid();
    end if;
  end if;
  return invite.workspace_id;
end $$;

grant execute on function public.join_workspace_by_invite(uuid) to authenticated;
