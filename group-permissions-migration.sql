-- Run once in Supabase SQL Editor. Adds per-group admins, members and permissions.
do $$ begin
  create type public.group_member_role as enum ('admin','member');
exception when duplicate_object then null; end $$;

alter table public.channels add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.channels add column if not exists avatar_url text;
alter table public.channels add column if not exists description text not null default 'Every workspace member joins automatically.';
alter table public.channels add column if not exists is_workspace_group boolean not null default false;
alter table public.channels alter column created_by set default auth.uid();
update public.channels c set created_by=w.owner_id from public.workspaces w where w.id=c.workspace_id and c.created_by is null;

-- The workspace-wide group keeps this identity even after its editable name changes.
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

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.group_member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key(channel_id,user_id)
);

create table if not exists public.channel_permissions (
  channel_id uuid primary key references public.channels(id) on delete cascade,
  members_edit_settings boolean not null default false,
  members_send_messages boolean not null default true,
  members_add_members boolean not null default true,
  members_share_history boolean not null default true,
  members_invite_link boolean not null default false,
  admins_approve_members boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.channel_permissions(channel_id) select id from public.channels where kind='group' on conflict do nothing;
insert into public.channel_members(channel_id,user_id,role)
select c.id,wm.user_id,case when wm.user_id=coalesce(c.created_by,w.owner_id) then 'admin'::public.group_member_role else 'member'::public.group_member_role end
from public.channels c join public.workspaces w on w.id=c.workspace_id join public.workspace_members wm on wm.workspace_id=c.workspace_id
where c.kind='group' and c.is_workspace_group on conflict do nothing;

create or replace function public.is_channel_admin(target_channel_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.channel_members where channel_id=target_channel_id and user_id=auth.uid() and role='admin');
$$;

create or replace function public.is_channel_member(target_channel_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.channel_members where channel_id=target_channel_id and user_id=auth.uid());
$$;

create or replace function public.log_channel_change(target_channel_id uuid,change_text text)
returns void language plpgsql security definer set search_path=public as $$
declare message_sender uuid; target_workspace uuid; actor_name text;
begin
  select coalesce(c.created_by,w.owner_id),c.workspace_id into message_sender,target_workspace
  from public.channels c join public.workspaces w on w.id=c.workspace_id where c.id=target_channel_id;
  select coalesce(nullif(full_name,''),'A member') into actor_name from public.profiles where id=auth.uid();
  insert into public.channel_messages(workspace_id,channel_id,sender_id,body,message_type)
  values(target_workspace,target_channel_id,message_sender,actor_name||' '||change_text,'system');
end $$;

create or replace function public.sync_all_members_group()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' then
    insert into public.channel_members(channel_id,user_id,role)
    select c.id,new.user_id,case when w.owner_id=new.user_id then 'admin'::public.group_member_role else 'member'::public.group_member_role end
    from public.channels c join public.workspaces w on w.id=c.workspace_id
    where c.workspace_id=new.workspace_id and c.kind='group' and c.is_workspace_group
    on conflict do nothing;
    return new;
  end if;
  delete from public.channel_members cm using public.channels c
  where cm.channel_id=c.id and c.workspace_id=old.workspace_id and c.is_workspace_group and cm.user_id=old.user_id;
  return old;
end $$;
drop trigger if exists sync_all_members_group_trigger on public.workspace_members;
create trigger sync_all_members_group_trigger after insert or delete on public.workspace_members for each row execute function public.sync_all_members_group();

create or replace function public.setup_new_group()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.kind='group' then
    if new.created_by is null then new.created_by:=auth.uid(); end if;
    insert into public.channel_permissions(channel_id) values(new.id) on conflict do nothing;
    if new.created_by is not null then insert into public.channel_members(channel_id,user_id,role) values(new.id,new.created_by,'admin') on conflict do nothing; end if;
  end if;
  return new;
end $$;
drop trigger if exists setup_new_group_trigger on public.channels;
create trigger setup_new_group_trigger after insert on public.channels for each row execute function public.setup_new_group();

create or replace function public.set_channel_member_role(target_channel_id uuid,target_user_id uuid,next_role public.group_member_role)
returns void language plpgsql security definer set search_path=public as $$
declare creator uuid; old_role public.group_member_role; target_name text;
begin
  if not public.is_channel_admin(target_channel_id) then raise exception 'Only group admins can change admins'; end if;
  select created_by into creator from public.channels where id=target_channel_id;
  if target_user_id=creator and next_role<>'admin' then raise exception 'The group creator must remain an admin'; end if;
  select role into old_role from public.channel_members where channel_id=target_channel_id and user_id=target_user_id;
  if old_role=next_role then return; end if;
  select coalesce(nullif(full_name,''),'Member') into target_name from public.profiles where id=target_user_id;
  update public.channel_members set role=next_role where channel_id=target_channel_id and user_id=target_user_id;
  perform public.log_channel_change(target_channel_id,'changed '||target_name||' from '||case when old_role='admin' then 'Group admin' else 'Member' end||' to '||case when next_role='admin' then 'Group admin' else 'Member' end||'.');
end $$;

create or replace function public.update_channel_permission(target_channel_id uuid,permission_name text,enabled boolean)
returns void language plpgsql security definer set search_path=public as $$
declare old_value boolean; permission_label text;
begin
  if not public.is_channel_admin(target_channel_id) then raise exception 'Only group admins can change permissions'; end if;
  if permission_name not in ('members_edit_settings','members_send_messages','members_add_members','members_share_history','members_invite_link','admins_approve_members') then raise exception 'Unknown group permission'; end if;
  execute format('select %I from public.channel_permissions where channel_id=$1',permission_name) into old_value using target_channel_id;
  if old_value=enabled then return; end if;
  execute format('update public.channel_permissions set %I=$1,updated_at=now() where channel_id=$2',permission_name) using enabled,target_channel_id;
  permission_label:=case permission_name when 'members_edit_settings' then 'Edit group settings' when 'members_send_messages' then 'Send new messages' when 'members_add_members' then 'Add other members' when 'members_share_history' then 'Send message history' when 'members_invite_link' then 'Invite via link' else 'Approve new members' end;
  perform public.log_channel_change(target_channel_id,'changed “'||permission_label||'” from '||case when old_value then 'On' else 'Off' end||' to '||case when enabled then 'On' else 'Off' end||'.');
end $$;

create or replace function public.can_edit_channel(target_channel_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.channel_members cm join public.channel_permissions cp on cp.channel_id=cm.channel_id where cm.channel_id=target_channel_id and cm.user_id=auth.uid() and (cm.role='admin' or cp.members_edit_settings));
$$;

create or replace function public.rename_channel(target_channel_id uuid,next_name text)
returns void language plpgsql security definer set search_path=public as $$
declare old_name text;
begin
  if not public.can_edit_channel(target_channel_id) then raise exception 'You cannot edit this group'; end if;
  if char_length(trim(next_name))<2 or char_length(trim(next_name))>60 then raise exception 'Group name must be 2 to 60 characters'; end if;
  select name into old_name from public.channels where id=target_channel_id and kind='group';
  if old_name=trim(next_name) then return; end if;
  update public.channels set name=trim(next_name) where id=target_channel_id and kind='group';
  perform public.log_channel_change(target_channel_id,'changed the group name from “'||old_name||'” to “'||trim(next_name)||'”.');
end $$;

create or replace function public.set_channel_avatar(target_channel_id uuid,next_avatar_url text)
returns void language plpgsql security definer set search_path=public as $$
declare old_avatar text;
begin
  if not public.can_edit_channel(target_channel_id) then raise exception 'You cannot edit this group'; end if;
  select avatar_url into old_avatar from public.channels where id=target_channel_id;
  if old_avatar is not distinct from next_avatar_url then return; end if;
  update public.channels set avatar_url=next_avatar_url where id=target_channel_id and kind='group';
  perform public.log_channel_change(target_channel_id,case when next_avatar_url is null then 'removed the group photo (previous photo → no photo).' when old_avatar is null then 'added a group photo (no photo → new photo).' else 'changed the group photo (previous photo → new photo).' end);
end $$;

create or replace function public.update_channel_description(target_channel_id uuid,next_description text)
returns void language plpgsql security definer set search_path=public as $$
declare old_description text;
begin
  if not public.can_edit_channel(target_channel_id) then raise exception 'You cannot edit this group'; end if;
  select description into old_description from public.channels where id=target_channel_id;
  if old_description=trim(next_description) then return; end if;
  update public.channels set description=trim(next_description) where id=target_channel_id and kind='group';
  perform public.log_channel_change(target_channel_id,'changed the group description from “'||coalesce(nullif(old_description,''),'No description')||'” to “'||coalesce(nullif(trim(next_description),''),'No description')||'”.');
end $$;

-- Group admins, or members explicitly allowed to invite, can create an invite
-- for the workspace-wide All members group. Workspace owners keep access too.
create or replace function public.create_workspace_invite(target_workspace_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare invite_token uuid;
begin
  if auth.uid() is null or not (
    public.is_workspace_owner(target_workspace_id) or exists(
      select 1 from public.channels c
      join public.channel_members cm on cm.channel_id=c.id and cm.user_id=auth.uid()
      join public.channel_permissions cp on cp.channel_id=c.id
      where c.workspace_id=target_workspace_id and c.kind='group' and c.is_workspace_group
        and (cm.role='admin' or cp.members_invite_link or cp.members_add_members)
    )
  ) then raise exception 'You do not have permission to create invite links'; end if;
  insert into public.workspace_invites(workspace_id,created_by) values(target_workspace_id,auth.uid()) returning token into invite_token;
  return invite_token;
end $$;
grant execute on function public.create_workspace_invite(uuid) to authenticated;

alter table public.channel_members enable row level security;
alter table public.channel_permissions enable row level security;
grant select on public.channel_members,public.channel_permissions to authenticated;
grant execute on function public.set_channel_member_role(uuid,uuid,public.group_member_role) to authenticated;
grant execute on function public.update_channel_permission(uuid,text,boolean) to authenticated;
grant execute on function public.rename_channel(uuid,text) to authenticated;
grant execute on function public.set_channel_avatar(uuid,text) to authenticated;
grant execute on function public.update_channel_description(uuid,text) to authenticated;
drop policy if exists "group members read group membership" on public.channel_members;
create policy "group members read group membership" on public.channel_members for select to authenticated using(public.is_channel_member(channel_id));
drop policy if exists "group members read permissions" on public.channel_permissions;
create policy "group members read permissions" on public.channel_permissions for select to authenticated using(public.is_channel_member(channel_id));

drop policy if exists "workspace members read group messages" on public.channel_messages;
create policy "workspace members read group messages" on public.channel_messages for select to authenticated using(exists(
  select 1 from public.channel_members cm join public.channel_permissions cp on cp.channel_id=cm.channel_id
  where cm.channel_id=channel_messages.channel_id and cm.user_id=auth.uid() and (cp.members_share_history or channel_messages.created_at>=cm.joined_at)
));
drop policy if exists "members send group messages" on public.channel_messages;
create policy "members send group messages" on public.channel_messages for insert to authenticated with check(sender_id=auth.uid() and exists(
  select 1 from public.channel_members cm join public.channel_permissions cp on cp.channel_id=cm.channel_id
  where cm.channel_id=channel_messages.channel_id and cm.user_id=auth.uid() and (cm.role='admin' or cp.members_send_messages)
));

alter table public.channel_members replica identity full;
alter table public.channel_permissions replica identity full;
do $$ begin alter publication supabase_realtime add table public.channel_members; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.channel_permissions; exception when duplicate_object then null; end $$;
