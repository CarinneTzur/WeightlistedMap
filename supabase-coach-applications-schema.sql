-- Weightlisted accounts and private coach applications.
-- Run this file in the Supabase SQL editor as the project owner.

create extension if not exists pgcrypto;

-- This allowlist is server-side only. The client cannot promote itself to admin.
create schema if not exists private;
revoke all on schema private from public;
create table if not exists private.admin_allowlist (
  email text primary key check (email = lower(email))
);
revoke all on private.admin_allowlist from public;
insert into private.admin_allowlist (email)
values
  ('carinnetz@gmail.com'),
  ('ctzurdecker@outlook.com')
on conflict (email) do nothing;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists updated_at timestamptz,
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists city text,
  add column if not exists gym_name text,
  add column if not exists training_focus text[] not null default '{}',
  add column if not exists training_note text,
  add column if not exists profile_visible boolean not null default true,
  add column if not exists client_enabled boolean not null default true,
  add column if not exists coach_enabled boolean not null default false,
  add column if not exists active_mode text not null default 'client',
  add column if not exists is_admin boolean not null default false;

alter table public.profiles drop constraint if exists profiles_active_mode_check;
alter table public.profiles add constraint profiles_active_mode_check
check (active_mode = 'client' or (active_mode = 'coach' and coach_enabled = true));

update public.profiles
set full_name = coalesce(nullif(full_name, ''), nullif(display_name, ''), '')
where full_name is null;

create table if not exists public.coach_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.coach_applications
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists updated_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists status text not null default 'pending',
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists gym_name text,
  add column if not exists gym_city text,
  add column if not exists gym_state text,
  add column if not exists gym_place_id text,
  add column if not exists gym_address text,
  add column if not exists coach_title text,
  add column if not exists specialties text[] not null default '{}',
  add column if not exists bio text,
  add column if not exists review_statement text,
  add column if not exists lifting_experience text,
  add column if not exists coaching_experience text,
  add column if not exists years_of_experience integer,
  add column if not exists current_roster_size integer,
  add column if not exists online_training boolean not null default false,
  add column if not exists remote_available boolean not null default false,
  add column if not exists in_person_coaching boolean not null default false,
  add column if not exists coaching_formats text[] not null default '{}',
  add column if not exists profile_photo_url text,
  add column if not exists profile_photo_file_name text,
  add column if not exists social_links jsonb not null default '[]'::jsonb,
  add column if not exists certifications text[] not null default '{}',
  add column if not exists interview_booking_url text,
  add column if not exists interview_date_time timestamptz,
  add column if not exists interview_datetime timestamptz,
  add column if not exists interview_required boolean not null default true,
  add column if not exists interview_acknowledged boolean not null default false,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists admin_notes text,
  add column if not exists decline_reason text;

alter table public.coach_applications drop column if exists full_name;
alter table public.coach_applications add column full_name text generated always as (
  trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
) stored;

alter table public.coach_applications drop constraint if exists coach_applications_status_check;
alter table public.coach_applications add constraint coach_applications_status_check
check (status in ('pending', 'approved', 'declined', 'needs_edits'));

alter table public.coach_applications drop constraint if exists coach_applications_coach_title_check;
alter table public.coach_applications add constraint coach_applications_coach_title_check
check (coach_title is null or coach_title in (
  'Powerlifting Coach', 'Bodybuilding Coach', 'Olympic Weightlifting Coach',
  'Strength & Conditioning Coach', 'Hybrid Athlete Coach', 'Nutrition Coach',
  'Personal Trainer'
));

alter table public.coach_applications drop constraint if exists coach_applications_years_check;
alter table public.coach_applications add constraint coach_applications_years_check
check (years_of_experience is null or years_of_experience >= 0);
alter table public.coach_applications drop constraint if exists coach_applications_roster_check;
alter table public.coach_applications add constraint coach_applications_roster_check
check (current_roster_size is null or current_roster_size >= 0);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists set_coach_applications_updated_at on public.coach_applications;
create trigger set_coach_applications_updated_at before update on public.coach_applications
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, email, full_name, display_name, is_admin)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'display_name', ''),
    exists (select 1 from private.admin_allowlist where email = lower(new.email))
  )
  on conflict (user_id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
    display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
    is_admin = public.profiles.is_admin or excluded.is_admin;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (user_id, email, full_name, display_name, is_admin)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'display_name', ''),
  coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'display_name', ''),
  exists (select 1 from private.admin_allowlist where email = lower(auth.users.email))
from auth.users
on conflict (user_id) do update set
  email = excluded.email,
  full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
  display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
  is_admin = public.profiles.is_admin or excluded.is_admin;

update public.profiles
set is_admin = true
where lower(email) in (select email from private.admin_allowlist);

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where user_id = auth.uid() and is_admin = true
  );
$$;
revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

create or replace function public.delete_current_user()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_current_user() from public;
grant execute on function public.delete_current_user() to authenticated;

create index if not exists coach_applications_user_created_idx
on public.coach_applications (user_id, created_at desc);
create index if not exists coach_applications_status_created_idx
on public.coach_applications (status, created_at desc);
create index if not exists coach_applications_full_name_idx
on public.coach_applications (full_name);

alter table public.profiles enable row level security;
alter table public.coach_applications enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles
for select to authenticated using (user_id = auth.uid() or public.current_user_is_admin());
create policy "Users can update their own profile" on public.profiles
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Anyone can submit coach applications" on public.coach_applications;
drop policy if exists "Anyone can view approved coaches" on public.coach_applications;
drop policy if exists "Public can submit pending coach applications" on public.coach_applications;
drop policy if exists "Public can read coach applications for admin portal" on public.coach_applications;
drop policy if exists "Public can review coach applications from admin portal" on public.coach_applications;
drop policy if exists "Applicants can submit their own application" on public.coach_applications;
drop policy if exists "Applicants can read their own applications" on public.coach_applications;
drop policy if exists "Admins can update coach applications" on public.coach_applications;
drop policy if exists "Admins can delete coach applications" on public.coach_applications;

create policy "Applicants can submit their own application" on public.coach_applications
for insert to authenticated with check (
  user_id = auth.uid() and status = 'pending' and reviewed_at is null
  and admin_notes is null and decline_reason is null
);
create policy "Applicants can read their own applications" on public.coach_applications
for select to authenticated using (user_id = auth.uid() or public.current_user_is_admin());
create policy "Admins can update coach applications" on public.coach_applications
for update to authenticated using (public.current_user_is_admin())
with check (public.current_user_is_admin());
create policy "Admins can delete coach applications" on public.coach_applications
for delete to authenticated using (public.current_user_is_admin());

revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
revoke all on public.coach_applications from anon;
grant select on public.profiles to authenticated;
grant update (
  full_name,
  display_name,
  avatar_url,
  city,
  gym_name,
  training_focus,
  training_note,
  profile_visible,
  active_mode
) on public.profiles to authenticated;
grant select, insert, update, delete on public.coach_applications to authenticated;

-- Anonymous visitors see only approved, public coach fields—not applications.
create or replace view public.coach_directory with (security_barrier = true) as
select
  id, created_at, updated_at, status, first_name, last_name, full_name,
  city, state, gym_name, gym_city, gym_state, coach_title, specialties,
  bio, lifting_experience, coaching_experience, years_of_experience,
  current_roster_size, online_training, remote_available, in_person_coaching,
  coaching_formats, profile_photo_url, social_links, certifications,
  latitude, longitude, gym_place_id, gym_address
from public.coach_applications where status = 'approved';
revoke all on public.coach_directory from public;
grant select on public.coach_directory to anon, authenticated;

-- Coaches only need this intentionally shared client profile, never the account row.
create or replace view public.client_directory with (security_barrier = true) as
select
  user_id,
  full_name,
  avatar_url,
  training_focus,
  training_note,
  coach_enabled,
  city,
  gym_name
from public.profiles
where profile_visible = true;
revoke all on public.client_directory from public;
grant select on public.client_directory to authenticated;

insert into storage.buckets (id, name, public) values ('coach-photos', 'coach-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can upload coach application photos" on storage.objects;
drop policy if exists "Public can read coach application photos" on storage.objects;
drop policy if exists "Applicants can upload their own application photos" on storage.objects;
drop policy if exists "Applicants can update their own application photos" on storage.objects;
drop policy if exists "Applicants can delete their own application photos" on storage.objects;
drop policy if exists "Coach photos are publicly readable" on storage.objects;

create policy "Applicants can upload their own application photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'coach-photos' and name like ('applications/' || auth.uid()::text || '/%')
);
create policy "Applicants can update their own application photos" on storage.objects
for update to authenticated using (
  bucket_id = 'coach-photos' and name like ('applications/' || auth.uid()::text || '/%')
) with check (
  bucket_id = 'coach-photos' and name like ('applications/' || auth.uid()::text || '/%')
);
create policy "Applicants can delete their own application photos" on storage.objects
for delete to authenticated using (
  bucket_id = 'coach-photos' and name like ('applications/' || auth.uid()::text || '/%')
);
create policy "Coach photos are publicly readable" on storage.objects
for select to anon, authenticated using (bucket_id = 'coach-photos');

-- Client headshots are a voluntary, coach-visible profile field.
insert into storage.buckets (id, name, public)
values ('client-profile-photos', 'client-profile-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Clients can upload their own profile photos" on storage.objects;
drop policy if exists "Clients can update their own profile photos" on storage.objects;
drop policy if exists "Clients can delete their own profile photos" on storage.objects;
drop policy if exists "Authenticated users can read client profile photos" on storage.objects;

create policy "Clients can upload their own profile photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'client-profile-photos'
  and name like ('clients/' || auth.uid()::text || '/%')
);
create policy "Clients can update their own profile photos" on storage.objects
for update to authenticated using (
  bucket_id = 'client-profile-photos'
  and name like ('clients/' || auth.uid()::text || '/%')
) with check (
  bucket_id = 'client-profile-photos'
  and name like ('clients/' || auth.uid()::text || '/%')
);
create policy "Clients can delete their own profile photos" on storage.objects
for delete to authenticated using (
  bucket_id = 'client-profile-photos'
  and name like ('clients/' || auth.uid()::text || '/%')
);
create policy "Authenticated users can read client profile photos" on storage.objects
for select to authenticated using (bucket_id = 'client-profile-photos');

-- carinnetz@gmail.com is made an administrator by the private allowlist above.
