begin;

create table if not exists public.workspace_ai_conversations (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Workspace conversation',
  turns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_ai_conversations_title_length check (char_length(title) <= 80),
  constraint workspace_ai_conversations_turns_array check (jsonb_typeof(turns) = 'array')
);

create index if not exists workspace_ai_conversations_owner_updated_idx
  on public.workspace_ai_conversations (workspace_id, user_id, updated_at desc);

alter table public.workspace_ai_conversations enable row level security;

-- The Data API also requires table privileges; RLS remains the row-level gate.
revoke all on table public.workspace_ai_conversations from anon;
grant select, insert, update, delete on table public.workspace_ai_conversations to authenticated;

drop policy if exists "members read own ai conversations" on public.workspace_ai_conversations;
create policy "members read own ai conversations" on public.workspace_ai_conversations
for select to authenticated using (
  (select auth.uid()) = user_id and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_ai_conversations.workspace_id
      and wm.user_id = (select auth.uid())
  )
);

drop policy if exists "members create own ai conversations" on public.workspace_ai_conversations;
create policy "members create own ai conversations" on public.workspace_ai_conversations
for insert to authenticated with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_ai_conversations.workspace_id
      and wm.user_id = (select auth.uid())
  )
);

drop policy if exists "members update own ai conversations" on public.workspace_ai_conversations;
create policy "members update own ai conversations" on public.workspace_ai_conversations
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_ai_conversations.workspace_id
      and wm.user_id = (select auth.uid())
  )
);

drop policy if exists "members delete own ai conversations" on public.workspace_ai_conversations;
create policy "members delete own ai conversations" on public.workspace_ai_conversations
for delete to authenticated using ((select auth.uid()) = user_id);

do $$ begin
  alter publication supabase_realtime add table public.workspace_ai_conversations;
exception when duplicate_object then null;
end $$;

commit;
