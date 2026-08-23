-- Canonical Google Place IDs keep branches with the same gym name distinct.
-- Run this in the Supabase SQL editor after the coach-applications schema.

alter table public.coach_applications
  add column if not exists gym_place_id text,
  add column if not exists gym_address text;

create index if not exists coach_applications_gym_place_id_idx
  on public.coach_applications (gym_place_id)
  where gym_place_id is not null and gym_place_id <> '';

-- Keep the public approved-coach view in step with the new canonical gym fields.
create or replace view public.coach_directory with (security_barrier = true) as
select
  id, created_at, updated_at, status, first_name, last_name, full_name,
  city, state, gym_name, gym_city, gym_state, coach_title, specialties,
  bio, lifting_experience, coaching_experience,
  years_of_experience, current_roster_size, online_training, remote_available,
  in_person_coaching, coaching_formats, profile_photo_url, social_links,
  certifications, latitude, longitude, gym_place_id, gym_address
from public.coach_applications
where status = 'approved';

revoke all on public.coach_directory from public;
grant select on public.coach_directory to anon, authenticated;
