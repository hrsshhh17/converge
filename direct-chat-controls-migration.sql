-- Run in Supabase SQL Editor. Safe to rerun. Private-chat blocks and reports.
begin;
create table if not exists public.direct_chat_blocks (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 blocked_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(workspace_id,user_id,blocked_id),check(user_id<>blocked_id)
);
create table if not exists public.direct_chat_reports (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 reporter_id uuid not null references auth.users(id) on delete cascade,
 reported_id uuid not null references auth.users(id) on delete cascade,
 reason text not null check(length(trim(reason)) between 1 and 2000),
 created_at timestamptz not null default now(),check(reporter_id<>reported_id)
);

-- Blocked outbound messages remain visible to their sender with a single tick,
-- but are never selectable by the recipient. System events are owner-only.
alter table public.direct_messages add column if not exists blocked_delivery boolean not null default false;
alter table public.direct_messages add column if not exists system_owner_id uuid references auth.users(id) on delete cascade;
create index if not exists direct_messages_blocked_delivery_idx
on public.direct_messages(workspace_id,recipient_id,blocked_delivery,created_at desc);
alter table public.direct_chat_blocks enable row level security;
alter table public.direct_chat_reports enable row level security;
grant select,insert,delete on public.direct_chat_blocks to authenticated;
grant select,insert on public.direct_chat_reports to authenticated;
drop policy if exists "read own contact blocks" on public.direct_chat_blocks;
create policy "read own contact blocks" on public.direct_chat_blocks for select to authenticated using(user_id=auth.uid());
drop policy if exists "add own contact block" on public.direct_chat_blocks;
create policy "add own contact block" on public.direct_chat_blocks for insert to authenticated with check(user_id=auth.uid() and public.is_workspace_member(workspace_id) and exists(select 1 from public.workspace_members m where m.workspace_id=direct_chat_blocks.workspace_id and m.user_id=blocked_id));
drop policy if exists "remove own contact block" on public.direct_chat_blocks;
create policy "remove own contact block" on public.direct_chat_blocks for delete to authenticated using(user_id=auth.uid());
drop policy if exists "submit contact report" on public.direct_chat_reports;
create policy "submit contact report" on public.direct_chat_reports for insert to authenticated with check(reporter_id=auth.uid() and public.is_workspace_member(workspace_id) and exists(select 1 from public.workspace_members m where m.workspace_id=direct_chat_reports.workspace_id and m.user_id=reported_id));
drop policy if exists "reporter and workspace owner read reports" on public.direct_chat_reports;
create policy "reporter and workspace owner read reports" on public.direct_chat_reports for select to authenticated using(reporter_id=auth.uid() or exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=auth.uid()));

create or replace function public.direct_chat_is_blocked(target_workspace_id uuid,target_partner_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.direct_chat_blocks b where b.workspace_id=target_workspace_id and
 ((b.user_id=auth.uid() and b.blocked_id=target_partner_id) or (b.blocked_id=auth.uid() and b.user_id=target_partner_id)));
$$;
revoke all on function public.direct_chat_is_blocked(uuid,uuid) from public;
grant execute on function public.direct_chat_is_blocked(uuid,uuid) to authenticated;

-- Use this RPC anywhere a direct-chat identity is shown. A person who has been
-- blocked may still know the contact name, but no longer receives their photo.
create or replace function public.get_workspace_chat_identities(target_workspace_id uuid)
returns table(id uuid,full_name text,avatar_url text,job_title text,bio text)
language sql stable security definer set search_path='' as $$
 select p.id,p.full_name,
  case when exists(
   select 1 from public.direct_chat_blocks b
   where b.workspace_id=target_workspace_id and b.user_id=p.id and b.blocked_id=(select auth.uid())
  ) then null else p.avatar_url end,
  p.job_title,p.bio
 from public.workspace_profiles p
 where p.workspace_id=target_workspace_id
   and (select auth.uid()) is not null
   and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id=target_workspace_id and wm.user_id=(select auth.uid())
   )
$$;
revoke all on function public.get_workspace_chat_identities(uuid) from public, anon;
grant execute on function public.get_workspace_chat_identities(uuid) to authenticated;

drop policy if exists "members read their direct messages" on public.direct_messages;
create policy "members read their direct messages" on public.direct_messages for select to authenticated using(
 system_owner_id=auth.uid()
 or (system_owner_id is null and (
  sender_id=auth.uid()
  or (recipient_id=auth.uid() and blocked_delivery=false)
 ))
);
drop policy if exists "members send direct messages" on public.direct_messages;
create policy "members send direct messages" on public.direct_messages for insert to authenticated with check(
 sender_id=auth.uid()
 and (system_owner_id is null or system_owner_id=auth.uid())
 and public.is_workspace_member(workspace_id)
 and exists(select 1 from public.workspace_members where workspace_id=direct_messages.workspace_id and user_id=recipient_id)
);

create or replace function public.enforce_direct_chat_block()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_TABLE_NAME='call_signals' then
  if new.signal_type='hangup' then return new; end if;
  if exists(select 1 from public.direct_chat_blocks b where b.workspace_id=new.workspace_id and
   ((b.user_id=new.sender_id and b.blocked_id=new.recipient_id) or (b.user_id=new.recipient_id and b.blocked_id=new.sender_id))) then
   raise exception 'This private conversation is blocked. Calls cannot be sent.';
  end if;
  return new;
 end if;
 if new.system_owner_id is not null then
  if new.system_owner_id<>new.sender_id then raise exception 'Invalid private system event'; end if;
  new.blocked_delivery=false;
 elsif exists(select 1 from public.direct_chat_blocks b where b.workspace_id=new.workspace_id and
  ((b.user_id=new.sender_id and b.blocked_id=new.recipient_id) or (b.user_id=new.recipient_id and b.blocked_id=new.sender_id))) then
  new.blocked_delivery=true;
 end if;
 return new;
end $$;
drop trigger if exists enforce_contact_block on public.direct_messages;
create trigger enforce_contact_block before insert on public.direct_messages for each row execute function public.enforce_direct_chat_block();
drop trigger if exists enforce_contact_block on public.call_signals;
create trigger enforce_contact_block before insert on public.call_signals for each row execute function public.enforce_direct_chat_block();

-- No delivery receipt is created for a blocked or owner-only message, keeping
-- its sender-side state at one tick without leaking block status.
create or replace function public.create_direct_message_receipt()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.blocked_delivery or new.system_owner_id is not null then return new; end if;
 insert into public.direct_message_receipts(message_id,workspace_id,recipient_id,delivered_at)
 values(new.id,new.workspace_id,new.recipient_id,
  case when exists(select 1 from public.workspace_presence p where p.workspace_id=new.workspace_id and p.user_id=new.recipient_id and p.last_seen>now()-interval '35 seconds') then now() end
 ) on conflict(message_id) do nothing;
 return new;
end $$;
delete from public.direct_message_receipts r using public.direct_messages m
where r.message_id=m.id and (m.blocked_delivery or m.system_owner_id is not null);
commit;
