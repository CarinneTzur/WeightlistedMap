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
  coach_enabled,
  city,
  gym_name
from public.profiles
where profile_visible = true;

revoke all on public.client_directory from public;
grant select on public.client_directory to authenticated;
