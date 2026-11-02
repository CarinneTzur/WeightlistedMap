-- Make the coach's first public review response immutable and allow the coach
-- and original reviewer to continue with append-only, visibly nested replies.

create extension if not exists pgcrypto;

create table if not exists public.coach_review_replies (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.coach_reviews(id) on delete cascade,
  parent_reply_id uuid references public.coach_review_replies(id) on delete restrict,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_role text not null check (author_role in ('reviewer', 'coach')),
  author_display_name text not null,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists coach_review_replies_review_created_idx
on public.coach_review_replies (review_id, created_at);

alter table public.coach_review_replies enable row level security;
revoke all on public.coach_review_replies from public, anon, authenticated;

create or replace view public.coach_review_replies_public with (security_barrier = true) as
select
  id,
  review_id,
  parent_reply_id,
  author_role,
  author_display_name,
  body,
  created_at
from public.coach_review_replies;

revoke all on public.coach_review_replies_public from public;
grant select on public.coach_review_replies_public to anon, authenticated;

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
  target_review public.coach_reviews;
  normalized_response text := trim(coalesce(p_response, ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in before responding to a review.';
  end if;
  if normalized_response = '' then
    raise exception 'Write a response before posting.';
  end if;
  if char_length(normalized_response) > 1000 then
    raise exception 'Response is too long.';
  end if;

  select * into target_review
  from public.coach_reviews
  where id = p_review_id
  for update;

  if not found then
    raise exception 'Review not found.';
  end if;
  if not exists (
    select 1 from public.coach_applications
    where id::text = target_review.coach_id
      and user_id = auth.uid()
      and status = 'approved'
  ) then
    raise exception 'Only this coach can respond to the review.';
  end if;
  if nullif(trim(target_review.coach_response), '') is not null then
    raise exception 'Your response has already been posted and cannot be edited.';
  end if;

  update public.coach_reviews
  set coach_response = normalized_response,
      coach_responded_at = now(),
      updated_at = now()
  where id = p_review_id;

  return query select * from public.coach_reviews where id = p_review_id;
end;
$$;

revoke all on function public.respond_to_coach_review(uuid, text) from public;
grant execute on function public.respond_to_coach_review(uuid, text) to authenticated;

create or replace function public.add_coach_review_reply(
  p_review_id uuid,
  p_parent_reply_id uuid default null,
  p_body text default ''
)
returns setof public.coach_review_replies
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_review public.coach_reviews;
  parent_reply public.coach_review_replies;
  next_role text;
  next_display_name text;
  normalized_body text := trim(coalesce(p_body, ''));
  inserted_id uuid;
begin
  if current_user_id is null then
    raise exception 'Sign in before replying.';
  end if;
  if normalized_body = '' then
    raise exception 'Write a reply before posting.';
  end if;
  if char_length(normalized_body) > 1000 then
    raise exception 'Reply is too long.';
  end if;

  select * into target_review
  from public.coach_reviews
  where id = p_review_id;
  if not found then
    raise exception 'Review not found.';
  end if;

  if target_review.reviewer_user_id = current_user_id then
    next_role := 'reviewer';
    next_display_name := target_review.reviewer_display_name;
  elsif exists (
    select 1 from public.coach_applications
    where id::text = target_review.coach_id
      and user_id = current_user_id
      and status = 'approved'
  ) then
    next_role := 'coach';
    select coalesce(nullif(trim(public_name), ''), nullif(trim(full_name), ''), 'Coach')
    into next_display_name
    from public.coach_applications
    where id::text = target_review.coach_id;
  else
    raise exception 'Only this coach and the original reviewer can reply.';
  end if;

  if p_parent_reply_id is null then
    if next_role <> 'reviewer' or nullif(trim(target_review.coach_response), '') is null then
      raise exception 'The reviewer can reply after the coach posts a response.';
    end if;
  else
    select * into parent_reply
    from public.coach_review_replies
    where id = p_parent_reply_id
      and review_id = p_review_id;
    if not found then
      raise exception 'The reply being answered was not found.';
    end if;
    if parent_reply.author_role = next_role then
      raise exception 'Wait for the other person before replying again.';
    end if;
  end if;

  insert into public.coach_review_replies (
    review_id,
    parent_reply_id,
    author_user_id,
    author_role,
    author_display_name,
    body
  ) values (
    p_review_id,
    p_parent_reply_id,
    current_user_id,
    next_role,
    next_display_name,
    normalized_body
  ) returning id into inserted_id;

  return query
  select * from public.coach_review_replies where id = inserted_id;
end;
$$;

revoke all on function public.add_coach_review_reply(uuid, uuid, text) from public;
grant execute on function public.add_coach_review_reply(uuid, uuid, text) to authenticated;
