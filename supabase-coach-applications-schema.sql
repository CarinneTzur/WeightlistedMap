create extension if not exists pgcrypto;

create table if not exists public.coach_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.coach_applications
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

alter table public.coach_applications
  drop column if exists full_name;

alter table public.coach_applications
  add column full_name text generated always as (
    trim(
      both ' '
      from coalesce(first_name, '') || ' ' || coalesce(last_name, '')
    )
  ) stored;

alter table public.coach_applications
  drop constraint if exists coach_applications_status_check;

alter table public.coach_applications
  add constraint coach_applications_status_check
  check (status in ('pending', 'approved', 'declined', 'needs_edits'));

alter table public.coach_applications
  drop constraint if exists coach_applications_coach_title_check;

alter table public.coach_applications
  add constraint coach_applications_coach_title_check
  check (
    coach_title is null
    or coach_title in (
      'Powerlifting Coach',
      'Bodybuilding Coach',
      'Olympic Weightlifting Coach',
      'Strength & Conditioning Coach',
      'Hybrid Athlete Coach',
      'Nutrition Coach',
      'Personal Trainer'
    )
  );

alter table public.coach_applications
  drop constraint if exists coach_applications_years_check;

alter table public.coach_applications
  add constraint coach_applications_years_check
  check (years_of_experience is null or years_of_experience >= 0);

alter table public.coach_applications
  drop constraint if exists coach_applications_roster_check;

alter table public.coach_applications
  add constraint coach_applications_roster_check
  check (current_roster_size is null or current_roster_size >= 0);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_coach_applications_updated_at
on public.coach_applications;

create trigger set_coach_applications_updated_at
before update on public.coach_applications
for each row
execute function public.set_updated_at();

create index if not exists coach_applications_status_created_idx
on public.coach_applications (status, created_at desc);

create index if not exists coach_applications_full_name_idx
on public.coach_applications (full_name);

alter table public.coach_applications enable row level security;

drop policy if exists "Anyone can submit coach applications"
on public.coach_applications;

drop policy if exists "Anyone can view approved coaches"
on public.coach_applications;

drop policy if exists "Public can read coach applications for admin portal"
on public.coach_applications;

drop policy if exists "Public can review coach applications from admin portal"
on public.coach_applications;

create policy "Anyone can submit coach applications"
on public.coach_applications
for insert
to anon
with check (
  status = 'pending'
  and interview_required = true
);

create policy "Public can read coach applications for admin portal"
on public.coach_applications
for select
to anon
using (true);

create policy "Public can review coach applications from admin portal"
on public.coach_applications
for update
to anon
using (true)
with check (
  status in ('pending', 'approved', 'declined', 'needs_edits')
);

insert into storage.buckets (id, name, public)
values ('coach-photos', 'coach-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can upload coach application photos"
on storage.objects;

drop policy if exists "Public can read coach application photos"
on storage.objects;

create policy "Public can upload coach application photos"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'coach-photos'
  and name like 'applications/%'
);

create policy "Public can read coach application photos"
on storage.objects
for select
to anon
using (bucket_id = 'coach-photos');
