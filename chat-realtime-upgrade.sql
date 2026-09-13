-- Run once in Supabase SQL Editor. Safe to rerun.
-- Adds group delivery/read receipts, unread-chat summaries and receipt info.

create table if not exists public.channel_message_receipts (
  message_id uuid not null references public.channel_messages(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key(message_id,recipient_id)
);

alter table public.channel_message_receipts enable row level security;
grant select on public.channel_message_receipts to authenticated;

drop policy if exists "group participants read message receipts" on public.channel_message_receipts;
create policy "group participants read message receipts" on public.channel_message_receipts
for select to authenticated using(
  recipient_id=auth.uid() or exists(
    select 1 from public.channel_messages m
    where m.id=message_id and m.sender_id=auth.uid()
  )
);

create or replace function public.create_channel_message_receipts()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.message_type='system' then return new; end if;
  insert into public.channel_message_receipts(message_id,workspace_id,channel_id,recipient_id,delivered_at)
  select new.id,new.workspace_id,new.channel_id,member.user_id,
    case when presence.last_seen>now()-interval '35 seconds' then now() end
  from public.channel_members member
  left join public.workspace_presence presence
    on presence.workspace_id=new.workspace_id and presence.user_id=member.user_id
  where member.channel_id=new.channel_id and member.user_id<>new.sender_id
  on conflict(message_id,recipient_id) do nothing;
  return new;
end $$;

drop trigger if exists channel_message_receipts_trigger on public.channel_messages;
create trigger channel_message_receipts_trigger
after insert on public.channel_messages for each row execute function public.create_channel_message_receipts();

insert into public.channel_message_receipts(message_id,workspace_id,channel_id,recipient_id,delivered_at)
select message.id,message.workspace_id,message.channel_id,member.user_id,
  case when presence.last_seen>now()-interval '35 seconds' then now() end
from public.channel_messages message
join public.channel_members member on member.channel_id=message.channel_id and member.user_id<>message.sender_id
left join public.workspace_presence presence on presence.workspace_id=message.workspace_id and presence.user_id=member.user_id
where message.message_type<>'system'
on conflict(message_id,recipient_id) do update set
  delivered_at=coalesce(public.channel_message_receipts.delivered_at,excluded.delivered_at);

create or replace function public.touch_workspace_presence(target_workspace_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_workspace_member(target_workspace_id) then raise exception 'Not a workspace member'; end if;
  insert into public.workspace_presence(workspace_id,user_id,last_seen)
  values(target_workspace_id,auth.uid(),now())
  on conflict(workspace_id,user_id) do update set last_seen=excluded.last_seen;
  update public.direct_message_receipts set delivered_at=coalesce(delivered_at,now())
  where workspace_id=target_workspace_id and recipient_id=auth.uid() and delivered_at is null;
  update public.channel_message_receipts set delivered_at=coalesce(delivered_at,now())
  where workspace_id=target_workspace_id and recipient_id=auth.uid() and delivered_at is null;
end $$;

create or replace function public.mark_group_chat_read(target_workspace_id uuid,target_channel_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.channel_message_receipts set
    delivered_at=coalesce(delivered_at,now()),read_at=coalesce(read_at,now())
  where workspace_id=target_workspace_id and channel_id=target_channel_id and recipient_id=auth.uid();
end $$;

create or replace function public.get_group_chat_receipts(target_workspace_id uuid,target_channel_id uuid)
returns table(message_id uuid,recipient_id uuid,full_name text,delivered_at timestamptz,read_at timestamptz)
language sql stable security definer set search_path=public as $$
  select receipt.message_id,receipt.recipient_id,coalesce(profile.full_name,'Member'),receipt.delivered_at,receipt.read_at
  from public.channel_message_receipts receipt
  join public.channel_messages message on message.id=receipt.message_id
  left join public.profiles profile on profile.id=receipt.recipient_id
  where receipt.workspace_id=target_workspace_id and receipt.channel_id=target_channel_id
    and message.sender_id=auth.uid()
$$;

create or replace function public.get_chat_message_receipt_info(message_kind text,target_message_id uuid)
returns table(user_id uuid,full_name text,delivered_at timestamptz,read_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if message_kind='direct' then
    return query select receipt.recipient_id,coalesce(profile.full_name,'Member'),receipt.delivered_at,receipt.read_at
    from public.direct_message_receipts receipt
    join public.direct_messages message on message.id=receipt.message_id
    left join public.profiles profile on profile.id=receipt.recipient_id
    where receipt.message_id=target_message_id and message.sender_id=auth.uid();
  elsif message_kind='group' then
    return query select receipt.recipient_id,coalesce(profile.full_name,'Member'),receipt.delivered_at,receipt.read_at
    from public.channel_message_receipts receipt
    join public.channel_messages message on message.id=receipt.message_id
    left join public.profiles profile on profile.id=receipt.recipient_id
    where receipt.message_id=target_message_id and message.sender_id=auth.uid();
  end if;
end $$;

create or replace function public.get_workspace_unread_chats(target_workspace_id uuid)
returns table(chat_id text,unread_count bigint)
language sql stable security definer set search_path=public as $$
  select message.sender_id::text,count(*)::bigint
  from public.direct_message_receipts receipt
  join public.direct_messages message on message.id=receipt.message_id
  where receipt.workspace_id=target_workspace_id and receipt.recipient_id=auth.uid() and receipt.read_at is null
  group by message.sender_id
  union all
  select 'group',count(*)::bigint
  from public.channel_message_receipts receipt
  where receipt.workspace_id=target_workspace_id and receipt.recipient_id=auth.uid() and receipt.read_at is null
  having count(*)>0
$$;

grant execute on function public.touch_workspace_presence(uuid) to authenticated;
grant execute on function public.mark_group_chat_read(uuid,uuid) to authenticated;
grant execute on function public.get_group_chat_receipts(uuid,uuid) to authenticated;
grant execute on function public.get_chat_message_receipt_info(text,uuid) to authenticated;
grant execute on function public.get_workspace_unread_chats(uuid) to authenticated;

alter table public.channel_message_receipts replica identity full;
do $$ begin alter publication supabase_realtime add table public.channel_message_receipts; exception when duplicate_object then null; end $$;
