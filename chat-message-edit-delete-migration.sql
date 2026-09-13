-- Run once in Supabase SQL Editor. Safe to rerun.
-- Message editing, per-user deletion and chat-poll votes.

alter table public.direct_messages add column if not exists edited_at timestamptz;
alter table public.channel_messages add column if not exists edited_at timestamptz;

create table if not exists public.chat_message_hidden (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  message_kind text not null check (message_kind in ('direct','group')),
  message_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key(message_kind,message_id,user_id)
);

create table if not exists public.chat_poll_votes (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  message_kind text not null check (message_kind in ('direct','group')),
  message_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index integer not null check(option_index>=0),
  created_at timestamptz not null default now(),
  primary key(message_kind,message_id,user_id)
);

alter table public.chat_message_hidden enable row level security;
alter table public.chat_poll_votes enable row level security;
grant select on public.chat_message_hidden,public.chat_poll_votes to authenticated;

drop policy if exists "users read their hidden chat messages" on public.chat_message_hidden;
create policy "users read their hidden chat messages" on public.chat_message_hidden for select to authenticated using(user_id=auth.uid());

drop policy if exists "chat participants read poll votes" on public.chat_poll_votes;
create policy "chat participants read poll votes" on public.chat_poll_votes for select to authenticated using(public.is_workspace_member(workspace_id));

create or replace function public.edit_chat_message(message_kind text,target_message_id uuid,next_body text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if trim(coalesce(next_body,''))='' then raise exception 'Message cannot be empty'; end if;
  if message_kind='direct' then
    update public.direct_messages set body=trim(next_body),edited_at=now()
    where id=target_message_id and sender_id=auth.uid() and message_type='text';
  elsif message_kind='group' then
    update public.channel_messages set body=trim(next_body),edited_at=now()
    where id=target_message_id and sender_id=auth.uid() and message_type='text';
  else raise exception 'Unknown message kind'; end if;
  if not found then raise exception 'Only your own text message can be edited'; end if;
end $$;

create or replace function public.hide_chat_messages(message_kind text,target_message_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
  if message_kind='direct' then
    insert into public.chat_message_hidden(workspace_id,message_kind,message_id,user_id)
    select message.workspace_id,'direct',message.id,auth.uid() from public.direct_messages message
    where message.id=any(target_message_ids) and (message.sender_id=auth.uid() or message.recipient_id=auth.uid())
    on conflict do nothing;
  elsif message_kind='group' then
    insert into public.chat_message_hidden(workspace_id,message_kind,message_id,user_id)
    select message.workspace_id,'group',message.id,auth.uid() from public.channel_messages message
    where message.id=any(target_message_ids) and public.is_channel_member(message.channel_id)
    on conflict do nothing;
  else raise exception 'Unknown message kind'; end if;
end $$;

-- Run in Supabase SQL Editor. Safe to rerun. Keeps a tombstone for both participants.
begin;
alter table public.direct_messages add column if not exists deleted_at timestamptz;
alter table public.channel_messages add column if not exists deleted_at timestamptz;

create or replace function public.mark_chat_messages_deleted(message_kind text,target_message_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if message_kind='direct' then
    update public.direct_messages
    set body='This message was deleted', deleted_at=now(), edited_at=null,
        message_type='text',attachment_url=null,attachment_name=null,post_id=null,reply_to_id=null,pinned_at=null
    where id=any(target_message_ids) and sender_id=auth.uid() and deleted_at is null;
  elsif message_kind='group' then
    update public.channel_messages
    set body='This message was deleted', deleted_at=now(), edited_at=null,
        message_type='text',attachment_url=null,attachment_name=null,post_id=null,reply_to_id=null,pinned_at=null,poll_options=null
    where id=any(target_message_ids) and sender_id=auth.uid() and deleted_at is null;
  else raise exception 'Unknown message kind'; end if;
end $$;

-- Older clients must also preserve the message row.
create or replace function public.delete_chat_messages_for_everyone(message_kind text,target_message_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.mark_chat_messages_deleted(message_kind,target_message_ids);
end $$;

-- Do not allow an old edit dialog or another client to restore deleted content.
create or replace function public.prevent_deleted_chat_edit()
returns trigger language plpgsql set search_path=public as $$
begin
  if old.deleted_at is not null then
    new.body := old.body; new.deleted_at := old.deleted_at;
    new.edited_at := old.edited_at; new.message_type := old.message_type;
    new.attachment_url := null; new.attachment_name := null; new.post_id := null;
    new.reply_to_id := null; new.pinned_at := null;
  end if;
  return new;
end $$;
drop trigger if exists preserve_deleted_message on public.direct_messages;
create trigger preserve_deleted_message before update on public.direct_messages
for each row execute function public.prevent_deleted_chat_edit();
drop trigger if exists preserve_deleted_message on public.channel_messages;
create trigger preserve_deleted_message before update on public.channel_messages
for each row execute function public.prevent_deleted_chat_edit();

revoke all on function public.mark_chat_messages_deleted(text,uuid[]) from public;
grant execute on function public.mark_chat_messages_deleted(text,uuid[]) to authenticated;
commit;

create or replace function public.vote_chat_poll(message_kind text,target_message_id uuid,target_option_index integer)
returns void language plpgsql security definer set search_path=public as $$
declare target_workspace uuid; option_count integer;
begin
  if message_kind='group' then
    select workspace_id,jsonb_array_length(poll_options) into target_workspace,option_count
    from public.channel_messages where id=target_message_id and message_type='poll' and public.is_channel_member(channel_id);
  else raise exception 'Polls are available in group chats'; end if;
  if target_workspace is null or target_option_index<0 or target_option_index>=option_count then raise exception 'Invalid poll option'; end if;
  insert into public.chat_poll_votes(workspace_id,message_kind,message_id,user_id,option_index)
  values(target_workspace,message_kind,target_message_id,auth.uid(),target_option_index)
  on conflict on constraint chat_poll_votes_pkey do update set option_index=excluded.option_index,created_at=now();
end $$;

create or replace function public.get_chat_poll_votes(message_kind text,target_message_ids uuid[])
returns table(message_id uuid,user_id uuid,option_index integer)
language plpgsql stable security definer set search_path=public as $$
begin
  if message_kind='group' then
    return query select vote.message_id,vote.user_id,vote.option_index from public.chat_poll_votes vote
    where vote.message_kind='group' and vote.message_id=any(target_message_ids) and exists(
      select 1 from public.channel_messages message where message.id=vote.message_id and public.is_channel_member(message.channel_id)
    );
  end if;
end $$;

grant execute on function public.edit_chat_message(text,uuid,text) to authenticated;
grant execute on function public.hide_chat_messages(text,uuid[]) to authenticated;
grant execute on function public.delete_chat_messages_for_everyone(text,uuid[]) to authenticated;
grant execute on function public.vote_chat_poll(text,uuid,integer) to authenticated;
grant execute on function public.get_chat_poll_votes(text,uuid[]) to authenticated;

alter table public.chat_message_hidden replica identity full;
alter table public.chat_poll_votes replica identity full;
do $$ begin alter publication supabase_realtime add table public.chat_message_hidden; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.chat_poll_votes; exception when duplicate_object then null; end $$;
