-- Run this in Supabase SQL Editor for the coach application flow.
-- This matches the current frontend-only admin review setup.

alter table public.coach_applications
	add column if not exists first_name text,
	add column if not exists last_name text,
	add column if not exists review_statement text;

alter table public.coach_applications enable row level security;

drop policy if exists "Public can submit pending coach applications"
	on public.coach_applications;

create policy "Public can submit pending coach applications"
	on public.coach_applications
	for insert
	to anon
	with check (status = 'pending');

drop policy if exists "Public can read coach applications for admin portal"
	on public.coach_applications;

create policy "Public can read coach applications for admin portal"
	on public.coach_applications
	for select
	to anon
	using (true);

drop policy if exists "Public can review coach applications from admin portal"
	on public.coach_applications;

create policy "Public can review coach applications from admin portal"
	on public.coach_applications
	for update
	to anon
	using (true)
	with check (status in ('pending', 'approved', 'declined', 'needs_edits'));

insert into storage.buckets (id, name, public)
values ('coach-photos', 'coach-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can upload coach application photos"
	on storage.objects;

create policy "Public can upload coach application photos"
	on storage.objects
	for insert
	to anon
	with check (
		bucket_id = 'coach-photos'
		and name like 'applications/%'
	);

drop policy if exists "Public can read coach application photos"
	on storage.objects;

create policy "Public can read coach application photos"
	on storage.objects
	for select
	to anon
	using (bucket_id = 'coach-photos');
