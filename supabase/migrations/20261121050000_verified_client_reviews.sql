begin;
alter table public.marketplace_conversations add column if not exists first_accepted_at timestamptz;
update public.marketplace_conversations set first_accepted_at = updated_at
where relationship_status = 'accepted' and first_accepted_at is null;

create or replace function public.remember_coaching_acceptance()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then new.first_accepted_at := old.first_accepted_at; end if;
 if new.relationship_status='accepted' and new.first_accepted_at is null then new.first_accepted_at:=now(); end if;
 return new;
end;
$$;
drop trigger if exists remember_coaching_acceptance on public.marketplace_conversations;
create trigger remember_coaching_acceptance before insert or update on public.marketplace_conversations
for each row execute function public.remember_coaching_acceptance();

create or replace function public.can_review_coach(p_coach_id text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists (
  select 1 from public.marketplace_conversations c
  join public.coach_applications a on a.id=c.coach_application_id
  where c.client_user_id=auth.uid() and a.id::text=p_coach_id
   and a.user_id is distinct from auth.uid() and c.first_accepted_at is not null
 );
$$;
revoke all on function public.can_review_coach(text) from public;
grant execute on function public.can_review_coach(text) to authenticated;

create or replace function public.guard_verified_coach_review()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Coach responses may update the same row without changing the client's review.
 if tg_op='UPDATE' then
  if new.reviewer_user_id=old.reviewer_user_id and new.coach_id=old.coach_id
   and new.rating=old.rating and new.body is not distinct from old.body then return new; end if;
 end if;
 if new.reviewer_user_id is distinct from auth.uid() or not public.can_review_coach(new.coach_id) then
  raise exception 'Only verified current or former clients can review this coach.';
 end if;
 return new;
end;
$$;
drop trigger if exists guard_verified_coach_review on public.coach_reviews;
create trigger guard_verified_coach_review before insert or update on public.coach_reviews
for each row execute function public.guard_verified_coach_review();
commit;
