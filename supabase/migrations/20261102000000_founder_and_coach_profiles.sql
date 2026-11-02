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
