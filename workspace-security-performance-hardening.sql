-- Workspace security and performance hardening. Safe to rerun.
begin;

-- Privileged functions must never inherit PostgreSQL's default PUBLIC execute.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke all on function %s from public, anon', fn.signature);
  end loop;
end $$;

-- This function is an event-trigger implementation, never a client RPC.
revoke all on function public.rls_auto_enable() from authenticated;

-- Add covering indexes for every foreign key that does not already have one.
do $$
declare fk record;
begin
  for fk in
    select
      n.nspname as schema_name,
      t.relname as table_name,
      c.conname,
      string_agg(quote_ident(a.attname), ', ' order by cols.ordinality) as columns_sql
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join lateral unnest(c.conkey) with ordinality as cols(attnum, ordinality) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = cols.attnum
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid and c.conkey <@ (i.indkey::smallint[])
      )
    group by n.nspname, t.relname, c.conname
  loop
    execute format(
      'create index if not exists %I on %I.%I (%s)',
      left(fk.table_name || '_' || fk.conname || '_idx', 63),
      fk.schema_name,
      fk.table_name,
      fk.columns_sql
    );
  end loop;
end $$;

-- Cache auth.uid() once per statement in RLS instead of recalculating per row.
do $$
declare policy_row record;
declare ddl text;
begin
  for policy_row in
    select
      p.polname,
      n.nspname as schema_name,
      c.relname as table_name,
      pg_get_expr(p.polqual, p.polrelid) as using_expression,
      pg_get_expr(p.polwithcheck, p.polrelid) as check_expression
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') like '%auth.uid()%'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') like '%auth.uid()%')
  loop
    ddl := format('alter policy %I on %I.%I', policy_row.polname, policy_row.schema_name, policy_row.table_name);
    if policy_row.using_expression is not null then
      ddl := ddl || ' using (' || replace(policy_row.using_expression, 'auth.uid()', '(select auth.uid())') || ')';
    end if;
    if policy_row.check_expression is not null then
      ddl := ddl || ' with check (' || replace(policy_row.check_expression, 'auth.uid()', '(select auth.uid())') || ')';
    end if;
    execute ddl;
  end loop;
end $$;

commit;

-- Follow-up indexes whose FK column is present, but not leading, in a compound index.
create index if not exists channel_message_poll_votes_user_id_idx on public.channel_message_poll_votes(user_id);
create index if not exists channel_message_receipts_recipient_id_idx on public.channel_message_receipts(recipient_id);
create index if not exists chat_message_hidden_user_id_idx on public.chat_message_hidden(user_id);
create index if not exists chat_message_reactions_user_id_idx on public.chat_message_reactions(user_id);
create index if not exists chat_poll_votes_user_id_idx on public.chat_poll_votes(user_id);
create index if not exists comment_likes_user_id_idx on public.comment_likes(user_id);
create index if not exists direct_chat_blocks_blocked_id_idx on public.direct_chat_blocks(blocked_id);
create index if not exists direct_chat_blocks_user_id_idx on public.direct_chat_blocks(user_id);
create index if not exists direct_messages_recipient_id_idx on public.direct_messages(recipient_id);
create index if not exists poll_votes_user_id_idx on public.poll_votes(user_id);
create index if not exists post_likes_user_id_idx on public.post_likes(user_id);
create index if not exists post_saves_user_id_idx on public.post_saves(user_id);
create index if not exists workspace_ai_conversations_user_id_idx on public.workspace_ai_conversations(user_id);
create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);
create index if not exists workspace_presence_user_id_idx on public.workspace_presence(user_id);

-- Consolidate equivalent permissive policies so each command evaluates once.
drop policy if exists "members manage their chat reactions" on public.chat_message_reactions;
create policy "members add their chat reactions" on public.chat_message_reactions for insert to authenticated
with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy "members update their chat reactions" on public.chat_message_reactions for update to authenticated
using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
create policy "members delete their chat reactions" on public.chat_message_reactions for delete to authenticated
using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

drop policy if exists "notification recipients read" on public.notifications;
drop policy if exists "users read own notifications" on public.notifications;
create policy "users read addressed notifications" on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()) or user_id = (select auth.uid()));
drop policy if exists "notification recipients mark read" on public.notifications;
drop policy if exists "users update own notifications" on public.notifications;
create policy "users update addressed notifications" on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()) or user_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()) or user_id = (select auth.uid()));

drop policy if exists "authors delete own comments" on public.post_comments;
drop policy if exists "post owners can moderate comments" on public.post_comments;
create policy "authors and post owners delete comments" on public.post_comments for delete to authenticated
using (
  author_id = (select auth.uid())
  or exists(select 1 from public.posts p where p.id = post_comments.post_id and p.author_id = (select auth.uid()))
);
