-- Run once in Supabase SQL Editor to let a member leave a workspace themselves.
create policy "members can leave their workspace"
on public.workspace_members for delete to authenticated
using (user_id = auth.uid());
