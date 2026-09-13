-- Run once in Supabase SQL Editor. Safe to run again.
begin;
create table if not exists public.workspace_profiles (
 workspace_id uuid not null,
 id uuid not null,
 full_name text,
 avatar_url text,
 job_title text,
 created_at timestamptz not null default now(),
 primary key(workspace_id,id),
 foreign key(workspace_id,id) references public.workspace_members(workspace_id,user_id) on delete cascade
);
alter table public.workspace_profiles add column if not exists bio text;
alter table public.workspace_profiles drop constraint if exists workspace_profiles_bio_length;
alter table public.workspace_profiles add constraint workspace_profiles_bio_length check (char_length(coalesce(bio,'')) <= 150);
alter table public.workspace_profiles enable row level security;
grant select,insert,update on public.workspace_profiles to authenticated;
drop policy if exists "members read workspace profiles" on public.workspace_profiles;
create policy "members read workspace profiles" on public.workspace_profiles for select to authenticated using(public.is_workspace_member(workspace_id));
drop policy if exists "members create own workspace profile" on public.workspace_profiles;
create policy "members create own workspace profile" on public.workspace_profiles for insert to authenticated with check(id=auth.uid() and public.is_workspace_member(workspace_id));
drop policy if exists "members edit own workspace profile" on public.workspace_profiles;
create policy "members edit own workspace profile" on public.workspace_profiles for update to authenticated using(id=auth.uid() and public.is_workspace_member(workspace_id)) with check(id=auth.uid() and public.is_workspace_member(workspace_id));
-- Preserve the existing profile in the user's earliest workspace only.
-- Other workspace profiles start independently with the signup name.
with memberships as (
 select m.*,row_number() over(partition by user_id order by joined_at,workspace_id) as position from public.workspace_members m
)
insert into public.workspace_profiles(workspace_id,id,full_name,avatar_url,job_title)
select m.workspace_id,m.user_id,
 case when m.position=1 then p.full_name else coalesce(u.raw_user_meta_data->>'full_name','Member') end,
 case when m.position=1 then p.avatar_url end,
 case when m.position=1 then p.job_title end
from memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.id=m.user_id
on conflict(workspace_id,id) do nothing;
create or replace function public.create_workspace_member_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.workspace_profiles(workspace_id,id,full_name)
 select new.workspace_id,new.user_id,coalesce(raw_user_meta_data->>'full_name','Member') from auth.users where id=new.user_id
 on conflict(workspace_id,id) do nothing;
 return new;
end;
$$;
revoke all on function public.create_workspace_member_profile() from public;
drop trigger if exists create_workspace_member_profile on public.workspace_members;
create trigger create_workspace_member_profile after insert on public.workspace_members for each row execute function public.create_workspace_member_profile();
-- Post notifications belong to the post's workspace, never a global inbox.
alter table public.activity_notifications add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
update public.activity_notifications n set workspace_id=p.workspace_id from public.posts p where p.id=n.post_id and n.workspace_id is null;
create index if not exists activity_notifications_workspace_recipient on public.activity_notifications(workspace_id,recipient_id,created_at desc);
create or replace function public.scope_activity_notification() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.post_id is not null then select workspace_id into new.workspace_id from public.posts where id=new.post_id; end if;
 if new.workspace_id is null or not exists(select 1 from public.workspace_members where workspace_id=new.workspace_id and user_id=new.recipient_id) then return null; end if;
 return new;
end;
$$;
revoke all on function public.scope_activity_notification() from public;
drop trigger if exists scope_activity_notification on public.activity_notifications;
create trigger scope_activity_notification before insert on public.activity_notifications for each row execute function public.scope_activity_notification();
create or replace function public.notify_comment_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare post_owner uuid; reply_owner uuid; mentioned record;
begin
  select author_id into post_owner from posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.author_id then
    insert into activity_notifications(recipient_id, actor_id, post_id, comment_id, kind) values (post_owner, new.author_id, new.post_id, new.id, 'post_comment');
  end if;
  if new.reply_to_id is not null then
    select author_id into reply_owner from post_comments where id = new.reply_to_id;
    if reply_owner is not null and reply_owner <> new.author_id and reply_owner <> post_owner then
      insert into activity_notifications(recipient_id, actor_id, post_id, comment_id, kind) values (reply_owner, new.author_id, new.post_id, new.id, 'comment_reply');
    end if;
  end if;
  for mentioned in select id from workspace_profiles where workspace_id = (select workspace_id from posts where id=new.post_id) and nullif(trim(full_name),'') is not null and id <> new.author_id and position('@' || lower(full_name) in lower(new.body)) > 0 loop
    if mentioned.id <> post_owner and mentioned.id is distinct from reply_owner then
      insert into activity_notifications(recipient_id, actor_id, post_id, comment_id, kind) values (mentioned.id, new.author_id, new.post_id, new.id, 'mention');
    end if;
  end loop;
  return new;
end $$;
create or replace function public.notify_post_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare mentioned record;
begin
  for mentioned in select id from workspace_profiles where workspace_id = new.workspace_id and nullif(trim(full_name),'') is not null and id <> new.author_id and position('@' || lower(full_name) in lower(coalesce(new.body, ''))) > 0 loop
    insert into activity_notifications(recipient_id, actor_id, post_id, kind) values (mentioned.id, new.author_id, new.id, 'mention');
  end loop;
  return new;
end $$;
create or replace function public.log_channel_change(target_channel_id uuid,change_text text)
returns void language plpgsql security definer set search_path=public as $$
declare message_sender uuid; target_workspace uuid; actor_name text;
begin
  select coalesce(c.created_by,w.owner_id),c.workspace_id into message_sender,target_workspace
  from public.channels c join public.workspaces w on w.id=c.workspace_id where c.id=target_channel_id;
  select coalesce(nullif(full_name,''),'A member') into actor_name from public.workspace_profiles where workspace_id=target_workspace and id=auth.uid();
  insert into public.channel_messages(workspace_id,channel_id,sender_id,body,message_type)
  values(target_workspace,target_channel_id,message_sender,actor_name||' '||change_text,'system');
end $$;
create or replace function public.set_channel_member_role(target_channel_id uuid,target_user_id uuid,next_role public.group_member_role)
returns void language plpgsql security definer set search_path=public as $$
declare creator uuid; old_role public.group_member_role; target_name text;
begin
  if not public.is_channel_admin(target_channel_id) then raise exception 'Only group admins can change admins'; end if;
  select created_by into creator from public.channels where id=target_channel_id;
  if target_user_id=creator and next_role<>'admin' then raise exception 'The group creator must remain an admin'; end if;
  select role into old_role from public.channel_members where channel_id=target_channel_id and user_id=target_user_id;
  if old_role=next_role then return; end if;
  select coalesce(nullif(full_name,''),'Member') into target_name from public.workspace_profiles where workspace_id=(select workspace_id from public.channels where id=target_channel_id) and id=target_user_id;
  update public.channel_members set role=next_role where channel_id=target_channel_id and user_id=target_user_id;
  perform public.log_channel_change(target_channel_id,'changed '||target_name||' from '||case when old_role='admin' then 'Group admin' else 'Member' end||' to '||case when next_role='admin' then 'Group admin' else 'Member' end||'.');
end $$;
commit;
