-- V1 launch additions. Run in STAGING first. Existing marketplace core, blocking,
-- and admin conversation-review migrations must already be installed.

begin;
-- production-review-setup.sql
-- Production review setup: preserves existing tables and records.

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

-- migrations/20261122000000_safety_reports.sql

create table if not exists public.safety_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid references auth.users(id) on delete set null,
 conversation_id text not null,
 category text not null check(category in ('spam','harassment','inappropriate','other')),
 details text not null check(length(trim(details)) between 10 and 3000),
 status text not null default 'open' check(status in ('open','reviewing','resolved')),
 admin_note text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.safety_reports enable row level security;
revoke all on public.safety_reports from public,anon,authenticated;
grant select on public.safety_reports to authenticated;
drop policy if exists "Administrators read safety reports" on public.safety_reports;
create policy "Administrators read safety reports" on public.safety_reports for select to authenticated using(public.current_user_is_admin());
create index if not exists safety_reports_queue on public.safety_reports(status,created_at);
create table if not exists public.safety_report_actions (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references public.safety_reports(id),
 admin_id uuid not null,
 status text not null,
 note text not null,
 created_at timestamptz not null default now()
);
alter table public.safety_report_actions enable row level security;
revoke all on public.safety_report_actions from public,anon,authenticated;
grant select on public.safety_report_actions to authenticated;
drop policy if exists "Administrators read safety actions" on public.safety_report_actions;
create policy "Administrators read safety actions" on public.safety_report_actions for select to authenticated using(public.current_user_is_admin());
create or replace function public.submit_safety_report(p_conversation_id text,p_category text,p_details text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare report_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in to report a conversation.'; end if;
 if not exists(select 1 from public.marketplace_conversations c join public.coach_applications a on a.id=c.coach_application_id where c.id=p_conversation_id and (c.client_user_id=auth.uid() or a.user_id=auth.uid())) then raise exception 'Conversation unavailable.'; end if;
 if (select count(*) from public.safety_reports where reporter_id=auth.uid() and created_at>now()-interval '1 hour')>=5 then raise exception 'Too many reports. Contact support for further assistance.'; end if;
 insert into public.safety_reports(reporter_id,conversation_id,category,details) values(auth.uid(),p_conversation_id,p_category,trim(p_details)) returning id into report_id;
 return report_id;
end; $$;
create or replace function public.resolve_safety_report(p_report_id uuid,p_status text,p_note text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.current_user_is_admin() then raise exception 'Administrator access required.'; end if;
 if p_status not in ('open','reviewing','resolved') or length(trim(coalesce(p_note,''))) not between 5 and 3000 then raise exception 'Choose a status and enter a note between 5 and 3000 characters.'; end if;
 perform 1 from public.safety_reports where id=p_report_id for update;
 if not found then raise exception 'Report unavailable.'; end if;
 insert into public.safety_report_actions(report_id,admin_id,status,note) values(p_report_id,auth.uid(),p_status,trim(p_note));
 update public.safety_reports set status=p_status,admin_note=trim(p_note),updated_at=now() where id=p_report_id;
end; $$;
revoke all on function public.submit_safety_report(text,text,text) from public;
revoke all on function public.resolve_safety_report(uuid,text,text) from public;
grant execute on function public.submit_safety_report(text,text,text) to authenticated;
grant execute on function public.resolve_safety_report(uuid,text,text) to authenticated;

-- migrations/20261122010000_notification_outbox.sql

create table if not exists public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email_enabled boolean not null default false
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public,anon;
grant select,insert,update on public.notification_preferences to authenticated;
drop policy if exists "Own notification preferences" on public.notification_preferences;
create policy "Own notification preferences" on public.notification_preferences for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create table if not exists public.notification_outbox (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references auth.users(id) on delete cascade,
 conversation_id text not null,
 event_kind text not null check(event_kind in ('request','accepted','message')),
 created_at timestamptz not null default now(),
 delivered_at timestamptz,
 attempts integer not null default 0,
 last_error text
);
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from public,anon,authenticated;
create index if not exists notification_outbox_pending on public.notification_outbox(created_at) where delivered_at is null;
create or replace function public.queue_coaching_notification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient uuid; kind text; last_message jsonb; new_count integer; old_count integer:=0;
begin
 if new.blocked_by_client then return new; end if;
 new_count:=jsonb_array_length(coalesce(new.payload->'messages','[]'::jsonb));
 if tg_op='UPDATE' then old_count:=jsonb_array_length(coalesce(old.payload->'messages','[]'::jsonb)); end if;
 if tg_op='UPDATE' and new.relationship_status='accepted' and old.relationship_status is distinct from 'accepted' then
  recipient:=new.client_user_id; kind:='accepted';
 elsif new_count>old_count then
  last_message:=new.payload->'messages'->(new_count-1);
  if last_message->>'sender'='coach' then recipient:=new.client_user_id;
  else select user_id into recipient from public.coach_applications where id=new.coach_application_id; end if;
  kind:=case when tg_op='INSERT' then 'request' else 'message' end;
 else return new;
 end if;
 if recipient is not null and recipient is distinct from auth.uid() and exists(select 1 from public.notification_preferences where user_id=recipient and email_enabled) then
  -- Coalesce unread-message alerts into a single pending email per conversation.
  perform pg_advisory_xact_lock(hashtextextended(recipient::text||new.id,0));
  if not exists(select 1 from public.notification_outbox where recipient_id=recipient and conversation_id=new.id and event_kind=kind and delivered_at is null) then
   insert into public.notification_outbox(recipient_id,conversation_id,event_kind) values(recipient,new.id,kind);
  end if;
 end if;
 return new;
end; $$;
drop trigger if exists queue_coaching_notification on public.marketplace_conversations;
create trigger queue_coaching_notification after insert or update on public.marketplace_conversations for each row execute function public.queue_coaching_notification();

-- migrations/20261122020000_audited_admin_access.sql

-- Admin message bodies are available through the audited RPC, not an unlogged SELECT.
drop policy if exists "Conversation participants and admins can read" on public.marketplace_conversations;
drop policy if exists "Conversation participants can read" on public.marketplace_conversations;
create policy "Conversation participants can read" on public.marketplace_conversations for select to authenticated using(
 client_user_id=auth.uid() or exists(
  select 1 from public.coach_applications a where a.id=coach_application_id and a.user_id=auth.uid() and a.status='approved'
  and exists(select 1 from public.profiles p where p.user_id=client_user_id and p.profile_visible=true)
 )
);

commit;
