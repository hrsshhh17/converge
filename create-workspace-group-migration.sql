create or replace function public.create_workspace_group(target_workspace_id uuid, group_name text, member_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path=public as $$
declare new_channel_id uuid; member_id uuid;
begin
  if not exists(select 1 from workspace_members where workspace_id=target_workspace_id and user_id=auth.uid()) then raise exception 'Only workspace members can create groups'; end if;
  if char_length(trim(group_name))<2 then raise exception 'Group name is too short'; end if;
  insert into channels(workspace_id,name,kind,is_workspace_group,created_by) values(target_workspace_id,trim(group_name),'group',false,auth.uid()) returning id into new_channel_id;
  insert into channel_permissions(channel_id) values(new_channel_id) on conflict do nothing;
  insert into channel_members(channel_id,user_id,role) values(new_channel_id,auth.uid(),'admin') on conflict do nothing;
  foreach member_id in array member_ids loop
    if exists(select 1 from workspace_members where workspace_id=target_workspace_id and user_id=member_id) then
      insert into channel_members(channel_id,user_id,role) values(new_channel_id,member_id,'member') on conflict do nothing;
    end if;
  end loop;
  return new_channel_id;
end $$;
grant execute on function public.create_workspace_group(uuid,text,uuid[]) to authenticated;
