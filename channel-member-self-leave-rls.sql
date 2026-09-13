-- A member may leave only their own non-workspace group membership.
-- Main workspace membership is managed exclusively through workspace_members.
grant delete on table public.channel_members to authenticated;

drop policy if exists "members leave their own custom groups" on public.channel_members;
create policy "members leave their own custom groups"
on public.channel_members
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.channels c
    where c.id = channel_members.channel_id
      and not c.is_workspace_group
      and public.is_workspace_member(c.workspace_id)
  )
);
