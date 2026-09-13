-- Run this once in the Supabase SQL editor.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  kind text not null check (kind in ('post_like','post_comment','comment_reply','comment_like','mention')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- A previous version of the project may already have a notifications table.
-- Add the columns needed by this feature before creating indexes and policies.
alter table public.notifications add column if not exists recipient_id uuid references public.profiles(id) on delete cascade;
alter table public.notifications add column if not exists actor_id uuid references public.profiles(id) on delete cascade;
alter table public.notifications add column if not exists post_id uuid references public.posts(id) on delete cascade;
alter table public.notifications add column if not exists comment_id uuid references public.post_comments(id) on delete cascade;
alter table public.notifications add column if not exists kind text;
alter table public.notifications add column if not exists created_at timestamptz not null default now();
alter table public.notifications add column if not exists read_at timestamptz;

create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists "notification recipients read" on public.notifications;
create policy "notification recipients read" on public.notifications for select using (recipient_id = auth.uid());
drop policy if exists "authenticated users create notifications" on public.notifications;
create policy "authenticated users create notifications" on public.notifications for insert with check (actor_id = auth.uid() and recipient_id <> auth.uid());
drop policy if exists "notification recipients mark read" on public.notifications;
create policy "notification recipients mark read" on public.notifications for update using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

alter table public.notifications replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

alter table public.post_comments add column if not exists reply_to_id uuid references public.post_comments(id) on delete set null;

create or replace function public.notify_post_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare post_owner uuid;
begin
  select author_id into post_owner from posts where id = new.post_id;
  if post_owner is not null and post_owner <> new.user_id then
    insert into notifications(recipient_id, actor_id, post_id, kind) values (post_owner, new.user_id, new.post_id, 'post_like');
  end if;
  return new;
end $$;

create or replace function public.notify_comment_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare post_owner uuid; reply_owner uuid; mentioned record;
begin
  select author_id into post_owner from posts where id = new.post_id;
  if new.parent_id is null and post_owner is not null and post_owner <> new.author_id then
    insert into notifications(recipient_id, actor_id, post_id, comment_id, kind) values (post_owner, new.author_id, new.post_id, new.id, 'post_comment');
  elsif new.parent_id is not null and post_owner is not null and post_owner <> new.author_id then
    insert into notifications(recipient_id, actor_id, post_id, comment_id, kind) values (post_owner, new.author_id, new.post_id, new.id, 'post_comment');
  end if;
  if new.reply_to_id is not null then
    select author_id into reply_owner from post_comments where id = new.reply_to_id;
    if reply_owner is not null and reply_owner <> new.author_id and reply_owner <> post_owner then
      insert into notifications(recipient_id, actor_id, post_id, comment_id, kind) values (reply_owner, new.author_id, new.post_id, new.id, 'comment_reply');
    end if;
  end if;
  for mentioned in select id from profiles where id <> new.author_id and position('@' || lower(full_name) in lower(new.body)) > 0 loop
    if mentioned.id <> post_owner and mentioned.id <> reply_owner then
      insert into notifications(recipient_id, actor_id, post_id, comment_id, kind) values (mentioned.id, new.author_id, new.post_id, new.id, 'mention');
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists post_like_notification on public.post_likes;
create trigger post_like_notification after insert on public.post_likes for each row execute function public.notify_post_like();

create or replace function public.notify_comment_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare comment_owner uuid; comment_post uuid;
begin
  select author_id, post_id into comment_owner, comment_post from post_comments where id = new.comment_id;
  if comment_owner is not null and comment_owner <> new.user_id then
    insert into notifications(recipient_id, actor_id, post_id, comment_id, kind) values (comment_owner, new.user_id, comment_post, new.comment_id, 'comment_like');
  end if;
  return new;
end $$;
drop trigger if exists comment_like_notification on public.comment_likes;
create trigger comment_like_notification after insert on public.comment_likes for each row execute function public.notify_comment_like();

drop trigger if exists comment_notification on public.post_comments;
create trigger comment_notification after insert on public.post_comments for each row execute function public.notify_comment_activity();

create or replace function public.notify_post_mentions()
returns trigger language plpgsql security definer set search_path = public as $$
declare mentioned record;
begin
  for mentioned in select id from profiles where id <> new.author_id and position('@' || lower(full_name) in lower(coalesce(new.body, ''))) > 0 loop
    insert into notifications(recipient_id, actor_id, post_id, kind) values (mentioned.id, new.author_id, new.id, 'mention');
  end loop;
  return new;
end $$;
drop trigger if exists post_mention_notification on public.posts;
create trigger post_mention_notification after insert on public.posts for each row execute function public.notify_post_mentions();
