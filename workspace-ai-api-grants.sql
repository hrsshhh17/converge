begin;

-- Let signed-in clients reach the table through PostgREST.
-- Row visibility is still restricted by the table's RLS policies.
alter table public.workspace_ai_conversations enable row level security;
revoke all on table public.workspace_ai_conversations from anon;
grant select, insert, update, delete on table public.workspace_ai_conversations to authenticated;

commit;
