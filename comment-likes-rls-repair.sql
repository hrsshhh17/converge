-- Idempotent repair for comment/reply likes and group membership events.

alter table public.comment_likes enable row level security;
grant select, insert, delete on table public.comment_likes to authenticated;

drop policy if exists "workspace members read comment likes" on public.comment_likes;
drop policy if exists "members like comments as themselves" on public.comment_likes;
drop policy if exists "members remove own comment like" on public.comment_likes;

create policy "workspace members read comment likes"
on public.comment_likes for select to authenticated
using (
  exists (
    select 1
    from public.post_comments c
    join public.posts p on p.id = c.post_id
    where c.id = comment_likes.comment_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy "members like comments as themselves"
on public.comment_likes for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.post_comments c
    join public.posts p on p.id = c.post_id
    where c.id = comment_likes.comment_id
      and public.is_workspace_member(p.workspace_id)
  )
);

create policy "members remove own comment like"
on public.comment_likes for delete to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.post_comments c
    join public.posts p on p.id = c.post_id
    where c.id = comment_likes.comment_id
      and public.is_workspace_member(p.workspace_id)
  )
);

-- Existing auto-created workspace groups used the placeholder name. Only rename
-- those exact placeholders so user-customized group names remain untouched.
update public.channels c
set name = w.name
from public.workspaces w
where c.workspace_id = w.id
  and c.kind = 'group'
  and c.is_workspace_group
  and c.name = 'All members';

create or replace function public.sync_all_members_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  workspace_group_id uuid;
  member_name text;
begin
  if tg_op = 'INSERT' then
    select c.id into workspace_group_id
    from public.channels c
    where c.workspace_id = new.workspace_id
      and c.kind = 'group'
      and c.is_workspace_group
    order by c.created_at
    limit 1;

    if workspace_group_id is not null then
      insert into public.channel_members(channel_id, user_id, role)
      select workspace_group_id, new.user_id,
        case when w.owner_id = new.user_id
          then 'admin'::public.group_member_role
          else 'member'::public.group_member_role
        end
      from public.workspaces w
      where w.id = new.workspace_id
      on conflict do nothing;

      select coalesce(nullif(wp.full_name, ''), nullif(p.full_name, ''), 'A member')
      into member_name
      from auth.users u
      left join public.workspace_profiles wp
        on wp.workspace_id = new.workspace_id and wp.id = u.id
      left join public.profiles p on p.id = u.id
      where u.id = new.user_id;

      insert into public.channel_messages(
        workspace_id, channel_id, sender_id, body, message_type
      ) values (
        new.workspace_id, workspace_group_id, new.user_id,
        coalesce(member_name, 'A member') || ' joined the group', 'system'
      );
    end if;
    return new;
  end if;

  select c.id into workspace_group_id
  from public.channels c
  where c.workspace_id = old.workspace_id
    and c.kind = 'group'
    and c.is_workspace_group
  order by c.created_at
  limit 1;

  if workspace_group_id is not null then
    select coalesce(nullif(wp.full_name, ''), nullif(p.full_name, ''), 'A member')
    into member_name
    from auth.users u
    left join public.workspace_profiles wp
      on wp.workspace_id = old.workspace_id and wp.id = u.id
    left join public.profiles p on p.id = u.id
    where u.id = old.user_id;

    insert into public.channel_messages(
      workspace_id, channel_id, sender_id, body, message_type
    ) values (
      old.workspace_id, workspace_group_id, old.user_id,
      coalesce(member_name, 'A member') || ' left the group', 'system'
    );

    delete from public.channel_members cm
    where cm.channel_id = workspace_group_id and cm.user_id = old.user_id;
  end if;
  return old;
end
$function$;

revoke all on function public.join_workspace_by_invite(uuid) from public, anon;
grant execute on function public.join_workspace_by_invite(uuid) to authenticated;

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
begin
  select c.workspace_id, c.is_workspace_group
  into target_workspace_id, is_main_group
  from public.channels c
  where c.id = target_channel_id;

  if target_workspace_id is null or coalesce(is_main_group, false) then
    return coalesce(new, old);
  end if;

  select coalesce(nullif(wp.full_name, ''), nullif(p.full_name, ''), 'A member')
  into member_name
  from auth.users u
  left join public.workspace_profiles wp
    on wp.workspace_id = target_workspace_id and wp.id = u.id
  left join public.profiles p on p.id = u.id
  where u.id = target_user_id;

  insert into public.channel_messages(
    workspace_id, channel_id, sender_id, body, message_type
  ) values (
    target_workspace_id, target_channel_id, target_user_id,
    coalesce(member_name, 'A member') ||
      case when tg_op = 'INSERT' then ' joined the group' else ' left the group' end,
    'system'
  );
  return coalesce(new, old);
end
$function$;

drop trigger if exists log_custom_group_membership_event on public.channel_members;
create trigger log_custom_group_membership_event
after insert or delete on public.channel_members
for each row execute function public.log_custom_group_membership_event();

revoke all on function public.sync_all_members_group() from public, anon, authenticated;
revoke all on function public.log_custom_group_membership_event() from public, anon, authenticated;

-- The workspace member trigger above now writes the system join message. Keep
-- invite joining focused on membership and notifications to avoid duplicates.
create or replace function public.join_workspace_by_invite(invite_token uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  invite public.workspace_invites;
  member_role public.workspace_role;
  inserted_rows integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to join this workspace';
  end if;

  select * into invite
  from public.workspace_invites
  where token = invite_token
    and active = true
    and (expires_at is null or expires_at > now());

  if invite.id is null then
    raise exception 'This invite link is invalid or expired';
  end if;

  member_role := case when invite.role = 'owner'
    then 'member'::public.workspace_role else invite.role end;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (invite.workspace_id, (select auth.uid()), member_role)
  on conflict (workspace_id, user_id) do nothing;
  get diagnostics inserted_rows = row_count;

  if inserted_rows > 0 and to_regclass('public.activity_notifications') is not null then
    insert into public.activity_notifications(recipient_id, actor_id, post_id, kind)
    select wm.user_id, (select auth.uid()), null, 'group_join'
    from public.workspace_members wm
    where wm.workspace_id = invite.workspace_id
      and wm.user_id <> (select auth.uid());
  end if;

  return invite.workspace_id;
end
$function$;
