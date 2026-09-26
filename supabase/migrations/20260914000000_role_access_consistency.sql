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
