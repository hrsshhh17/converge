-- Run once in Supabase SQL Editor. Safe to run again.
begin;
alter table public.workspace_profiles add column if not exists bio text;
alter table public.workspace_profiles drop constraint if exists workspace_profiles_bio_length;
alter table public.workspace_profiles add constraint workspace_profiles_bio_length
  check (char_length(coalesce(bio, '')) <= 150);
commit;
