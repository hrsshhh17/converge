-- Run once in Supabase SQL Editor to repair the bell notifications feature.
create table if not exists public.activity_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
alter table public.activity_notifications alter column post_id drop not null;
alter table public.activity_notifications drop constraint if exists activity_notifications_kind_check;
alter table public.activity_notifications add constraint activity_notifications_kind_check check (kind in ('post_like','post_comment','comment_reply','comment_like','mention','group_join'));
create index if not exists activity_notifications_recipient_created_idx on public.activity_notifications(recipient_id, created_at desc);
alter table public.activity_notifications enable row level security;
grant select, update on public.activity_notifications to authenticated;
drop policy if exists "recipients read activity notifications" on public.activity_notifications;
create policy "recipients read activity notifications" on public.activity_notifications for select to authenticated using (recipient_id = auth.uid());
drop policy if exists "recipients update activity notifications" on public.activity_notifications;
create policy "recipients update activity notifications" on public.activity_notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
alter table public.activity_notifications replica identity full;
do $$ begin alter publication supabase_realtime add table public.activity_notifications; exception when duplicate_object then null; end $$;

create or replace function public.notify_post_like() returns trigger language plpgsql security definer set search_path = public as $$
declare post_owner uuid;
begin
  select author_id into post_owner from posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id then
    insert into activity_notifications(recipient_id,actor_id,post_id,kind) values(post_owner,new.user_id,new.post_id,'post_like');
  end if;
  return new;
end $$;

create or replace function public.notify_comment_like() returns trigger language plpgsql security definer set search_path = public as $$
declare comment_owner uuid; comment_post uuid;
begin
  select author_id,post_id into comment_owner,comment_post from post_comments where id=new.comment_id;
  if comment_owner is not null and comment_owner <> new.user_id then
    insert into activity_notifications(recipient_id,actor_id,post_id,comment_id,kind) values(comment_owner,new.user_id,comment_post,new.comment_id,'comment_like');
  end if;
  return new;
end $$;

create or replace function public.notify_comment_activity() returns trigger language plpgsql security definer set search_path = public as $$
declare post_owner uuid; reply_owner uuid; mentioned record;
begin
  select author_id into post_owner from posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.author_id then
    insert into activity_notifications(recipient_id,actor_id,post_id,comment_id,kind) values(post_owner,new.author_id,new.post_id,new.id,'post_comment');
  end if;
  if new.reply_to_id is not null then
    select author_id into reply_owner from post_comments where id = new.reply_to_id;
    if reply_owner is not null and reply_owner <> new.author_id and reply_owner <> post_owner then
      insert into activity_notifications(recipient_id,actor_id,post_id,comment_id,kind) values(reply_owner,new.author_id,new.post_id,new.id,'comment_reply');
    end if;
  end if;
  for mentioned in select id from profiles where id <> new.author_id and position('@' || lower(full_name) in lower(new.body)) > 0 loop
    if mentioned.id <> post_owner and mentioned.id <> reply_owner then
      insert into activity_notifications(recipient_id,actor_id,post_id,comment_id,kind) values(mentioned.id,new.author_id,new.post_id,new.id,'mention');
    end if;
  end loop;
  return new;
end $$;

create or replace function public.notify_post_mentions() returns trigger language plpgsql security definer set search_path = public as $$
declare mentioned record;
begin
  for mentioned in select id from profiles where id <> new.author_id and position('@' || lower(full_name) in lower(coalesce(new.body, ''))) > 0 loop
    insert into activity_notifications(recipient_id,actor_id,post_id,kind) values(mentioned.id,new.author_id,new.id,'mention');
  end loop;
  return new;
end $$;

drop trigger if exists post_like_notification on public.post_likes;
create trigger post_like_notification after insert on public.post_likes for each row execute function public.notify_post_like();
drop trigger if exists comment_notification on public.post_comments;
create trigger comment_notification after insert on public.post_comments for each row execute function public.notify_comment_activity();
drop trigger if exists post_mention_notification on public.posts;
create trigger post_mention_notification after insert on public.posts for each row execute function public.notify_post_mentions();
do $$ begin
  if to_regclass('public.comment_likes') is not null then
    execute 'drop trigger if exists comment_like_notification on public.comment_likes';
    execute 'create trigger comment_like_notification after insert on public.comment_likes for each row execute function public.notify_comment_like()';
  end if;
end $$;
