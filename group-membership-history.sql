-- Preserve custom-group history after a member leaves and provide a safe,
-- permission-aware way to add existing workspace members to a group.

alter table public.channel_members
  add column if not exists left_at timestamptz;

-- Leaving is stateful now; clients cannot physically erase membership history.
revoke delete on table public.channel_members from authenticated;
drop policy if exists "members leave their own custom groups" on public.channel_members;

create index if not exists channel_members_user_history_idx
  on public.channel_members(user_id, channel_id, left_at);

create or replace function public.is_channel_member(target_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.channel_members cm
    where cm.channel_id = target_channel_id
      and cm.user_id = (select auth.uid())
      and cm.left_at is null
  );
$function$;

create or replace function public.is_channel_admin(target_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.channel_members cm
    where cm.channel_id = target_channel_id
      and cm.user_id = (select auth.uid())
      and cm.left_at is null
      and cm.role = 'admin'::public.group_member_role
  );
$function$;

create or replace function public.leave_channel(target_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_workspace_id uuid;
  target_is_main boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to leave a group';
  end if;

  select c.workspace_id, c.is_workspace_group
    into target_workspace_id, target_is_main
  from public.channels c
  where c.id = target_channel_id and c.kind = 'group';

  if target_workspace_id is null then raise exception 'Group not found'; end if;
  if target_is_main then raise exception 'The main group can only be left by leaving the workspace'; end if;
  if not public.is_workspace_member(target_workspace_id) then raise exception 'Not a workspace member'; end if;

  update public.channel_members
  set left_at = now()
  where channel_id = target_channel_id
    and user_id = (select auth.uid())
    and left_at is null;

  if not found then raise exception 'You are not an active participant in this group'; end if;
end
$function$;

create or replace function public.add_channel_members(target_channel_id uuid, target_user_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_workspace_id uuid;
  target_is_main boolean;
  may_add boolean := false;
  added_count integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to add group members'; end if;

  select c.workspace_id, c.is_workspace_group
    into target_workspace_id, target_is_main
  from public.channels c
  where c.id = target_channel_id and c.kind = 'group';

  if target_workspace_id is null then raise exception 'Group not found'; end if;
  if target_is_main then raise exception 'Every workspace member already belongs to the main group'; end if;

  select exists (
    select 1
    from public.channel_members cm
    join public.channel_permissions cp on cp.channel_id = cm.channel_id
    where cm.channel_id = target_channel_id
      and cm.user_id = (select auth.uid())
      and cm.left_at is null
      and (cm.role = 'admin'::public.group_member_role or cp.members_add_members)
  ) into may_add;

  if not may_add then raise exception 'You do not have permission to add members'; end if;

  insert into public.channel_members(channel_id, user_id, role, joined_at, left_at)
  select target_channel_id, wm.user_id, 'member'::public.group_member_role, now(), null
  from public.workspace_members wm
  where wm.workspace_id = target_workspace_id
    and wm.user_id = any(coalesce(target_user_ids, '{}'::uuid[]))
    and wm.user_id <> (select auth.uid())
  on conflict (channel_id, user_id) do update
    set joined_at = excluded.joined_at,
        left_at = null;

  get diagnostics added_count = row_count;
  return added_count;
end
$function$;

create or replace function public.log_custom_group_membership_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_channel_id uuid := coalesce(new.channel_id, old.channel_id);
  target_user_id uuid := coalesce(new.user_id, old.user_id);
  target_workspace_id uuid;
  is_main_group boolean;
  member_name text;
  event_text text;
begin
  select c.workspace_id, c.is_workspace_group
    into target_workspace_id, is_main_group
  from public.channels c
  where c.id = target_channel_id;

  if target_workspace_id is null or coalesce(is_main_group, false) then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' and new.left_at is null then
    event_text := ' joined the group';
  elsif tg_op = 'UPDATE' and old.left_at is null and new.left_at is not null then
    event_text := ' left the group';
  elsif tg_op = 'UPDATE' and old.left_at is not null and new.left_at is null then
    event_text := ' joined the group';
  elsif tg_op = 'DELETE' then
    event_text := ' left the group';
  else
    return coalesce(new, old);
  end if;

  select coalesce(nullif(wp.full_name, ''), nullif(p.full_name, ''), 'A member')
    into member_name
  from auth.users u
  left join public.workspace_profiles wp
    on wp.workspace_id = target_workspace_id and wp.id = u.id
  left join public.profiles p on p.id = u.id
  where u.id = target_user_id;

  insert into public.channel_messages(workspace_id, channel_id, sender_id, body, message_type)
  values (target_workspace_id, target_channel_id, target_user_id,
    coalesce(member_name, 'A member') || event_text, 'system');

  return coalesce(new, old);
end
$function$;

drop trigger if exists log_custom_group_membership_event on public.channel_members;
create trigger log_custom_group_membership_event
after insert or update of left_at or delete on public.channel_members
for each row execute function public.log_custom_group_membership_event();

drop policy if exists "group members read group membership" on public.channel_members;
create policy "group members read group membership"
on public.channel_members for select to authenticated
using (
  public.is_channel_member(channel_id)
  or user_id = (select auth.uid())
);

drop policy if exists "group members read permissions" on public.channel_permissions;
create policy "group members read permissions"
on public.channel_permissions for select to authenticated
using (
  exists (
    select 1 from public.channel_members cm
    where cm.channel_id = channel_permissions.channel_id
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists "workspace members read group messages" on public.channel_messages;
create policy "workspace members read group messages"
on public.channel_messages for select to authenticated
using (
  exists (
    select 1
    from public.channel_members cm
    join public.channel_permissions cp on cp.channel_id = cm.channel_id
    where cm.channel_id = channel_messages.channel_id
      and cm.user_id = (select auth.uid())
      and channel_messages.created_at < coalesce(cm.left_at, 'infinity'::timestamptz)
      and (cp.members_share_history or channel_messages.created_at >= cm.joined_at)
  )
);

drop policy if exists "members send group messages" on public.channel_messages;
create policy "members send group messages"
on public.channel_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1
    from public.channel_members cm
    join public.channel_permissions cp on cp.channel_id = cm.channel_id
    where cm.channel_id = channel_messages.channel_id
      and cm.user_id = (select auth.uid())
      and cm.left_at is null
      and (cm.role = 'admin'::public.group_member_role or cp.members_send_messages)
  )
);

create or replace function public.create_channel_message_receipts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.message_type = 'system' then return new; end if;
  insert into public.channel_message_receipts(message_id, workspace_id, channel_id, recipient_id, delivered_at)
  select new.id, new.workspace_id, new.channel_id, member.user_id,
    case when presence.last_seen > now() - interval '35 seconds' then now() end
  from public.channel_members member
  left join public.workspace_presence presence
    on presence.workspace_id = new.workspace_id and presence.user_id = member.user_id
  where member.channel_id = new.channel_id
    and member.left_at is null
    and member.user_id <> new.sender_id
  on conflict(message_id, recipient_id) do nothing;
  return new;
end
$function$;

grant execute on function public.leave_channel(uuid) to authenticated;
grant execute on function public.add_channel_members(uuid, uuid[]) to authenticated;
revoke all on function public.leave_channel(uuid) from public, anon;
revoke all on function public.add_channel_members(uuid, uuid[]) from public, anon;
revoke all on function public.log_custom_group_membership_event() from public, anon, authenticated;
revoke all on function public.create_channel_message_receipts() from public, anon, authenticated;

notify pgrst, 'reload schema';
