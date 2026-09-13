-- Restrict call and meeting Broadcast topics to members of the workspace encoded
-- in the topic. Client channels using these topics must set private: true.

drop policy if exists "workspace members receive call meeting broadcasts" on realtime.messages;
create policy "workspace members receive call meeting broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = (select auth.uid())
      and wm.workspace_id = (
        substring(
          (select realtime.topic())
          from '^(?:call|group-call|workspace-meeting):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?::|$)'
        )
      )::uuid
  )
);

drop policy if exists "workspace members send call meeting broadcasts" on realtime.messages;
create policy "workspace members send call meeting broadcasts"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1
    from public.workspace_members wm
    where wm.user_id = (select auth.uid())
      and wm.workspace_id = (
        substring(
          (select realtime.topic())
          from '^(?:call|group-call|workspace-meeting):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})(?::|$)'
        )
      )::uuid
  )
);
