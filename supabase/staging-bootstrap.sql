-- STAGING ONLY: zimtgpfxddttxytattmd
-- Fresh-project setup. Do not run against production.
-- All changes are one transaction; an error rolls back the setup.
begin;
do $$
begin
 if to_regclass('public.profiles') is not null or to_regclass('public.coach_applications') is not null then
  raise exception 'Fresh staging project required. Existing app tables found; setup stopped.';
 end if;
end;
$$;


-- Source: supabase-coach-applications-schema.sql
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
  ('ctzurdecker@outlook.com'),
  ('getweightlisted@gmail.com')
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
  add column if not exists gym_zip text,
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
  add column if not exists public_name text,
  add column if not exists public_title text,
  add column if not exists profile_visible boolean not null default true,
  add column if not exists accepting_requests boolean not null default true,
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

alter table public.coach_applications drop constraint if exists coach_applications_gym_zip_check;
alter table public.coach_applications add constraint coach_applications_gym_zip_check
check (gym_zip is null or gym_zip ~ '^[0-9]{5}$');

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

create or replace function public.current_user_is_approved_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.coach_applications
    where user_id = auth.uid() and status = 'approved'
  );
$$;
revoke all on function public.current_user_is_approved_coach() from public;
grant execute on function public.current_user_is_approved_coach() to authenticated;

create or replace function public.sync_coach_profile_access()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_user_id uuid;
  approved boolean;
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.user_id is distinct from new.user_id) then
    target_user_id := old.user_id;
    approved := exists (
      select 1 from public.coach_applications
      where user_id = target_user_id and status = 'approved'
    );
    update public.profiles
    set coach_enabled = approved,
        active_mode = case when not approved and active_mode = 'coach' then 'client' else active_mode end
    where user_id = target_user_id;
  end if;

  if tg_op <> 'DELETE' then
    target_user_id := new.user_id;
    approved := exists (
      select 1 from public.coach_applications
      where user_id = target_user_id and status = 'approved'
    );
    update public.profiles
    set coach_enabled = approved,
        active_mode = case when not approved and active_mode = 'coach' then 'client' else active_mode end
    where user_id = target_user_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_coach_profile_access_on_application on public.coach_applications;
create trigger sync_coach_profile_access_on_application
after insert or update of status, user_id or delete on public.coach_applications
for each row execute function public.sync_coach_profile_access();

update public.profiles profile
set coach_enabled = exists (
      select 1 from public.coach_applications application
      where application.user_id = profile.user_id and application.status = 'approved'
    ),
    active_mode = case
      when profile.active_mode = 'coach' and not exists (
        select 1 from public.coach_applications application
        where application.user_id = profile.user_id and application.status = 'approved'
      ) then 'client'
      else profile.active_mode
    end;

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
  id, created_at, updated_at, status, first_name, last_name,
  coalesce(nullif(public_name, ''), full_name) as full_name,
  city, state, gym_name, gym_city, gym_state,
  coalesce(nullif(public_title, ''), coach_title) as coach_title, specialties,
  bio, lifting_experience, coaching_experience, years_of_experience,
  current_roster_size, online_training, remote_available, in_person_coaching,
  coaching_formats, profile_photo_url, social_links, certifications,
  latitude, longitude, gym_place_id, gym_address, profile_visible,
  accepting_requests,
  gym_zip
from public.coach_applications where status = 'approved' and profile_visible = true;
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
  city,
  gym_name
from public.profiles
where profile_visible = true
  and (public.current_user_is_approved_coach() or public.current_user_is_admin());
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

-- Owner accounts in private.admin_allowlist are made administrators above.


-- Source: supabase/migrations/20260822000000_client_matching_preferences.sql
-- Optional client onboarding preferences used to improve future coach ranking.
-- These fields remain private to the account owner and are not coach profile fields.

alter table public.profiles
	add column if not exists matching_preferences jsonb not null default '{}'::jsonb,
	add column if not exists onboarding_completed_at timestamptz,
	add column if not exists onboarding_dismissed_at timestamptz;

comment on column public.profiles.matching_preferences is
	'Private client matching preferences captured by the optional Weightlisted onboarding flow.';
comment on column public.profiles.onboarding_completed_at is
	'Time the optional client matching setup was saved.';
comment on column public.profiles.onboarding_dismissed_at is
	'Time the optional client matching setup was skipped.';


-- Source: supabase/migrations/20260822010000_gym_place_ids.sql
-- Canonical Google Place IDs keep branches with the same gym name distinct.
-- Run this in the Supabase SQL editor after the coach-applications schema.

alter table public.coach_applications
  add column if not exists gym_place_id text,
  add column if not exists gym_address text;

create index if not exists coach_applications_gym_place_id_idx
  on public.coach_applications (gym_place_id)
  where gym_place_id is not null and gym_place_id <> '';

-- The baseline already contains the current coach_directory definition.

-- Source: supabase/migrations/20260822020000_client_profile_location.sql
-- Optional manual client location details while the richer gym-matching flow is paused.
-- These values are shown to authenticated coaches only when the client profile is visible.

alter table public.profiles
  add column if not exists city text,
  add column if not exists gym_name text;

comment on column public.profiles.city is
  'Optional city or city/region shared by a client for coach context.';
comment on column public.profiles.gym_name is
  'Optional manually entered gym name shared by a client for coach context.';

grant update (city, gym_name) on public.profiles to authenticated;

create or replace view public.client_directory with (security_barrier = true) as
select
  user_id,
  full_name,
  avatar_url,
  training_focus,
  training_note,
  city,
  gym_name
from public.profiles
where profile_visible = true
  and (public.current_user_is_approved_coach() or public.current_user_is_admin());

revoke all on public.client_directory from public;
grant select on public.client_directory to authenticated;


-- Source: supabase/migrations/20260914000000_role_access_consistency.sql
-- Keep role capabilities synchronized and restrict coach-visible client data.
-- UI preview modes never participate in these checks; auth.uid() remains the
-- only identity used by backend authorization.

create or replace function public.current_user_is_approved_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.coach_applications
    where user_id = auth.uid() and status = 'approved'
  );
$$;
revoke all on function public.current_user_is_approved_coach() from public;
grant execute on function public.current_user_is_approved_coach() to authenticated;

create or replace function public.sync_coach_profile_access()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_user_id uuid;
  approved boolean;
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.user_id is distinct from new.user_id) then
    target_user_id := old.user_id;
    approved := exists (
      select 1 from public.coach_applications
      where user_id = target_user_id and status = 'approved'
    );
    update public.profiles
    set coach_enabled = approved,
        active_mode = case when not approved and active_mode = 'coach' then 'client' else active_mode end
    where user_id = target_user_id;
  end if;

  if tg_op <> 'DELETE' then
    target_user_id := new.user_id;
    approved := exists (
      select 1 from public.coach_applications
      where user_id = target_user_id and status = 'approved'
    );
    update public.profiles
    set coach_enabled = approved,
        active_mode = case when not approved and active_mode = 'coach' then 'client' else active_mode end
    where user_id = target_user_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_coach_profile_access_on_application on public.coach_applications;
create trigger sync_coach_profile_access_on_application
after insert or update of status, user_id or delete on public.coach_applications
for each row execute function public.sync_coach_profile_access();

update public.profiles profile
set coach_enabled = exists (
      select 1 from public.coach_applications application
      where application.user_id = profile.user_id and application.status = 'approved'
    ),
    active_mode = case
      when profile.active_mode = 'coach' and not exists (
        select 1 from public.coach_applications application
        where application.user_id = profile.user_id and application.status = 'approved'
      ) then 'client'
      else profile.active_mode
    end;

create or replace view public.client_directory with (security_barrier = true) as
select
  user_id,
  full_name,
  avatar_url,
  training_focus,
  training_note,
  city,
  gym_name
from public.profiles
where profile_visible = true
  and (public.current_user_is_approved_coach() or public.current_user_is_admin());

revoke all on public.client_directory from public;
grant select on public.client_directory to authenticated;


-- Source: supabase/migrations/20260923000000_coach_reviews.sql
-- Public coach reviews with private account identity and narrowly scoped writes.
-- Anyone may read. Signed-in users may create, update, or delete their own
-- single review per coach. Approved coaches may edit only their response.

create extension if not exists pgcrypto;

create table if not exists public.coach_reviews (
  id uuid primary key default gen_random_uuid(),
  coach_id text not null,
  reviewer_user_id uuid not null references auth.users(id) on delete cascade,
  reviewer_display_name text not null,
  reviewer_avatar_url text,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1500),
  coach_response text check (coach_response is null or char_length(coach_response) <= 1000),
  coach_responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (coach_id, reviewer_user_id)
);

create index if not exists coach_reviews_coach_updated_idx
on public.coach_reviews (coach_id, updated_at desc);

alter table public.coach_reviews enable row level security;

drop policy if exists "Coach reviews are publicly readable" on public.coach_reviews;
create policy "Coach reviews are publicly readable" on public.coach_reviews
for select to anon, authenticated using (true);

revoke all on public.coach_reviews from public, anon, authenticated;
grant select on public.coach_reviews to anon, authenticated;

create or replace function public.coach_review_public_name(target_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  raw_name text;
  first_name text;
  last_name text;
begin
  select coalesce(
    nullif(trim(profile.full_name), ''),
    nullif(trim(profile.display_name), ''),
    nullif(split_part(account.email, '@', 1), ''),
    'Weightlisted member'
  )
  into raw_name
  from auth.users account
  left join public.profiles profile on profile.user_id = account.id
  where account.id = target_user_id;

  raw_name := coalesce(raw_name, 'Weightlisted member');
  if position('@' in raw_name) > 0 then
    raw_name := split_part(raw_name, '@', 1);
  end if;
  first_name := split_part(raw_name, ' ', 1);
  last_name := regexp_replace(raw_name, '^.*\s+', '');
  if last_name = raw_name or last_name = first_name then
    return first_name;
  end if;
  return first_name || ' ' || upper(left(last_name, 1)) || '.';
end;
$$;

revoke all on function public.coach_review_public_name(uuid) from public;

create or replace function public.submit_coach_review(
  p_coach_id text,
  p_rating integer,
  p_body text default ''
)
returns setof public.coach_reviews
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_coach_id text := trim(coalesce(p_coach_id, ''));
  public_name text;
  public_avatar text;
begin
  if current_user_id is null then
    raise exception 'Sign in before writing a review.';
  end if;
  if normalized_coach_id = '' then
    raise exception 'Coach is required.';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5.';
  end if;
  if char_length(trim(coalesce(p_body, ''))) > 1500 then
    raise exception 'Review is too long.';
  end if;
  if exists (
    select 1 from public.coach_applications
    where id::text = normalized_coach_id and user_id = current_user_id
  ) then
    raise exception 'You cannot review your own coach profile.';
  end if;

  public_name := public.coach_review_public_name(current_user_id);
  select case when profile_visible then nullif(trim(avatar_url), '') else null end
  into public_avatar
  from public.profiles
  where user_id = current_user_id;

  insert into public.coach_reviews (
    coach_id,
    reviewer_user_id,
    reviewer_display_name,
    reviewer_avatar_url,
    rating,
    body
  ) values (
    normalized_coach_id,
    current_user_id,
    public_name,
    public_avatar,
    p_rating,
    trim(coalesce(p_body, ''))
  )
  on conflict (coach_id, reviewer_user_id) do update set
    reviewer_display_name = excluded.reviewer_display_name,
    reviewer_avatar_url = excluded.reviewer_avatar_url,
    rating = excluded.rating,
    body = excluded.body,
    updated_at = now();

  return query
  select * from public.coach_reviews
  where coach_id = normalized_coach_id and reviewer_user_id = current_user_id;
end;
$$;

revoke all on function public.submit_coach_review(text, integer, text) from public;
grant execute on function public.submit_coach_review(text, integer, text) to authenticated;

create or replace function public.delete_my_coach_review(p_coach_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before deleting a review.';
  end if;
  delete from public.coach_reviews
  where coach_id = trim(coalesce(p_coach_id, ''))
    and reviewer_user_id = auth.uid();
end;
$$;

revoke all on function public.delete_my_coach_review(text) from public;
grant execute on function public.delete_my_coach_review(text) to authenticated;

create or replace function public.respond_to_coach_review(
  p_review_id uuid,
  p_response text default ''
)
returns setof public.coach_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  review_coach_id text;
  normalized_response text := trim(coalesce(p_response, ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in before responding to a review.';
  end if;
  if char_length(normalized_response) > 1000 then
    raise exception 'Response is too long.';
  end if;

  select coach_id into review_coach_id
  from public.coach_reviews
  where id = p_review_id;
  if review_coach_id is null then
    raise exception 'Review not found.';
  end if;
  if not exists (
    select 1 from public.coach_applications
    where id::text = review_coach_id
      and user_id = auth.uid()
      and status = 'approved'
  ) then
    raise exception 'Only this coach can respond to the review.';
  end if;

  update public.coach_reviews
  set coach_response = nullif(normalized_response, ''),
      coach_responded_at = case when normalized_response = '' then null else now() end
  where id = p_review_id;

  return query select * from public.coach_reviews where id = p_review_id;
end;
$$;

revoke all on function public.respond_to_coach_review(uuid, text) from public;
grant execute on function public.respond_to_coach_review(uuid, text) to authenticated;


-- Source: supabase/migrations/20261102000000_founder_and_coach_profiles.sql
-- Give the Weightlisted owner durable backend authority and let approved coaches
-- maintain the public portion of their own listing without receiving broad table
-- update permissions.

-- Some existing Weightlisted projects predate the server-side admin allowlist.
-- Create it here as well as in the full base schema so this incremental migration
-- can be safely rerun on those projects.
create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.admin_allowlist (
  email text primary key check (email = lower(email))
);
revoke all on private.admin_allowlist from public;

insert into private.admin_allowlist (email)
values
  ('carinnetz@gmail.com'),
  ('ctzurdecker@outlook.com'),
  ('getweightlisted@gmail.com')
on conflict (email) do nothing;

update public.profiles
set is_admin = true
where lower(email) in (select email from private.admin_allowlist);

alter table public.coach_applications
  add column if not exists public_name text,
  add column if not exists public_title text,
  add column if not exists gym_zip text,
  add column if not exists profile_visible boolean not null default true,
  add column if not exists accepting_requests boolean not null default true;

comment on column public.coach_applications.public_name is
  'Coach-managed display name. The private application name remains unchanged.';
comment on column public.coach_applications.public_title is
  'Coach-managed public title. The reviewed application title remains unchanged.';
comment on column public.coach_applications.profile_visible is
  'Whether an approved coach appears in the public directory.';
comment on column public.coach_applications.accepting_requests is
  'Whether an approved coach is currently open to new coaching and service requests.';

create or replace function public.update_my_coach_public_profile(
  p_application_id uuid,
  p_profile jsonb
)
returns setof public.coach_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.coach_applications;
  next_formats text[];
begin
  if auth.uid() is null then
    raise exception 'Sign in before updating a coach profile.';
  end if;

  select * into target
  from public.coach_applications
  where id = p_application_id
    and user_id = auth.uid()
    and status = 'approved'
  for update;

  if not found then
    raise exception 'An approved coach profile was not found for this account.';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
  into next_formats
  from (
    select distinct left(trim(value), 60) as value
    from jsonb_array_elements_text(coalesce(p_profile -> 'formats', '[]'::jsonb))
    where trim(value) <> ''
    limit 8
  ) formats;

  update public.coach_applications
  set
    public_name = nullif(left(trim(coalesce(p_profile ->> 'fullName', '')), 120), ''),
    public_title = nullif(left(trim(coalesce(p_profile ->> 'title', '')), 120), ''),
    bio = left(trim(coalesce(p_profile ->> 'bio', '')), 2000),
    city = left(trim(coalesce(p_profile ->> 'city', city, '')), 120),
    gym_city = left(trim(coalesce(p_profile ->> 'city', gym_city, '')), 120),
    gym_name = left(trim(coalesce(p_profile ->> 'gymName', gym_name, '')), 180),
    state = nullif(upper(left(trim(coalesce(p_profile ->> 'state', state, '')), 2)), ''),
    gym_state = nullif(upper(left(trim(coalesce(p_profile ->> 'state', gym_state, '')), 2)), ''),
    gym_zip = case when p_profile ? 'zip' then nullif(left(regexp_replace(p_profile ->> 'zip', '[^0-9]', '', 'g'), 5), '') else gym_zip end,
    gym_place_id = case when p_profile ? 'gymPlaceId' then nullif(left(trim(coalesce(p_profile ->> 'gymPlaceId', '')), 255), '') else gym_place_id end,
    gym_address = case when p_profile ? 'gymAddress' then nullif(left(trim(coalesce(p_profile ->> 'gymAddress', '')), 500), '') else gym_address end,
    latitude = case when p_profile ? 'latitude' then nullif(p_profile ->> 'latitude', '')::numeric else latitude end,
    longitude = case when p_profile ? 'longitude' then nullif(p_profile ->> 'longitude', '')::numeric else longitude end,
    specialties = coalesce(
      (
        select array_agg(value)
        from (
          select distinct left(trim(value), 80) as value
          from jsonb_array_elements_text(coalesce(p_profile -> 'specialties', '[]'::jsonb))
          where trim(value) <> ''
          limit 16
        ) specialties
      ),
      '{}'::text[]
    ),
    certifications = coalesce(
      (
        select array_agg(value)
        from (
          select distinct left(trim(value), 120) as value
          from jsonb_array_elements_text(coalesce(p_profile -> 'certifications', '[]'::jsonb))
          where trim(value) <> ''
          limit 20
        ) certifications
      ),
      '{}'::text[]
    ),
    social_links = coalesce(p_profile -> 'socialLinks', '[]'::jsonb),
    coaching_formats = next_formats,
    in_person_coaching = 'In person' = any(next_formats),
    online_training = 'Online' = any(next_formats),
    remote_available = 'Online' = any(next_formats),
    profile_visible = coalesce((p_profile ->> 'visible')::boolean, profile_visible),
    accepting_requests = coalesce((p_profile ->> 'acceptingRequests')::boolean, accepting_requests)
  where id = p_application_id;

  return query
  select * from public.coach_applications where id = p_application_id;
end;
$$;

revoke all on function public.update_my_coach_public_profile(uuid, jsonb) from public;
grant execute on function public.update_my_coach_public_profile(uuid, jsonb) to authenticated;

-- Anonymous visitors receive only approved and currently visible profiles.
create or replace view public.coach_directory with (security_barrier = true) as
select
  id,
  created_at,
  updated_at,
  status,
  first_name,
  last_name,
  coalesce(nullif(public_name, ''), full_name) as full_name,
  city,
  state,
  gym_name,
  gym_city,
  gym_state,
  coalesce(nullif(public_title, ''), coach_title) as coach_title,
  specialties,
  bio,
  lifting_experience,
  coaching_experience,
  years_of_experience,
  current_roster_size,
  online_training,
  remote_available,
  in_person_coaching,
  coaching_formats,
  profile_photo_url,
  social_links,
  certifications,
  latitude,
  longitude,
  gym_place_id,
  gym_address,
  profile_visible,
  accepting_requests,
  gym_zip
from public.coach_applications
where status = 'approved' and profile_visible = true;

revoke all on public.coach_directory from public;
grant select on public.coach_directory to anon, authenticated;


-- Source: supabase/migrations/20261102010000_marketplace_core.sql
-- Durable client/coach marketplace records. The React app keeps a small local
-- cache for instant rendering, but these tables are the shared source of truth.

create extension if not exists pgcrypto;

create table if not exists public.marketplace_conversations (
  id text primary key,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  coach_application_id uuid not null references public.coach_applications(id) on delete cascade,
  relationship_status text not null default 'pending'
    check (relationship_status in ('pending', 'accepted', 'declined')),
  payload jsonb not null default '{}'::jsonb,
  read_by_client_at timestamptz,
  read_by_coach_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_user_id, coach_application_id)
);

create index if not exists marketplace_conversations_client_updated_idx
  on public.marketplace_conversations (client_user_id, updated_at desc);
create index if not exists marketplace_conversations_coach_updated_idx
  on public.marketplace_conversations (coach_application_id, updated_at desc);

create table if not exists public.marketplace_service_requests (
  id text primary key,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  claimed_coach_application_id uuid references public.coach_applications(id) on delete set null,
  request_status text not null default 'awaiting_payment'
    check (request_status in ('awaiting_payment', 'matching', 'claimed', 'completed', 'cancelled', 'refunded')),
  payment_status text not null default 'payment_required'
    check (payment_status in ('payment_required', 'processing', 'paid', 'refunded', 'failed')),
  payout_status text not null default 'not_started'
    check (payout_status in ('not_started', 'held', 'ready', 'paid', 'reversed')),
  price_amount_cents integer check (price_amount_cents is null or price_amount_cents >= 0),
  currency text not null default 'USD',
  payment_reference text,
  passed_by_coach_ids uuid[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  read_by_client_at timestamptz,
  read_by_coach_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_service_requests_client_updated_idx
  on public.marketplace_service_requests (client_user_id, updated_at desc);
create index if not exists marketplace_service_requests_available_idx
  on public.marketplace_service_requests (request_status, payment_status, updated_at desc);
create index if not exists marketplace_service_requests_coach_updated_idx
  on public.marketplace_service_requests (claimed_coach_application_id, updated_at desc)
  where claimed_coach_application_id is not null;

alter table public.marketplace_conversations enable row level security;
alter table public.marketplace_service_requests enable row level security;

drop policy if exists "Conversation participants and admins can read" on public.marketplace_conversations;
create policy "Conversation participants and admins can read"
on public.marketplace_conversations
for select to authenticated
using (
  client_user_id = auth.uid()
  or exists (
    select 1 from public.coach_applications application
    where application.id = coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
      and exists (
        select 1 from public.profiles client_profile
        where client_profile.user_id = client_user_id
          and client_profile.profile_visible = true
      )
  )
  or public.current_user_is_admin()
);

drop policy if exists "Service participants available coaches and admins can read" on public.marketplace_service_requests;
create policy "Service participants available coaches and admins can read"
on public.marketplace_service_requests
for select to authenticated
using (
  client_user_id = auth.uid()
  or public.current_user_is_admin()
  or exists (
    select 1 from public.coach_applications application
    where application.user_id = auth.uid()
      and application.status = 'approved'
      and exists (
        select 1 from public.profiles client_profile
        where client_profile.user_id = client_user_id
          and client_profile.profile_visible = true
      )
      and (
        application.id = claimed_coach_application_id
        or (
          claimed_coach_application_id is null
          and request_status = 'matching'
          and payment_status = 'paid'
          and not (application.id = any(passed_by_coach_ids))
          and application.accepting_requests = true
        )
      )
  )
);

revoke all on public.marketplace_conversations from public, anon, authenticated;
revoke all on public.marketplace_service_requests from public, anon, authenticated;
grant select on public.marketplace_conversations to authenticated;
grant select on public.marketplace_service_requests to authenticated;

create or replace function public.create_or_append_marketplace_conversation(
  p_coach_application_id uuid,
  p_message jsonb,
  p_client_snapshot jsonb default '{}'::jsonb
)
returns setof public.marketplace_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  thread_id text;
  timestamp_value timestamptz := now();
  clean_message jsonb;
  clean_client jsonb;
  coach_record public.coach_applications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in before starting a conversation.';
  end if;

  select * into coach_record
  from public.coach_applications
  where id = p_coach_application_id
    and status = 'approved'
    and profile_visible = true;
  if not found then
    raise exception 'This coach is not currently available.';
  end if;

  thread_id := 'direct-' || auth.uid()::text || '-' || p_coach_application_id::text;
  clean_client := coalesce(p_client_snapshot, '{}'::jsonb)
    || jsonb_build_object('id', auth.uid()::text, 'userId', auth.uid()::text);
  clean_message := jsonb_build_object(
    'id', coalesce(nullif(p_message ->> 'id', ''), gen_random_uuid()::text),
    'sender', 'client',
    'text', left(coalesce(p_message ->> 'text', ''), 5000),
    'attachments', coalesce(p_message -> 'attachments', '[]'::jsonb),
    'createdAt', timestamp_value
  );

  insert into public.marketplace_conversations (
    id,
    client_user_id,
    coach_application_id,
    relationship_status,
    payload,
    read_by_client_at,
    created_at,
    updated_at
  ) values (
    thread_id,
    auth.uid(),
    p_coach_application_id,
    'pending',
    jsonb_build_object(
      'id', thread_id,
      'type', 'direct',
      'coachId', p_coach_application_id::text,
      'coachName', coalesce(nullif(coach_record.public_name, ''), coach_record.full_name),
      'coachTitle', coalesce(nullif(coach_record.public_title, ''), coach_record.coach_title),
      'coachHeadshot', coalesce(coach_record.profile_photo_url, ''),
      'client', clean_client,
      'relationshipStatus', 'pending',
      'relationshipRequestedAt', timestamp_value,
      'createdAt', timestamp_value,
      'updatedAt', timestamp_value,
      'readByClientAt', timestamp_value,
      'readByCoachAt', null,
      'unreadForClient', 0,
      'unreadForCoach', 1,
      'messages', jsonb_build_array(clean_message)
    ),
    timestamp_value,
    timestamp_value,
    timestamp_value
  )
  on conflict (client_user_id, coach_application_id) do update set
    payload = public.marketplace_conversations.payload || jsonb_build_object(
      'messages', coalesce(public.marketplace_conversations.payload -> 'messages', '[]'::jsonb) || jsonb_build_array(clean_message),
      'updatedAt', timestamp_value,
      'readByClientAt', timestamp_value,
      'unreadForCoach', coalesce((public.marketplace_conversations.payload ->> 'unreadForCoach')::integer, 0) + 1
    ),
    read_by_client_at = timestamp_value,
    updated_at = timestamp_value;

  return query select * from public.marketplace_conversations where id = thread_id;
end;
$$;

create or replace function public.append_marketplace_conversation_message(
  p_conversation_id text,
  p_message jsonb
)
returns setof public.marketplace_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_conversations%rowtype;
  sender_role text;
  timestamp_value timestamptz := now();
  clean_message jsonb;
  next_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in before sending a message.'; end if;

  select * into target
  from public.marketplace_conversations
  where id = p_conversation_id
  for update;
  if not found then raise exception 'Conversation not found.'; end if;

  if target.client_user_id = auth.uid() then
    sender_role := 'client';
  elsif exists (
    select 1 from public.coach_applications application
    where application.id = target.coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then
    sender_role := 'coach';
  else
    raise exception 'You do not have access to this conversation.';
  end if;

  clean_message := jsonb_build_object(
    'id', coalesce(nullif(p_message ->> 'id', ''), gen_random_uuid()::text),
    'sender', sender_role,
    'text', left(coalesce(p_message ->> 'text', ''), 5000),
    'attachments', coalesce(p_message -> 'attachments', '[]'::jsonb),
    'createdAt', timestamp_value
  );
  next_payload := target.payload || jsonb_build_object(
    'messages', coalesce(target.payload -> 'messages', '[]'::jsonb) || jsonb_build_array(clean_message),
    'updatedAt', timestamp_value,
    'unreadForCoach', case when sender_role = 'client' then coalesce((target.payload ->> 'unreadForCoach')::integer, 0) + 1 else 0 end,
    'unreadForClient', case when sender_role = 'coach' then coalesce((target.payload ->> 'unreadForClient')::integer, 0) + 1 else coalesce((target.payload ->> 'unreadForClient')::integer, 0) end
  );

  update public.marketplace_conversations
  set payload = next_payload,
      read_by_client_at = case when sender_role = 'client' then timestamp_value else read_by_client_at end,
      read_by_coach_at = case when sender_role = 'coach' then timestamp_value else read_by_coach_at end,
      updated_at = timestamp_value
  where id = p_conversation_id;

  return query select * from public.marketplace_conversations where id = p_conversation_id;
end;
$$;

create or replace function public.set_marketplace_relationship(
  p_conversation_id text,
  p_relationship_status text
)
returns setof public.marketplace_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_conversations%rowtype;
  timestamp_value timestamptz := now();
begin
  if p_relationship_status not in ('pending', 'accepted', 'declined') then
    raise exception 'Choose a valid relationship status.';
  end if;
  select * into target from public.marketplace_conversations where id = p_conversation_id for update;
  if not found then raise exception 'Conversation not found.'; end if;
  if not public.current_user_is_admin() and not exists (
    select 1 from public.coach_applications application
    where application.id = target.coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then
    raise exception 'Only this coach or an administrator can change the client relationship.';
  end if;

  update public.marketplace_conversations
  set relationship_status = p_relationship_status,
      payload = payload || jsonb_build_object(
        'relationshipStatus', p_relationship_status,
        'relationshipUpdatedAt', timestamp_value,
        'updatedAt', timestamp_value,
        'unreadForClient', coalesce((payload ->> 'unreadForClient')::integer, 0) + 1
      ),
      updated_at = timestamp_value
  where id = p_conversation_id;
  return query select * from public.marketplace_conversations where id = p_conversation_id;
end;
$$;

create or replace function public.mark_marketplace_conversation_read(
  p_conversation_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_conversations%rowtype;
  reader_role text;
  timestamp_value timestamptz := now();
begin
  select * into target from public.marketplace_conversations where id = p_conversation_id for update;
  if not found then return; end if;
  if target.client_user_id = auth.uid() then
    reader_role := 'client';
  elsif exists (
    select 1 from public.coach_applications application
    where application.id = target.coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then
    reader_role := 'coach';
  else
    raise exception 'You do not have access to this conversation.';
  end if;

  update public.marketplace_conversations
  set payload = payload || case
        when reader_role = 'client' then jsonb_build_object('unreadForClient', 0, 'readByClientAt', timestamp_value)
        else jsonb_build_object('unreadForCoach', 0, 'readByCoachAt', timestamp_value)
      end,
      read_by_client_at = case when reader_role = 'client' then timestamp_value else read_by_client_at end,
      read_by_coach_at = case when reader_role = 'coach' then timestamp_value else read_by_coach_at end
  where id = p_conversation_id;
end;
$$;

create or replace function public.create_marketplace_service_request(p_request jsonb)
returns setof public.marketplace_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_id text := left(trim(coalesce(p_request ->> 'id', '')), 160);
  timestamp_value timestamptz := now();
  amount_cents integer;
  client_snapshot jsonb;
  clean_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a service request.'; end if;
  if request_id = '' or request_id not like 'service-request-%' then
    raise exception 'A valid service request ID is required.';
  end if;
  begin
    amount_cents := round(coalesce(nullif(p_request #>> '{details,price,amount}', '')::numeric, 0) * 100)::integer;
  exception when others then
    amount_cents := null;
  end;

  client_snapshot := coalesce(p_request -> 'client', '{}'::jsonb)
    || jsonb_build_object('id', auth.uid()::text, 'userId', auth.uid()::text);
  clean_payload := p_request
    || jsonb_build_object(
      'id', request_id,
      'client', client_snapshot,
      'requestStatus', 'awaiting_payment',
      'paymentStatus', 'payment_required',
      'payoutStatus', 'not_started',
      'availabilityStatus', 'payment_pending',
      'claimedBy', null,
      'passedByCoachIds', '[]'::jsonb,
      'createdAt', timestamp_value,
      'updatedAt', timestamp_value
    );

  insert into public.marketplace_service_requests (
    id,
    client_user_id,
    request_status,
    payment_status,
    payout_status,
    price_amount_cents,
    currency,
    payload,
    read_by_client_at,
    created_at,
    updated_at
  ) values (
    request_id,
    auth.uid(),
    'awaiting_payment',
    'payment_required',
    'not_started',
    amount_cents,
    upper(left(coalesce(p_request #>> '{details,price,currency}', 'USD'), 3)),
    clean_payload,
    timestamp_value,
    timestamp_value,
    timestamp_value
  );

  return query select * from public.marketplace_service_requests where id = request_id;
end;
$$;

create or replace function public.mark_marketplace_service_request_paid(
  p_request_id text,
  p_payment_reference text default null
)
returns setof public.marketplace_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  timestamp_value timestamptz := now();
begin
  if not public.current_user_is_admin() then
    raise exception 'Administrator access is required.';
  end if;
  update public.marketplace_service_requests
  set request_status = 'matching',
      payment_status = 'paid',
      payout_status = 'held',
      payment_reference = nullif(left(trim(coalesce(p_payment_reference, '')), 250), ''),
      payload = payload || jsonb_build_object(
        'requestStatus', 'matching',
        'paymentStatus', 'paid',
        'payoutStatus', 'held',
        'availabilityStatus', 'open',
        'updatedAt', timestamp_value
      ),
      updated_at = timestamp_value
  where id = p_request_id and request_status = 'awaiting_payment';
  if not found then raise exception 'An awaiting-payment request was not found.'; end if;
  return query select * from public.marketplace_service_requests where id = p_request_id;
end;
$$;

create or replace function public.claim_marketplace_service_request(
  p_request_id text,
  p_coach_application_id uuid
)
returns setof public.marketplace_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_service_requests%rowtype;
  coach_record public.coach_applications%rowtype;
  timestamp_value timestamptz := now();
  coach_snapshot jsonb;
begin
  select * into coach_record
  from public.coach_applications
  where id = p_coach_application_id
    and user_id = auth.uid()
    and status = 'approved'
    and accepting_requests = true;
  if not found then raise exception 'Approved coach access is required.'; end if;

  select * into target
  from public.marketplace_service_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'This request is no longer available.'; end if;
  if target.request_status <> 'matching' or target.payment_status <> 'paid' or target.claimed_coach_application_id is not null then
    raise exception 'Another coach accepted this request or payment is not complete.';
  end if;
  if p_coach_application_id = any(target.passed_by_coach_ids) then
    raise exception 'This request was already passed.';
  end if;

  coach_snapshot := jsonb_build_object(
    'id', coach_record.id::text,
    'name', coalesce(nullif(coach_record.public_name, ''), coach_record.full_name),
    'title', coalesce(nullif(coach_record.public_title, ''), coach_record.coach_title),
    'avatarUrl', coalesce(coach_record.profile_photo_url, '')
  );
  update public.marketplace_service_requests
  set claimed_coach_application_id = p_coach_application_id,
      request_status = 'claimed',
      claimed_at = timestamp_value,
      payload = payload || jsonb_build_object(
        'claimedBy', coach_snapshot,
        'claimedAt', timestamp_value,
        'requestStatus', 'claimed',
        'availabilityStatus', 'claimed',
        'updatedAt', timestamp_value
      ),
      updated_at = timestamp_value
  where id = p_request_id;
  return query select * from public.marketplace_service_requests where id = p_request_id;
end;
$$;

create or replace function public.pass_marketplace_service_request(
  p_request_id text,
  p_coach_application_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_ids uuid[];
begin
  if not exists (
    select 1 from public.coach_applications application
    where application.id = p_coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then raise exception 'Approved coach access is required.'; end if;

  update public.marketplace_service_requests
  set passed_by_coach_ids = array_append(passed_by_coach_ids, p_coach_application_id),
      updated_at = now()
  where id = p_request_id
    and request_status = 'matching'
    and payment_status = 'paid'
    and not (p_coach_application_id = any(passed_by_coach_ids))
  returning passed_by_coach_ids into next_ids;
  if next_ids is not null then
    update public.marketplace_service_requests
    set payload = payload || jsonb_build_object(
      'passedByCoachIds', to_jsonb(next_ids),
      'updatedAt', updated_at
    ) where id = p_request_id;
  end if;
end;
$$;

create or replace function public.append_marketplace_service_message(
  p_request_id text,
  p_message jsonb
)
returns setof public.marketplace_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_service_requests%rowtype;
  sender_role text;
  timestamp_value timestamptz := now();
  clean_message jsonb;
begin
  select * into target from public.marketplace_service_requests where id = p_request_id for update;
  if not found then raise exception 'Service request not found.'; end if;
  if target.client_user_id = auth.uid() then
    sender_role := 'client';
  elsif target.claimed_coach_application_id is not null and exists (
    select 1 from public.coach_applications application
    where application.id = target.claimed_coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then
    sender_role := 'coach';
  else
    raise exception 'You do not have access to this service request.';
  end if;

  clean_message := jsonb_build_object(
    'id', coalesce(nullif(p_message ->> 'id', ''), gen_random_uuid()::text),
    'sender', sender_role,
    'text', left(coalesce(p_message ->> 'text', ''), 5000),
    'attachments', coalesce(p_message -> 'attachments', '[]'::jsonb),
    'createdAt', timestamp_value
  );
  update public.marketplace_service_requests
  set payload = payload || jsonb_build_object(
        'messages', coalesce(payload -> 'messages', '[]'::jsonb) || jsonb_build_array(clean_message),
        'updatedAt', timestamp_value,
        'unreadForCoach', case when sender_role = 'client' then coalesce((payload ->> 'unreadForCoach')::integer, 0) + 1 else 0 end,
        'unreadForClient', case when sender_role = 'coach' then coalesce((payload ->> 'unreadForClient')::integer, 0) + 1 else coalesce((payload ->> 'unreadForClient')::integer, 0) end
      ),
      read_by_client_at = case when sender_role = 'client' then timestamp_value else read_by_client_at end,
      read_by_coach_at = case when sender_role = 'coach' then timestamp_value else read_by_coach_at end,
      updated_at = timestamp_value
  where id = p_request_id;
  return query select * from public.marketplace_service_requests where id = p_request_id;
end;
$$;

create or replace function public.update_marketplace_service_request(
  p_request_id text,
  p_patch jsonb
)
returns setof public.marketplace_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_service_requests%rowtype;
  timestamp_value timestamptz := now();
  next_status text;
  next_details jsonb;
begin
  select * into target from public.marketplace_service_requests where id = p_request_id for update;
  if not found then raise exception 'Service request not found.'; end if;
  if not public.current_user_is_admin() and not exists (
    select 1 from public.coach_applications application
    where application.id = target.claimed_coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then raise exception 'Only the assigned coach or an administrator can update this request.'; end if;

  next_status := coalesce(nullif(p_patch ->> 'requestStatus', ''), target.request_status);
  if next_status not in (target.request_status, 'completed') then
    raise exception 'This request status transition is not allowed.';
  end if;
  next_details := coalesce(target.payload -> 'details', '{}'::jsonb) || coalesce(p_patch -> 'details', '{}'::jsonb);

  update public.marketplace_service_requests
  set request_status = next_status,
      completed_at = case when next_status = 'completed' then timestamp_value else completed_at end,
      payload = payload || jsonb_build_object(
        'details', next_details,
        'requestStatus', next_status,
        'availabilityStatus', case when next_status = 'completed' then 'closed' else coalesce(p_patch ->> 'availabilityStatus', payload ->> 'availabilityStatus') end,
        'updatedAt', timestamp_value
      ),
      updated_at = timestamp_value
  where id = p_request_id;
  return query select * from public.marketplace_service_requests where id = p_request_id;
end;
$$;

create or replace function public.mark_marketplace_service_request_read(p_request_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_service_requests%rowtype;
  reader_role text;
  timestamp_value timestamptz := now();
begin
  select * into target from public.marketplace_service_requests where id = p_request_id for update;
  if not found then return; end if;
  if target.client_user_id = auth.uid() then
    reader_role := 'client';
  elsif target.claimed_coach_application_id is not null and exists (
    select 1 from public.coach_applications application
    where application.id = target.claimed_coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then
    reader_role := 'coach';
  else
    raise exception 'You do not have access to this service request.';
  end if;

  update public.marketplace_service_requests
  set payload = payload || case
        when reader_role = 'client' then jsonb_build_object('unreadForClient', 0, 'readByClientAt', timestamp_value)
        else jsonb_build_object('unreadForCoach', 0, 'readByCoachAt', timestamp_value)
      end,
      read_by_client_at = case when reader_role = 'client' then timestamp_value else read_by_client_at end,
      read_by_coach_at = case when reader_role = 'coach' then timestamp_value else read_by_coach_at end
  where id = p_request_id;
end;
$$;

revoke all on function public.create_or_append_marketplace_conversation(uuid, jsonb, jsonb) from public;
revoke all on function public.append_marketplace_conversation_message(text, jsonb) from public;
revoke all on function public.set_marketplace_relationship(text, text) from public;
revoke all on function public.mark_marketplace_conversation_read(text) from public;
revoke all on function public.create_marketplace_service_request(jsonb) from public;
revoke all on function public.mark_marketplace_service_request_paid(text, text) from public;
revoke all on function public.claim_marketplace_service_request(text, uuid) from public;
revoke all on function public.pass_marketplace_service_request(text, uuid) from public;
revoke all on function public.append_marketplace_service_message(text, jsonb) from public;
revoke all on function public.update_marketplace_service_request(text, jsonb) from public;
revoke all on function public.mark_marketplace_service_request_read(text) from public;

grant execute on function public.create_or_append_marketplace_conversation(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.append_marketplace_conversation_message(text, jsonb) to authenticated;
grant execute on function public.set_marketplace_relationship(text, text) to authenticated;
grant execute on function public.mark_marketplace_conversation_read(text) to authenticated;
grant execute on function public.create_marketplace_service_request(jsonb) to authenticated;
grant execute on function public.mark_marketplace_service_request_paid(text, text) to authenticated;
grant execute on function public.claim_marketplace_service_request(text, uuid) to authenticated;
grant execute on function public.pass_marketplace_service_request(text, uuid) to authenticated;
grant execute on function public.append_marketplace_service_message(text, jsonb) to authenticated;
grant execute on function public.update_marketplace_service_request(text, jsonb) to authenticated;
grant execute on function public.mark_marketplace_service_request_read(text) to authenticated;

-- Include the marketplace tables in Supabase Realtime when available. Duplicate
-- additions are ignored so the migration remains safe to re-run during setup.
do $$
begin
  begin
    alter publication supabase_realtime add table public.marketplace_conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.marketplace_service_requests;
  exception when duplicate_object then null;
  end;
end;
$$;


-- Source: supabase/migrations/20261102020000_coach_profile_exact_location.sql
-- Let approved coaches maintain an exact gym map point from their public profile.
-- Existing applications and coordinates are preserved unless the coach submits a
-- replacement value. Run after 20261102000000_founder_and_coach_profiles.sql.

alter table public.coach_applications
  add column if not exists gym_zip text;

create or replace function public.update_my_coach_public_profile(
  p_application_id uuid,
  p_profile jsonb
)
returns setof public.coach_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.coach_applications;
  next_formats text[];
begin
  if auth.uid() is null then
    raise exception 'Sign in before updating a coach profile.';
  end if;

  select * into target
  from public.coach_applications
  where id = p_application_id
    and user_id = auth.uid()
    and status = 'approved'
  for update;

  if not found then
    raise exception 'An approved coach profile was not found for this account.';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
  into next_formats
  from (
    select distinct left(trim(value), 60) as value
    from jsonb_array_elements_text(coalesce(p_profile -> 'formats', '[]'::jsonb))
    where trim(value) <> ''
    limit 8
  ) formats;

  update public.coach_applications
  set
    public_name = nullif(left(trim(coalesce(p_profile ->> 'fullName', '')), 120), ''),
    public_title = nullif(left(trim(coalesce(p_profile ->> 'title', '')), 120), ''),
    bio = left(trim(coalesce(p_profile ->> 'bio', '')), 2000),
    city = left(trim(coalesce(p_profile ->> 'city', city, '')), 120),
    gym_city = left(trim(coalesce(p_profile ->> 'city', gym_city, '')), 120),
    gym_name = left(trim(coalesce(p_profile ->> 'gymName', gym_name, '')), 180),
    state = nullif(upper(left(trim(coalesce(p_profile ->> 'state', state, '')), 2)), ''),
    gym_state = nullif(upper(left(trim(coalesce(p_profile ->> 'state', gym_state, '')), 2)), ''),
    gym_zip = case when p_profile ? 'zip' then nullif(left(regexp_replace(p_profile ->> 'zip', '[^0-9]', '', 'g'), 5), '') else gym_zip end,
    gym_place_id = case when p_profile ? 'gymPlaceId' then nullif(left(trim(coalesce(p_profile ->> 'gymPlaceId', '')), 255), '') else gym_place_id end,
    gym_address = case when p_profile ? 'gymAddress' then nullif(left(trim(coalesce(p_profile ->> 'gymAddress', '')), 500), '') else gym_address end,
    latitude = case when p_profile ? 'latitude' then nullif(p_profile ->> 'latitude', '')::numeric else latitude end,
    longitude = case when p_profile ? 'longitude' then nullif(p_profile ->> 'longitude', '')::numeric else longitude end,
    specialties = coalesce(
      (
        select array_agg(value)
        from (
          select distinct left(trim(value), 80) as value
          from jsonb_array_elements_text(coalesce(p_profile -> 'specialties', '[]'::jsonb))
          where trim(value) <> ''
          limit 16
        ) specialties
      ),
      '{}'::text[]
    ),
    certifications = coalesce(
      (
        select array_agg(value)
        from (
          select distinct left(trim(value), 120) as value
          from jsonb_array_elements_text(coalesce(p_profile -> 'certifications', '[]'::jsonb))
          where trim(value) <> ''
          limit 20
        ) certifications
      ),
      '{}'::text[]
    ),
    social_links = coalesce(p_profile -> 'socialLinks', '[]'::jsonb),
    coaching_formats = next_formats,
    in_person_coaching = 'In person' = any(next_formats),
    online_training = 'Online' = any(next_formats),
    remote_available = 'Online' = any(next_formats),
    profile_visible = coalesce((p_profile ->> 'visible')::boolean, profile_visible),
    accepting_requests = coalesce((p_profile ->> 'acceptingRequests')::boolean, accepting_requests)
  where id = p_application_id;

  return query
  select * from public.coach_applications where id = p_application_id;
end;
$$;

revoke all on function public.update_my_coach_public_profile(uuid, jsonb) from public;
grant execute on function public.update_my_coach_public_profile(uuid, jsonb) to authenticated;


-- Source: supabase/migrations/20261102030000_coach_gym_zip.sql
-- Add a searchable five-digit ZIP to coach gym locations without requiring a
-- public street address. Exact map placement continues to use latitude and
-- longitude. Safe for existing applications: old rows remain NULL.

alter table public.coach_applications
  add column if not exists gym_zip text;

update public.coach_applications
set gym_zip = nullif(left(regexp_replace(gym_zip, '[^0-9]', '', 'g'), 5), '')
where gym_zip is not null;

alter table public.coach_applications
  drop constraint if exists coach_applications_gym_zip_check;
alter table public.coach_applications
  add constraint coach_applications_gym_zip_check
  check (gym_zip is null or gym_zip ~ '^[0-9]{5}$');

create or replace function public.update_my_coach_public_profile(
  p_application_id uuid,
  p_profile jsonb
)
returns setof public.coach_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.coach_applications;
  next_formats text[];
begin
  if auth.uid() is null then
    raise exception 'Sign in before updating a coach profile.';
  end if;

  select * into target
  from public.coach_applications
  where id = p_application_id
    and user_id = auth.uid()
    and status = 'approved'
  for update;

  if not found then
    raise exception 'An approved coach profile was not found for this account.';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
  into next_formats
  from (
    select distinct left(trim(value), 60) as value
    from jsonb_array_elements_text(coalesce(p_profile -> 'formats', '[]'::jsonb))
    where trim(value) <> ''
    limit 8
  ) formats;

  update public.coach_applications
  set
    public_name = nullif(left(trim(coalesce(p_profile ->> 'fullName', '')), 120), ''),
    public_title = nullif(left(trim(coalesce(p_profile ->> 'title', '')), 120), ''),
    bio = left(trim(coalesce(p_profile ->> 'bio', '')), 2000),
    city = left(trim(coalesce(p_profile ->> 'city', city, '')), 120),
    gym_city = left(trim(coalesce(p_profile ->> 'city', gym_city, '')), 120),
    gym_name = left(trim(coalesce(p_profile ->> 'gymName', gym_name, '')), 180),
    state = nullif(upper(left(trim(coalesce(p_profile ->> 'state', state, '')), 2)), ''),
    gym_state = nullif(upper(left(trim(coalesce(p_profile ->> 'state', gym_state, '')), 2)), ''),
    gym_zip = case when p_profile ? 'zip' then nullif(left(regexp_replace(p_profile ->> 'zip', '[^0-9]', '', 'g'), 5), '') else gym_zip end,
    gym_place_id = case when p_profile ? 'gymPlaceId' then nullif(left(trim(coalesce(p_profile ->> 'gymPlaceId', '')), 255), '') else gym_place_id end,
    gym_address = case when p_profile ? 'gymAddress' then nullif(left(trim(coalesce(p_profile ->> 'gymAddress', '')), 500), '') else gym_address end,
    latitude = case when p_profile ? 'latitude' then nullif(p_profile ->> 'latitude', '')::numeric else latitude end,
    longitude = case when p_profile ? 'longitude' then nullif(p_profile ->> 'longitude', '')::numeric else longitude end,
    specialties = coalesce(
      (
        select array_agg(value)
        from (
          select distinct left(trim(value), 80) as value
          from jsonb_array_elements_text(coalesce(p_profile -> 'specialties', '[]'::jsonb))
          where trim(value) <> ''
          limit 16
        ) specialties
      ),
      '{}'::text[]
    ),
    certifications = coalesce(
      (
        select array_agg(value)
        from (
          select distinct left(trim(value), 120) as value
          from jsonb_array_elements_text(coalesce(p_profile -> 'certifications', '[]'::jsonb))
          where trim(value) <> ''
          limit 20
        ) certifications
      ),
      '{}'::text[]
    ),
    social_links = coalesce(p_profile -> 'socialLinks', '[]'::jsonb),
    coaching_formats = next_formats,
    in_person_coaching = 'In person' = any(next_formats),
    online_training = 'Online' = any(next_formats),
    remote_available = 'Online' = any(next_formats),
    profile_visible = coalesce((p_profile ->> 'visible')::boolean, profile_visible),
    accepting_requests = coalesce((p_profile ->> 'acceptingRequests')::boolean, accepting_requests)
  where id = p_application_id;

  return query
  select * from public.coach_applications where id = p_application_id;
end;
$$;

revoke all on function public.update_my_coach_public_profile(uuid, jsonb) from public;
grant execute on function public.update_my_coach_public_profile(uuid, jsonb) to authenticated;

create or replace view public.coach_directory with (security_barrier = true) as
select
  id,
  created_at,
  updated_at,
  status,
  first_name,
  last_name,
  coalesce(nullif(public_name, ''), full_name) as full_name,
  city,
  state,
  gym_name,
  gym_city,
  gym_state,
  coalesce(nullif(public_title, ''), coach_title) as coach_title,
  specialties,
  bio,
  lifting_experience,
  coaching_experience,
  years_of_experience,
  current_roster_size,
  online_training,
  remote_available,
  in_person_coaching,
  coaching_formats,
  profile_photo_url,
  social_links,
  certifications,
  latitude,
  longitude,
  gym_place_id,
  gym_address,
  profile_visible,
  accepting_requests,
  gym_zip
from public.coach_applications
where status = 'approved' and profile_visible = true;

revoke all on public.coach_directory from public;
grant select on public.coach_directory to anon, authenticated;


-- Source: supabase/migrations/20261102040000_review_reply_threads.sql
-- Make the coach's first public review response immutable and allow the coach
-- and original reviewer to continue with append-only, visibly nested replies.

create extension if not exists pgcrypto;

create table if not exists public.coach_review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.coach_reviews(id) on delete cascade,
  parent_reply_id uuid references public.coach_review_replies(id) on delete restrict,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_role text not null check (author_role in ('reviewer', 'coach')),
  author_display_name text not null,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists coach_review_replies_review_created_idx
on public.coach_review_replies (review_id, created_at);

alter table public.coach_review_replies enable row level security;
revoke all on public.coach_review_replies from public, anon, authenticated;

create or replace view public.coach_review_replies_public with (security_barrier = true) as
select
  id,
  review_id,
  parent_reply_id,
  author_role,
  author_display_name,
  body,
  created_at
from public.coach_review_replies;

revoke all on public.coach_review_replies_public from public;
grant select on public.coach_review_replies_public to anon, authenticated;

create or replace function public.respond_to_coach_review(
  p_review_id uuid,
  p_response text default ''
)
returns setof public.coach_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  target_review public.coach_reviews;
  normalized_response text := trim(coalesce(p_response, ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in before responding to a review.';
  end if;
  if normalized_response = '' then
    raise exception 'Write a response before posting.';
  end if;
  if char_length(normalized_response) > 1000 then
    raise exception 'Response is too long.';
  end if;

  select * into target_review
  from public.coach_reviews
  where id = p_review_id
  for update;

  if not found then
    raise exception 'Review not found.';
  end if;
  if not exists (
    select 1 from public.coach_applications
    where id::text = target_review.coach_id
      and user_id = auth.uid()
      and status = 'approved'
  ) then
    raise exception 'Only this coach can respond to the review.';
  end if;
  if nullif(trim(target_review.coach_response), '') is not null then
    raise exception 'Your response has already been posted and cannot be edited.';
  end if;

  update public.coach_reviews
  set coach_response = normalized_response,
      coach_responded_at = now(),
      updated_at = now()
  where id = p_review_id;

  return query select * from public.coach_reviews where id = p_review_id;
end;
$$;

revoke all on function public.respond_to_coach_review(uuid, text) from public;
grant execute on function public.respond_to_coach_review(uuid, text) to authenticated;

create or replace function public.add_coach_review_reply(
  p_review_id uuid,
  p_parent_reply_id uuid default null,
  p_body text default ''
)
returns setof public.coach_review_replies
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_review public.coach_reviews;
  parent_reply public.coach_review_replies;
  next_role text;
  next_display_name text;
  normalized_body text := trim(coalesce(p_body, ''));
  inserted_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before replying.';
  end if;
  if normalized_body = '' then
    raise exception 'Write a reply before posting.';
  end if;
  if char_length(normalized_body) > 1000 then
    raise exception 'Reply is too long.';
  end if;

  select * into target_review
  from public.coach_reviews
  where id = p_review_id;
  if not found then
    raise exception 'Review not found.';
  end if;

  if target_review.reviewer_user_id = current_user_id then
    next_role := 'reviewer';
    next_display_name := target_review.reviewer_display_name;
  elsif exists (
    select 1 from public.coach_applications
    where id::text = target_review.coach_id
      and user_id = current_user_id
      and status = 'approved'
  ) then
    next_role := 'coach';
    select coalesce(nullif(trim(public_name), ''), nullif(trim(full_name), ''), 'Coach')
    into next_display_name
    from public.coach_applications
    where id::text = target_review.coach_id;
  else
    raise exception 'Only this coach and the original reviewer can reply.';
  end if;

  if p_parent_reply_id is null then
    if next_role <> 'reviewer' or nullif(trim(target_review.coach_response), '') is null then
      raise exception 'The reviewer can reply after the coach posts a response.';
    end if;
  else
    select * into parent_reply
    from public.coach_review_replies
    where id = p_parent_reply_id
      and review_id = p_review_id;
    if not found then
      raise exception 'The reply being answered was not found.';
    end if;
    if parent_reply.author_role = next_role then
      raise exception 'Wait for the other person before replying again.';
    end if;
  end if;

  insert into public.coach_review_replies (
    review_id,
    parent_reply_id,
    author_user_id,
    author_role,
    author_display_name,
    body
  ) values (
    p_review_id,
    p_parent_reply_id,
    current_user_id,
    next_role,
    next_display_name,
    normalized_body
  ) returning id into inserted_id;

  return query
  select * from public.coach_review_replies where id = inserted_id;
end;
$$;

revoke all on function public.add_coach_review_reply(uuid, uuid, text) from public;
grant execute on function public.add_coach_review_reply(uuid, uuid, text) to authenticated;


-- Source: supabase/migrations/20261121000000_marketplace_privacy_guards.sql

create or replace function public.guard_marketplace_privacy()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare visible boolean;
begin
  if auth.uid() is null then raise exception 'Sign in before changing marketplace records.'; end if;
  if public.current_user_is_admin() then return new; end if;
  -- Safety controls remain available even when a client hides their profile.
  if tg_table_name = 'marketplace_conversations' and tg_op = 'UPDATE' then
    if new.client_user_id = auth.uid()
       and (to_jsonb(new) - 'blocked_by_client') = (to_jsonb(old) - 'blocked_by_client') then
      return new;
    end if;
  end if;
  select profile_visible into visible from public.profiles where user_id = new.client_user_id;
  if visible is distinct from true then
    raise exception 'This client profile is hidden. Marketplace changes are unavailable.';
  end if;
  if tg_table_name = 'marketplace_conversations' and tg_op = 'UPDATE' then
    if to_jsonb(old)->>'relationship_status' = 'declined'
       and new.payload->'messages' is distinct from old.payload->'messages' then
      raise exception 'This coaching request is closed.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_marketplace_privacy() from public;
drop trigger if exists guard_marketplace_conversation_privacy on public.marketplace_conversations;
create trigger guard_marketplace_conversation_privacy before insert or update
on public.marketplace_conversations for each row execute function public.guard_marketplace_privacy();
drop trigger if exists guard_marketplace_service_privacy on public.marketplace_service_requests;
create trigger guard_marketplace_service_privacy before insert or update
on public.marketplace_service_requests for each row execute function public.guard_marketplace_privacy();


-- Source: supabase/migrations/20261121010000_server_service_prices.sql
-- Prices are selected from an administrator-controlled catalog, not browser amounts.

create table if not exists public.marketplace_service_prices (
 category text not null,
 request_type text not null,
 duration text not null default '',
 price_id text not null,
 amount_cents integer not null check (amount_cents > 0),
 primary key(category, request_type, duration)
);
alter table public.marketplace_service_prices enable row level security;
revoke all on public.marketplace_service_prices from public, anon, authenticated;
grant select on public.marketplace_service_prices to authenticated;
create policy "Signed in users can read service prices"
 on public.marketplace_service_prices for select to authenticated using (true);

insert into public.marketplace_service_prices values
('quick_help', 'form_review', '', 'form_review_fixed_4', 400),
('quick_help', 'attempt_review', '', 'attempt_review_fixed_5', 500),
('quick_help', 'posing_review', '', 'posing_review_fixed_5', 500),
('quick_help', 'training_feedback', '', 'training_feedback_fixed_6', 600),
('quick_help', 'other', '', 'quick_other_fixed_6', 600),
('accountability', 'training_accountability', 'One workout', 'training_one_workout_fixed_5', 500),
('accountability', 'training_accountability', 'A few days', 'training_few_days_fixed_8', 800),
('accountability', 'training_accountability', 'One week', 'training_one_week_fixed_15', 1500),
('accountability', 'nutrition_accountability', 'One day', 'nutrition_one_day_fixed_4', 400),
('accountability', 'nutrition_accountability', 'A few days', 'nutrition_few_days_fixed_8', 800),
('accountability', 'nutrition_accountability', 'One week', 'nutrition_one_week_fixed_15', 1500),
('accountability', 'competition_accountability', 'One day', 'competition_accountability_one_day_fixed_5', 500),
('accountability', 'competition_accountability', 'A few days', 'competition_accountability_few_days_fixed_10', 1000),
('accountability', 'competition_accountability', 'One week', 'competition_accountability_one_week_fixed_15', 1500),
('accountability', 'general_accountability', 'One day', 'general_one_day_fixed_4', 400),
('accountability', 'general_accountability', 'A few days', 'general_few_days_fixed_8', 800),
('accountability', 'general_accountability', 'One week', 'general_one_week_fixed_15', 1500),
('accountability', 'other_accountability', 'One day', 'other_accountability_one_day_fixed_4', 400),
('accountability', 'other_accountability', 'A few days', 'other_accountability_few_days_fixed_8', 800),
('accountability', 'other_accountability', 'One week', 'other_accountability_one_week_fixed_15', 1500),
('session', 'technique_session', '', 'technique_session_fixed_15', 1500),
('session', 'posing_session', '', 'posing_session_fixed_15', 1500),
('session', 'workout_guidance', '', 'workout_guidance_fixed_18', 1800),
('session', 'competition_practice', '', 'competition_practice_fixed_18', 1800),
('session', 'other_session', '', 'other_session_fixed_15', 1500),
('competition', 'Meet Prep', '', 'competition_prep_fixed_10', 1000),
('competition', 'Meet-Day Support', '', 'competition_day_fixed_15', 1500),
('competition', 'Post-Meet Review', '', 'competition_review_fixed_8', 800),
('competition', 'Competition Prep', '', 'competition_prep_fixed_10', 1000),
('competition', 'Competition-Day Support', '', 'competition_day_fixed_15', 1500),
('competition', 'Post-Competition Review', '', 'competition_review_fixed_8', 800),
('competition', 'Show Prep Support', '', 'competition_prep_fixed_10', 1000),
('competition', 'Posing Practice', '', 'competition_prep_fixed_10', 1000),
('competition', 'Show-Day Support', '', 'competition_day_fixed_15', 1500),
('competition', 'Post-Show Review', '', 'competition_review_fixed_8', 800),
('competition', 'Event-Day Support', '', 'competition_day_fixed_15', 1500),
('competition', 'Post-Event Review', '', 'competition_review_fixed_8', 800)
on conflict (category, request_type, duration) do nothing;

create or replace function public.enforce_marketplace_price()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare price public.marketplace_service_prices%rowtype;
begin
 if tg_op = 'INSERT' then
   select * into price from public.marketplace_service_prices
   where category = new.payload ->> 'serviceCategory'
     and request_type = new.payload ->> 'requestType'
     and duration = case when new.payload ->> 'serviceCategory' = 'accountability'
       then coalesce(new.payload #>> '{details,duration}', '') else '' end;
   if not found then raise exception 'Unknown service package.'; end if;
   if new.price_amount_cents is distinct from price.amount_cents or new.currency <> 'USD'
     or new.payload #>> '{details,price,priceId}' is distinct from price.price_id then
     raise exception 'The service price has changed. Refresh and review your request.';
   end if;
   new.price_amount_cents := price.amount_cents;
   new.currency := 'USD';
   new.payload := jsonb_set(new.payload, '{details,price}',
     jsonb_build_object('priceId', price.price_id, 'amount', price.amount_cents / 100.0,
                       'currency', 'USD', 'label', '$' || (price.amount_cents / 100.0)::text));
 else
   if new.price_amount_cents is distinct from old.price_amount_cents
     or new.currency is distinct from old.currency
     or new.payload #> '{details,price}' is distinct from old.payload #> '{details,price}'
     or new.payload -> 'serviceCategory' is distinct from old.payload -> 'serviceCategory'
     or new.payload -> 'requestType' is distinct from old.payload -> 'requestType'
     or new.payload #> '{details,duration}' is distinct from old.payload #> '{details,duration}' then
     raise exception 'The purchased package and price cannot be changed.';
   end if;
 end if;
 return new;
end;
$$;
revoke all on function public.enforce_marketplace_price() from public;
create trigger enforce_marketplace_price before insert or update
on public.marketplace_service_requests for each row execute function public.enforce_marketplace_price();


-- Source: supabase/migrations/20261121020000_admin_conversation_review.sql

create table if not exists public.admin_conversation_reviews (
 id uuid primary key default gen_random_uuid(),
 admin_user_id uuid not null default auth.uid(),
 record_kind text not null check (record_kind in ('conversation', 'service')),
 record_id text not null,
 reason text not null check (length(trim(reason)) between 5 and 500),
 reviewed_at timestamptz not null default now()
);
alter table public.admin_conversation_reviews enable row level security;
revoke all on public.admin_conversation_reviews from public, anon, authenticated;
grant select on public.admin_conversation_reviews to authenticated;
drop policy if exists "Admins can read review history" on public.admin_conversation_reviews;
create policy "Admins can read review history" on public.admin_conversation_reviews
for select to authenticated using (public.current_user_is_admin());

create or replace function public.review_marketplace_conversation(p_kind text, p_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.current_user_is_admin() then
  raise exception 'Administrator access required.';
 end if;
 if length(trim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 500 then
  raise exception 'Enter a review reason between 5 and 500 characters.';
 end if;
 if p_kind = 'conversation' then
  select payload into result from public.marketplace_conversations where id = p_id;
 elsif p_kind = 'service' then
  select payload into result from public.marketplace_service_requests where id = p_id;
 else raise exception 'Invalid conversation type.';
 end if;
 if result is null then raise exception 'Conversation not found.'; end if;
 insert into public.admin_conversation_reviews(admin_user_id, record_kind, record_id, reason)
 values(auth.uid(), p_kind, p_id, trim(p_reason));
 return result;
end;
$$;
revoke all on function public.review_marketplace_conversation(text,text,text) from public;
grant execute on function public.review_marketplace_conversation(text,text,text) to authenticated;
-- List metadata without downloading message bodies before a review is opened.
create or replace function public.admin_conversation_summaries()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if auth.uid() is null or not public.current_user_is_admin() then
  raise exception 'Administrator access required.';
 end if;
 return coalesce((select jsonb_agg(summary) from (
  select jsonb_build_object('id',id,'relationshipStatus',relationship_status,
   'client',jsonb_build_object('fullName',payload #>> '{client,fullName}'),
   'coachName',payload->>'coachName','updatedAt',updated_at) as summary
  from public.marketplace_conversations order by updated_at desc limit 100
 ) recent), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_conversation_summaries() from public;
grant execute on function public.admin_conversation_summaries() to authenticated;


-- Source: supabase/migrations/20261121030000_v1_service_gate.sql
-- V1 is discovery and ongoing coaching. Remove this trigger in a V2 migration
-- only after payments, private media, and service state transitions are verified.

create or replace function public.block_v1_service_creation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
 raise exception 'Quick Services are not available yet.';
end;
$$;
revoke all on function public.block_v1_service_creation() from public;
drop trigger if exists block_v1_service_creation on public.marketplace_service_requests;
create trigger block_v1_service_creation before insert on public.marketplace_service_requests
for each row execute function public.block_v1_service_creation();


-- Source: supabase/migrations/20261121040000_client_coach_blocking.sql

alter table public.marketplace_conversations add column if not exists blocked_by_client boolean not null default false;

create or replace function public.set_coach_conversation_block(p_conversation_id text, p_blocked boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare target public.marketplace_conversations%rowtype;
begin
 if auth.uid() is null or p_blocked is null then raise exception 'Sign in to manage blocked coaches.'; end if;
 select * into target from public.marketplace_conversations where id=p_conversation_id for update;
 if not found or target.client_user_id <> auth.uid() then raise exception 'Conversation not found.'; end if;
 update public.marketplace_conversations set blocked_by_client=p_blocked where id=target.id;
 return p_blocked;
end;
$$;
revoke all on function public.set_coach_conversation_block(text,boolean) from public;
grant execute on function public.set_coach_conversation_block(text,boolean) to authenticated;

create or replace function public.prevent_blocked_conversation_messages()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if old.blocked_by_client and new.payload->'messages' is distinct from old.payload->'messages' then
  raise exception 'Messaging is unavailable for this conversation.';
 end if;
 return new;
end;
$$;
revoke all on function public.prevent_blocked_conversation_messages() from public;
drop trigger if exists prevent_blocked_conversation_messages on public.marketplace_conversations;
create trigger prevent_blocked_conversation_messages before update on public.marketplace_conversations
for each row execute function public.prevent_blocked_conversation_messages();


commit;
select to_regclass('public.profiles') as profiles, to_regclass('public.marketplace_conversations') as conversations, to_regprocedure('public.admin_conversation_summaries()') as admin_dashboard;
