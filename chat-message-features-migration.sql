-- Run once in Supabase SQL Editor. Adds chat presence, delivery/read receipts,
-- reactions, replies and server-authorized message actions.
alter table public.direct_messages add column if not exists reply_to_id uuid references public.direct_messages(id) on delete set null;
alter table public.direct_messages add column if not exists pinned_at timestamptz;
alter table public.channel_messages add column if not exists reply_to_id uuid references public.channel_messages(id) on delete set null;
alter table public.channel_messages add column if not exists pinned_at timestamptz;

create table if not exists public.workspace_presence (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now(),
  primary key(workspace_id,user_id)
);

create table if not exists public.direct_message_receipts (
  message_id uuid primary key references public.direct_messages(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz
);

insert into public.direct_message_receipts(message_id,workspace_id,recipient_id,delivered_at)
select m.id,m.workspace_id,m.recipient_id,
  case when exists(
    select 1 from public.workspace_presence p
    where p.workspace_id=m.workspace_id and p.user_id=m.recipient_id
      and p.last_seen>now()-interval '35 seconds'
  ) then now() end
from public.direct_messages m
on conflict(message_id) do update
set delivered_at=coalesce(public.direct_message_receipts.delivered_at,excluded.delivered_at);

create table if not exists public.chat_message_reactions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  message_kind text not null check(message_kind in ('direct','group')),
  message_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check(char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key(message_kind,message_id,user_id,emoji)
);

alter table public.workspace_presence enable row level security;
alter table public.direct_message_receipts enable row level security;
alter table public.chat_message_reactions enable row level security;
grant select on public.workspace_presence,public.direct_message_receipts,public.chat_message_reactions to authenticated;
grant insert,delete on public.chat_message_reactions to authenticated;
grant update,delete on public.direct_messages,public.channel_messages to authenticated;

drop policy if exists "members read workspace presence" on public.workspace_presence;
create policy "members read workspace presence" on public.workspace_presence for select to authenticated using(public.is_workspace_member(workspace_id));
drop policy if exists "participants read direct receipts" on public.direct_message_receipts;
create policy "participants read direct receipts" on public.direct_message_receipts for select to authenticated using(
  recipient_id=auth.uid() or exists(select 1 from public.direct_messages m where m.id=message_id and m.sender_id=auth.uid())
);
drop policy if exists "members read chat reactions" on public.chat_message_reactions;
create policy "members read chat reactions" on public.chat_message_reactions for select to authenticated using(public.is_workspace_member(workspace_id));
-- Drop both the current policy name and the short-lived older name so this
-- migration remains safe to rerun after any previous version.
drop policy if exists "members manage their chat reactions" on public.chat_message_reactions;
drop policy if exists "members add their chat reactions" on public.chat_message_reactions;
create policy "members manage their chat reactions" on public.chat_message_reactions for all to authenticated
using(user_id=auth.uid() and public.is_workspace_member(workspace_id))
with check(user_id=auth.uid() and public.is_workspace_member(workspace_id));

create or replace function public.create_direct_message_receipt()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.direct_message_receipts(message_id,workspace_id,recipient_id,delivered_at)
  values(new.id,new.workspace_id,new.recipient_id,
    case when exists(select 1 from public.workspace_presence p where p.workspace_id=new.workspace_id and p.user_id=new.recipient_id and p.last_seen>now()-interval '35 seconds') then now() end
  ) on conflict(message_id) do nothing;
  return new;
end $$;
drop trigger if exists direct_message_receipt_trigger on public.direct_messages;
create trigger direct_message_receipt_trigger after insert on public.direct_messages for each row execute function public.create_direct_message_receipt();

create or replace function public.touch_workspace_presence(target_workspace_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_workspace_member(target_workspace_id) then raise exception 'Not a workspace member'; end if;
  insert into public.workspace_presence(workspace_id,user_id,last_seen) values(target_workspace_id,auth.uid(),now())
  on conflict(workspace_id,user_id) do update set last_seen=excluded.last_seen;
  update public.direct_message_receipts r set delivered_at=coalesce(r.delivered_at,now())
  where r.workspace_id=target_workspace_id and r.recipient_id=auth.uid() and r.delivered_at is null;
end $$;

create or replace function public.mark_direct_chat_read(target_workspace_id uuid,target_sender_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.direct_message_receipts r set delivered_at=coalesce(r.delivered_at,now()),read_at=coalesce(r.read_at,now())
  from public.direct_messages m
  where r.message_id=m.id and r.workspace_id=target_workspace_id and r.recipient_id=auth.uid()
    and m.sender_id=target_sender_id;
end $$;

-- Return only the signed-in sender's own outgoing message statuses. Using a
-- security-definer RPC avoids receipt-list queries being blocked by nested RLS
-- checks while still preventing access to anybody else's conversation.
create or replace function public.get_direct_chat_receipts(target_workspace_id uuid,target_partner_id uuid)
returns table(message_id uuid,delivered_at timestamptz,read_at timestamptz)
language sql stable security definer set search_path=public as $$
  select r.message_id,r.delivered_at,r.read_at
  from public.direct_message_receipts r
  join public.direct_messages m on m.id=r.message_id
  where r.workspace_id=target_workspace_id
    and m.sender_id=auth.uid()
    and m.recipient_id=target_partner_id
$$;

create or replace function public.set_chat_message_pin(message_kind text,target_message_id uuid,pinned boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if message_kind='direct' then
    update public.direct_messages set pinned_at=case when pinned then now() end
    where id=target_message_id and (sender_id=auth.uid() or recipient_id=auth.uid());
  elsif message_kind='group' then
    update public.channel_messages set pinned_at=case when pinned then now() end
    where id=target_message_id and public.is_channel_member(channel_id);
  else raise exception 'Unknown message kind'; end if;
end $$;

create or replace function public.delete_chat_message(message_kind text,target_message_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if message_kind='direct' then delete from public.direct_messages where id=target_message_id and sender_id=auth.uid();
  elsif message_kind='group' then delete from public.channel_messages where id=target_message_id and (sender_id=auth.uid() or public.is_channel_admin(channel_id));
  else raise exception 'Unknown message kind'; end if;
end $$;

grant execute on function public.touch_workspace_presence(uuid) to authenticated;
grant execute on function public.mark_direct_chat_read(uuid,uuid) to authenticated;
grant execute on function public.get_direct_chat_receipts(uuid,uuid) to authenticated;
grant execute on function public.set_chat_message_pin(text,uuid,boolean) to authenticated;
grant execute on function public.delete_chat_message(text,uuid) to authenticated;

alter table public.direct_message_receipts replica identity full;
alter table public.chat_message_reactions replica identity full;
do $$ begin alter publication supabase_realtime add table public.direct_message_receipts; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.chat_message_reactions; exception when duplicate_object then null; end $$;
