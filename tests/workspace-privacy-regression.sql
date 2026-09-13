-- Multi-user / multi-workspace RLS regression test.
-- Run in the Supabase SQL editor or CI with an administrative database session.
-- The transaction is always rolled back and does not mutate application data.

begin;

create temporary table privacy_fixture on commit drop as
select
  member.user_id as subject_user_id,
  member.workspace_id as allowed_workspace_id,
  target.id as denied_workspace_id
from public.workspace_members as member
cross join public.workspaces as target
where target.id <> member.workspace_id
  and not exists (
    select 1
    from public.workspace_members as denied_membership
    where denied_membership.workspace_id = target.id
      and denied_membership.user_id = member.user_id
  )
order by
  exists(select 1 from public.direct_messages dm where dm.workspace_id = target.id) desc,
  exists(select 1 from public.channel_messages cm where cm.workspace_id = target.id) desc
limit 1;

do $$
begin
  if not exists (select 1 from privacy_fixture) then
    raise exception 'Privacy test needs a user who belongs to one workspace but not another';
  end if;
end;
$$;

grant select on privacy_fixture to authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select subject_user_id from privacy_fixture),
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

do $$
declare
  allowed_id uuid := (select allowed_workspace_id from privacy_fixture);
  denied_id uuid := (select denied_workspace_id from privacy_fixture);
  leak_count bigint;
begin
  select count(*) into leak_count
  from public.workspace_members
  where workspace_id = allowed_id;
  if leak_count = 0 then
    raise exception 'Control failed: authenticated member cannot see their allowed workspace membership';
  end if;

  select count(*) into leak_count
  from public.get_workspace_chat_identities(allowed_id);
  if leak_count = 0 then
    raise exception 'Control failed: identity RPC returned no members for the allowed workspace';
  end if;

  select count(*) into leak_count from public.direct_messages where workspace_id = denied_id;
  if leak_count <> 0 then raise exception 'Direct-message workspace leak: % rows', leak_count; end if;

  select count(*) into leak_count from public.channel_messages where workspace_id = denied_id;
  if leak_count <> 0 then raise exception 'Channel-message workspace leak: % rows', leak_count; end if;

  select count(*) into leak_count from public.notifications where workspace_id = denied_id;
  if leak_count <> 0 then raise exception 'Notification workspace leak: % rows', leak_count; end if;

  select count(*) into leak_count from public.call_signals where workspace_id = denied_id;
  if leak_count <> 0 then raise exception 'Call-signal workspace leak: % rows', leak_count; end if;

  select count(*) into leak_count
  from public.channel_members cm
  join public.channels c on c.id = cm.channel_id
  where c.workspace_id = denied_id;
  if leak_count <> 0 then raise exception 'Group-membership workspace leak: % rows', leak_count; end if;

  select count(*) into leak_count
  from public.get_workspace_chat_identities(denied_id);
  if leak_count <> 0 then raise exception 'Identity RPC workspace leak: % rows', leak_count; end if;
end;
$$;

rollback;
