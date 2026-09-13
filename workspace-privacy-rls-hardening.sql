-- Keep messages, receipts and calls inside the active member's workspace scope.
drop policy if exists "members read their direct messages" on public.direct_messages;
create policy "members read their direct messages"
on public.direct_messages for select to authenticated
using (
  (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  and public.is_workspace_member(workspace_id)
);

drop policy if exists "members send call signals" on public.call_signals;
create policy "members send call signals"
on public.call_signals for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
  and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = call_signals.workspace_id
      and wm.user_id = call_signals.recipient_id
  )
);

drop policy if exists "recipients read call signals" on public.call_signals;
create policy "recipients read call signals"
on public.call_signals for select to authenticated
using (
  recipient_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
);

drop policy if exists "recipients clear call signals" on public.call_signals;
create policy "recipients clear call signals"
on public.call_signals for delete to authenticated
using (
  recipient_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
);

drop policy if exists "participants read direct receipts" on public.direct_message_receipts;
create policy "participants read direct receipts"
on public.direct_message_receipts for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    recipient_id = (select auth.uid())
    or exists (
      select 1 from public.direct_messages m
      where m.id = direct_message_receipts.message_id
        and m.sender_id = (select auth.uid())
    )
  )
);

drop policy if exists "group participants read message receipts" on public.channel_message_receipts;
create policy "group participants read message receipts"
on public.channel_message_receipts for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    recipient_id = (select auth.uid())
    or exists (
      select 1 from public.channel_messages m
      where m.id = channel_message_receipts.message_id
        and m.sender_id = (select auth.uid())
    )
  )
);
