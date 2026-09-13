-- Run once in Supabase SQL Editor. Persistent incoming-call signals for direct workspace chats.
create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (signal_type in ('offer','answer','ice','hangup')),
  mode text check (mode in ('audio','video')),
  signal jsonb,
  created_at timestamptz not null default now()
);
alter table public.call_signals enable row level security;
grant select, insert, delete on public.call_signals to authenticated;
drop policy if exists "members send call signals" on public.call_signals;
create policy "members send call signals" on public.call_signals for insert to authenticated with check (sender_id=auth.uid() and public.is_workspace_member(workspace_id));
drop policy if exists "recipients read call signals" on public.call_signals;
create policy "recipients read call signals" on public.call_signals for select to authenticated using (recipient_id=auth.uid());
drop policy if exists "recipients clear call signals" on public.call_signals;
create policy "recipients clear call signals" on public.call_signals for delete to authenticated using (recipient_id=auth.uid());
alter table public.call_signals replica identity full;
do $$ begin alter publication supabase_realtime add table public.call_signals; exception when duplicate_object then null; end $$;
