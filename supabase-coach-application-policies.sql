-- Security migration for an installation that previously ran the public policies.
-- Run supabase-coach-applications-schema.sql first. It creates the user ownership
-- column, account profiles, admin helper, safe directory view, and these policies.

alter table public.profiles enable row level security;
alter table public.coach_applications enable row level security;

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

revoke all on public.coach_applications from anon;
grant select, insert, update, delete on public.coach_applications to authenticated;

-- Client accounts may update their own voluntary coach-visible profile fields.
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

drop policy if exists "Public can upload coach application photos" on storage.objects;
drop policy if exists "Public can read coach application photos" on storage.objects;
drop policy if exists "Applicants can upload their own application photos" on storage.objects;
create policy "Applicants can upload their own application photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'coach-photos' and name like ('applications/' || auth.uid()::text || '/%')
);

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
