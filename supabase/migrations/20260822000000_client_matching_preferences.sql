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
