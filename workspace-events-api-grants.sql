-- Expose workspace events to signed-in clients; RLS remains the row-level gate.
alter table public.workspace_events enable row level security;
revoke all on table public.workspace_events from anon;
grant select, insert, update, delete on table public.workspace_events to authenticated;
