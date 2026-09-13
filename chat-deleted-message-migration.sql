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
