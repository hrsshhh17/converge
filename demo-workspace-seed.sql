begin;

create temporary table demo_users on commit drop as
select q.rn, q.id, q.email,
  (array['Aanya Sharma','Arjun Mehta','Meera Kapoor','Kabir Singh','Isha Verma','Rohan Desai','Sana Khan','Dev Malhotra','Priya Nair','Vikram Rao','Neha Joshi','Aditya Sen','Tara Iyer','Rahul Bose','Kavya Patel','Nikhil Jain','Diya Roy','Sameer Gupta','Anika Das','Yash Kulkarni'])[q.rn] as full_name,
  (array['Product Lead','Frontend Engineer','Product Designer','Backend Engineer','Growth Strategist','Mobile Engineer','Content Designer','DevOps Engineer','Customer Success','Data Analyst','UX Researcher','QA Engineer','Brand Designer','Finance Lead','Community Manager','Security Engineer','People Operations','Partnerships Lead','Motion Designer','Engineering Intern'])[q.rn] as job_title
from (
  select row_number() over(order by email)::int as rn, id, email
  from auth.users
  where email like 'converge.qa__.20260913@example.com'
) q;

do $$ begin
  if (select count(*) from demo_users) <> 20 then
    raise exception 'Expected exactly 20 Converge demo users';
  end if;
end $$;

update auth.users u
set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', d.full_name)
from demo_users d where d.id=u.id;

update public.profiles p
set full_name=d.full_name, job_title=d.job_title
from demo_users d where d.id=p.id;

insert into public.workspaces(id,name,owner_id,personality,privacy)
select gen_random_uuid(),'Converge Demo Studio','3627c4f4-61d9-4bed-86e7-4ca173767bfa','Creative studio','Invite only'
where not exists (
  select 1 from public.workspaces
  where name='Converge Demo Studio' and owner_id='3627c4f4-61d9-4bed-86e7-4ca173767bfa'
);

create temporary table demo_space on commit drop as
select id from public.workspaces
where name='Converge Demo Studio' and owner_id='3627c4f4-61d9-4bed-86e7-4ca173767bfa'
order by created_at desc limit 1;

insert into public.workspace_members(workspace_id,user_id,role)
select id,'3627c4f4-61d9-4bed-86e7-4ca173767bfa','owner'::public.workspace_role from demo_space
on conflict(workspace_id,user_id) do update set role=excluded.role;

insert into public.channels(id,workspace_id,name,kind,created_by,description,is_workspace_group)
select gen_random_uuid(),id,'Converge Demo Studio','group','3627c4f4-61d9-4bed-86e7-4ca173767bfa',
       'The shared home for everyone exploring the Converge demo.',true
from demo_space
where not exists(select 1 from public.channels c where c.workspace_id=demo_space.id and c.is_workspace_group);

insert into public.workspace_members(workspace_id,user_id,role)
select s.id,d.id,case when d.rn=1 then 'admin'::public.workspace_role else 'member'::public.workspace_role end
from demo_space s cross join demo_users d
on conflict(workspace_id,user_id) do update set role=excluded.role;

update public.workspace_profiles wp
set full_name=d.full_name,
    job_title=d.job_title,
    bio='Demo teammate · '||d.job_title||' · exploring private collaboration in Converge.'
from demo_users d, demo_space s
where wp.workspace_id=s.id and wp.id=d.id;

insert into public.channels(id,workspace_id,name,kind,created_by,description,is_workspace_group)
select gen_random_uuid(),s.id,v.name,'group',d.id,v.description,false
from demo_space s
cross join (values
  ('Product Launch',1,'Planning, decisions and launch-day coordination.'),
  ('Design Studio',3,'Critiques, prototypes and brand explorations.'),
  ('Engineering',8,'Build updates, reviews and technical decisions.'),
  ('Coffee & Culture',7,'Introductions, wins and everything between the work.')
) v(name,creator_rn,description)
join demo_users d on d.rn=v.creator_rn
on conflict(workspace_id,name) do nothing;

create temporary table demo_channels on commit drop as
select c.id,c.name,c.workspace_id,c.is_workspace_group from public.channels c join demo_space s on s.id=c.workspace_id;

insert into public.channel_members(channel_id,user_id,role)
select c.id,d.id,
 case when (c.name='Product Launch' and d.rn=1) or (c.name='Design Studio' and d.rn=3)
        or (c.name='Engineering' and d.rn=8) or (c.name='Coffee & Culture' and d.rn=7)
      then 'admin'::public.group_member_role else 'member'::public.group_member_role end
from demo_channels c cross join demo_users d
where (c.name='Product Launch' and d.rn between 1 and 12)
   or (c.name='Design Studio' and d.rn between 3 and 14)
   or (c.name='Engineering' and d.rn between 8 and 20)
   or (c.name='Coffee & Culture' and (d.rn%2=1 or d.rn in (2,20)))
on conflict(channel_id,user_id) do update set left_at=null,role=excluded.role;

insert into public.channel_messages(workspace_id,channel_id,sender_id,body,message_type,created_at)
select s.id,c.id,d.id,
 case g%10
  when 0 then 'Quick update: the onboarding flow is ready for review.'
  when 1 then 'Morning team! What is everyone focusing on today?'
  when 2 then 'I added the latest customer notes to our launch checklist.'
  when 3 then 'The mobile navigation polish looks much better now 🙌'
  when 4 then 'Can we review the final copy before the afternoon sync?'
  when 5 then 'Analytics are looking healthy—activation improved this week.'
  when 6 then 'I will share a short walkthrough after lunch.'
  when 7 then 'Small accessibility pass complete: focus and labels are updated.'
  when 8 then 'Reminder: demo rehearsal starts tomorrow at 11:00 AM.'
  else 'Nice work everyone. The release board is almost clear!'
 end,
 'text',now()-(46-g)*interval '11 minutes'
from demo_space s
join demo_channels c on c.workspace_id=s.id and c.name='Converge Demo Studio'
cross join generate_series(1,45) g
join demo_users d on d.rn=((g-1)%20)+1;

insert into public.channel_messages(workspace_id,channel_id,sender_id,body,message_type,created_at)
select s.id,c.id,d.id,
 case g%8
  when 0 then 'I pushed the latest changes—ready for a second pair of eyes.'
  when 1 then 'Sharing today’s progress before stand-up.'
  when 2 then 'This direction feels simpler and much easier to explain.'
  when 3 then 'Can someone pick up the open review item?'
  when 4 then 'The customer feedback is now grouped by theme.'
  when 5 then 'Looks good from my side ✅'
  when 6 then 'Let’s capture this decision in the launch notes.'
  else 'I have one small suggestion; adding it in the thread.'
 end,
 'text',now()-(30-g)*interval '17 minutes'
from demo_space s join demo_channels c on c.workspace_id=s.id and not c.is_workspace_group
cross join generate_series(1,24) g
join demo_users d on d.rn=case c.name
 when 'Product Launch' then ((g-1)%12)+1
 when 'Design Studio' then ((g-1)%12)+3
 when 'Engineering' then ((g-1)%13)+8
 else ((g*2-1)%20)+1 end;

insert into public.direct_messages(workspace_id,sender_id,recipient_id,body,message_type,created_at)
select s.id,
 case when g%2=1 then owner.id else partner.id end,
 case when g%2=1 then partner.id else owner.id end,
 case g
  when 1 then 'Hey! Welcome to the demo workspace 👋'
  when 2 then 'Thanks—everything feels really easy to find.'
  when 3 then 'Want to review the launch checklist together?'
  when 4 then 'Sure, I added two notes and tagged the open items.'
  when 5 then 'Perfect. I’ll join the team sync in a few minutes.'
  else 'Sounds good—see you there!'
 end,'text',now()-(8-g)*interval '19 minutes'-(partner.rn*interval '2 minutes')
from demo_space s
join demo_users owner on owner.rn=1
join demo_users partner on partner.rn between 2 and 20
cross join generate_series(1,6) g;

insert into public.direct_messages(workspace_id,sender_id,recipient_id,body,message_type,created_at)
select s.id,a.id,b.id,
 case g when 1 then 'Did you see the new workspace feed?' when 2 then 'Yes—the comments and quick share flow are useful.' else 'Let’s test it together after the meeting.' end,
 'text',now()-(5-g)*interval '23 minutes'-(a.rn*interval '3 minutes')
from demo_space s join demo_users a on a.rn between 2 and 19
join demo_users b on b.rn=a.rn+1 cross join generate_series(1,3) g;

create temporary table demo_posts(seq integer primary key,id uuid not null) on commit drop;
insert into demo_posts select g,gen_random_uuid() from generate_series(1,8) g;

insert into public.posts(id,workspace_id,author_id,body,post_type,attachment_url,attachment_name,poll_options,created_at,updated_at)
select p.id,s.id,d.id,
 case p.seq
  when 1 then 'Welcome to Converge Demo Studio! Explore the feed, messages, groups, calendar, meetings, files and workspace AI.'
  when 2 then 'Launch readiness update: onboarding, workspace privacy and responsive navigation are ready for the demo rehearsal.'
  when 3 then 'Which feature should we showcase first during the product walkthrough?'
  when 4 then 'A small peek at the people behind the demo workspace.'
  when 5 then 'Customer interview notes are organized and ready for the team to discuss.'
  when 6 then 'Weekly win: the team closed every high-priority privacy regression test.'
  when 7 then 'When should we schedule the next demo rehearsal?'
  else 'Design handoff is complete. Please leave final feedback in the comments before tomorrow.'
 end,
 case when p.seq in (3,7) then 'poll' when p.seq=4 then 'media' when p.seq=5 then 'file' else 'update' end,
 case when p.seq=4 then '/team/maya.png' when p.seq=5 then '/file.svg' else null end,
 case when p.seq=4 then 'demo-team.png' when p.seq=5 then 'customer-interview-notes.pdf' else null end,
 case when p.seq=3 then '["Workspace feed","Private chat","Meetings & calls","Converge AI"]'::jsonb
      when p.seq=7 then '["Tomorrow morning","Tomorrow afternoon","Friday morning"]'::jsonb else null end,
 now()-(9-p.seq)*interval '5 hours',now()-(9-p.seq)*interval '5 hours'
from demo_posts p cross join demo_space s join demo_users d on d.rn=((p.seq-1)%8)+1;

insert into public.post_likes(post_id,user_id,created_at)
select p.id,d.id,now()-(d.rn*interval '3 minutes')
from demo_posts p join demo_users d on d.rn<=6+(p.seq%7)
on conflict do nothing;

insert into public.poll_votes(post_id,user_id,option_index)
select p.id,d.id,(d.rn+p.seq)%case when p.seq=3 then 4 else 3 end
from demo_posts p join demo_users d on d.rn<=16 where p.seq in (3,7)
on conflict do nothing;

create temporary table demo_comments(seq integer primary key,id uuid not null,post_seq integer not null) on commit drop;
insert into demo_comments select g,gen_random_uuid(),((g-1)%8)+1 from generate_series(1,24) g;

insert into public.post_comments(id,post_id,author_id,body,created_at)
select c.id,p.id,d.id,
 case c.seq%6 when 0 then 'This is ready to show—clean and easy to understand.'
  when 1 then 'Great update! I added one detail to the shared notes.'
  when 2 then 'The mobile experience is my favourite part of this flow.'
  when 3 then 'Can we include this in tomorrow’s walkthrough?'
  when 4 then 'Tested on my side and everything looks good ✅'
  else 'Love the direction. The workspace feels focused without losing context.' end,
 now()-(25-c.seq)*interval '13 minutes'
from demo_comments c join demo_posts p on p.seq=c.post_seq
join demo_users d on d.rn=((c.seq+2)%20)+1;

insert into public.post_comments(post_id,author_id,body,parent_id,reply_to_id,created_at)
select p.id,d.id,'Agreed—adding it to the final demo checklist now.',c.id,c.id,now()-(9-c.post_seq)*interval '9 minutes'
from demo_comments c join demo_posts p on p.seq=c.post_seq
join demo_users d on d.rn=c.post_seq+10
where c.seq=c.post_seq;

insert into public.comment_likes(comment_id,user_id)
select c.id,d.id from demo_comments c join demo_users d on d.rn in (((c.seq-1)%20)+1,((c.seq+5)%20)+1)
on conflict do nothing;

insert into public.workspace_events(workspace_id,creator_id,title,starts_at,visibility)
select s.id,d.id,v.title,now()+v.offset_value,'workspace'
from demo_space s
cross join (values
 ('Daily product stand-up',interval '1 day'),
 ('Design critique',interval '2 days 3 hours'),
 ('Customer demo rehearsal',interval '3 days 1 hour'),
 ('Launch readiness review',interval '5 days'),
 ('Team retro and wins',interval '8 days 2 hours')
) v(title,offset_value)
join demo_users d on d.rn=1;

insert into public.channel_messages(workspace_id,channel_id,sender_id,body,message_type,attachment_url,attachment_name,created_at)
select s.id,c.id,d.id,'Latest mobile workspace preview','media','/design/converge-landing-reference.png','converge-mobile-preview.png',now()-interval '37 minutes'
from demo_space s join demo_channels c on c.workspace_id=s.id and c.name='Design Studio' join demo_users d on d.rn=3;

insert into public.channel_messages(workspace_id,channel_id,sender_id,body,message_type,attachment_url,attachment_name,created_at)
select s.id,c.id,d.id,'Demo handoff checklist','file','/file.svg','demo-handoff-checklist.pdf',now()-interval '29 minutes'
from demo_space s join demo_channels c on c.workspace_id=s.id and c.name='Product Launch' join demo_users d on d.rn=1;

insert into public.channel_messages(workspace_id,channel_id,sender_id,body,message_type,poll_options,created_at)
select s.id,c.id,d.id,'Pick the first feature for today’s rehearsal','poll','["Feed","Messages","Meeting","AI"]'::jsonb,now()-interval '21 minutes'
from demo_space s join demo_channels c on c.workspace_id=s.id and c.name='Converge Demo Studio' join demo_users d on d.rn=1;

insert into public.channel_messages(workspace_id,channel_id,sender_id,body,message_type,created_at)
select s.id,c.id,d.id,'📣 MEETING REMINDER'||chr(10)||'Converge product walkthrough'||chr(10)||(now()+interval '1 day')::text||chr(10)||'45'||chr(10)||d.full_name||chr(10)||'We will cover feed, private chat, calls, meetings and workspace AI.','text',now()-interval '12 minutes'
from demo_space s join demo_channels c on c.workspace_id=s.id and c.name='Converge Demo Studio' join demo_users d on d.rn=1;

insert into public.direct_messages(workspace_id,sender_id,recipient_id,body,message_type,created_at)
select s.id,a.id,b.id,v.body,'text',now()-v.age
from demo_space s join demo_users a on a.rn=1 join demo_users b on b.rn=2
cross join (values
 ('Voice call • 4:18',interval '8 hours'),
 ('Video call • 12:42',interval '1 day 3 hours')
) v(body,age);

-- These accounts belong to the isolated demo, not the real TechTeam workspace.
delete from public.workspace_members wm
using demo_users d
where wm.workspace_id='0b7465f7-7992-47a7-aa90-0e434c154c48' and wm.user_id=d.id;
delete from public.workspace_profiles wp
using demo_users d
where wp.workspace_id='0b7465f7-7992-47a7-aa90-0e434c154c48' and wp.id=d.id;
delete from public.channel_messages m
using demo_users d
where m.workspace_id='0b7465f7-7992-47a7-aa90-0e434c154c48'
  and m.sender_id=d.id and m.message_type='system'
  and (m.body like '% joined the group' or m.body like '% left the group');

commit;
