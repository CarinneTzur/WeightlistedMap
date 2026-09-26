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
