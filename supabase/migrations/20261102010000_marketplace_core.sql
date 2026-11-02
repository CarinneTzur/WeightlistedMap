-- Durable client/coach marketplace records. The React app keeps a small local
-- cache for instant rendering, but these tables are the shared source of truth.

create extension if not exists pgcrypto;

create table if not exists public.marketplace_conversations (
  id text primary key,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  coach_application_id uuid not null references public.coach_applications(id) on delete cascade,
  relationship_status text not null default 'pending'
    check (relationship_status in ('pending', 'accepted', 'declined')),
  payload jsonb not null default '{}'::jsonb,
  read_by_client_at timestamptz,
  read_by_coach_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_user_id, coach_application_id)
);

create index if not exists marketplace_conversations_client_updated_idx
  on public.marketplace_conversations (client_user_id, updated_at desc);
create index if not exists marketplace_conversations_coach_updated_idx
  on public.marketplace_conversations (coach_application_id, updated_at desc);

create table if not exists public.marketplace_service_requests (
  id text primary key,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  claimed_coach_application_id uuid references public.coach_applications(id) on delete set null,
  request_status text not null default 'awaiting_payment'
    check (request_status in ('awaiting_payment', 'matching', 'claimed', 'completed', 'cancelled', 'refunded')),
  payment_status text not null default 'payment_required'
    check (payment_status in ('payment_required', 'processing', 'paid', 'refunded', 'failed')),
  payout_status text not null default 'not_started'
    check (payout_status in ('not_started', 'held', 'ready', 'paid', 'reversed')),
  price_amount_cents integer check (price_amount_cents is null or price_amount_cents >= 0),
  currency text not null default 'USD',
  payment_reference text,
  passed_by_coach_ids uuid[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  read_by_client_at timestamptz,
  read_by_coach_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_service_requests_client_updated_idx
  on public.marketplace_service_requests (client_user_id, updated_at desc);
create index if not exists marketplace_service_requests_available_idx
  on public.marketplace_service_requests (request_status, payment_status, updated_at desc);
create index if not exists marketplace_service_requests_coach_updated_idx
  on public.marketplace_service_requests (claimed_coach_application_id, updated_at desc)
  where claimed_coach_application_id is not null;

alter table public.marketplace_conversations enable row level security;
alter table public.marketplace_service_requests enable row level security;

drop policy if exists "Conversation participants and admins can read" on public.marketplace_conversations;
create policy "Conversation participants and admins can read"
on public.marketplace_conversations
for select to authenticated
using (
  client_user_id = auth.uid()
  or exists (
    select 1 from public.coach_applications application
    where application.id = coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
      and exists (
        select 1 from public.profiles client_profile
        where client_profile.user_id = client_user_id
          and client_profile.profile_visible = true
      )
  )
  or public.current_user_is_admin()
);

drop policy if exists "Service participants available coaches and admins can read" on public.marketplace_service_requests;
create policy "Service participants available coaches and admins can read"
on public.marketplace_service_requests
for select to authenticated
using (
  client_user_id = auth.uid()
  or public.current_user_is_admin()
  or exists (
    select 1 from public.coach_applications application
    where application.user_id = auth.uid()
      and application.status = 'approved'
      and exists (
        select 1 from public.profiles client_profile
        where client_profile.user_id = client_user_id
          and client_profile.profile_visible = true
      )
      and (
        application.id = claimed_coach_application_id
        or (
          claimed_coach_application_id is null
          and request_status = 'matching'
          and payment_status = 'paid'
          and not (application.id = any(passed_by_coach_ids))
          and application.accepting_requests = true
        )
      )
  )
);

revoke all on public.marketplace_conversations from public, anon, authenticated;
revoke all on public.marketplace_service_requests from public, anon, authenticated;
grant select on public.marketplace_conversations to authenticated;
grant select on public.marketplace_service_requests to authenticated;

create or replace function public.create_or_append_marketplace_conversation(
  p_coach_application_id uuid,
  p_message jsonb,
  p_client_snapshot jsonb default '{}'::jsonb
)
returns setof public.marketplace_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  thread_id text;
  timestamp_value timestamptz := now();
  clean_message jsonb;
  clean_client jsonb;
  coach_record public.coach_applications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in before starting a conversation.';
  end if;

  select * into coach_record
  from public.coach_applications
  where id = p_coach_application_id
    and status = 'approved'
    and profile_visible = true;
  if not found then
    raise exception 'This coach is not currently available.';
  end if;

  thread_id := 'direct-' || auth.uid()::text || '-' || p_coach_application_id::text;
  clean_client := coalesce(p_client_snapshot, '{}'::jsonb)
    || jsonb_build_object('id', auth.uid()::text, 'userId', auth.uid()::text);
  clean_message := jsonb_build_object(
    'id', coalesce(nullif(p_message ->> 'id', ''), gen_random_uuid()::text),
    'sender', 'client',
    'text', left(coalesce(p_message ->> 'text', ''), 5000),
    'attachments', coalesce(p_message -> 'attachments', '[]'::jsonb),
    'createdAt', timestamp_value
  );

  insert into public.marketplace_conversations (
    id,
    client_user_id,
    coach_application_id,
    relationship_status,
    payload,
    read_by_client_at,
    created_at,
    updated_at
  ) values (
    thread_id,
    auth.uid(),
    p_coach_application_id,
    'pending',
    jsonb_build_object(
      'id', thread_id,
      'type', 'direct',
      'coachId', p_coach_application_id::text,
      'coachName', coalesce(nullif(coach_record.public_name, ''), coach_record.full_name),
      'coachTitle', coalesce(nullif(coach_record.public_title, ''), coach_record.coach_title),
      'coachHeadshot', coalesce(coach_record.profile_photo_url, ''),
      'client', clean_client,
      'relationshipStatus', 'pending',
      'relationshipRequestedAt', timestamp_value,
      'createdAt', timestamp_value,
      'updatedAt', timestamp_value,
      'readByClientAt', timestamp_value,
      'readByCoachAt', null,
      'unreadForClient', 0,
      'unreadForCoach', 1,
      'messages', jsonb_build_array(clean_message)
    ),
    timestamp_value,
    timestamp_value,
    timestamp_value
  )
  on conflict (client_user_id, coach_application_id) do update set
    payload = public.marketplace_conversations.payload || jsonb_build_object(
      'messages', coalesce(public.marketplace_conversations.payload -> 'messages', '[]'::jsonb) || jsonb_build_array(clean_message),
      'updatedAt', timestamp_value,
      'readByClientAt', timestamp_value,
      'unreadForCoach', coalesce((public.marketplace_conversations.payload ->> 'unreadForCoach')::integer, 0) + 1
    ),
    read_by_client_at = timestamp_value,
    updated_at = timestamp_value;

  return query select * from public.marketplace_conversations where id = thread_id;
end;
$$;

create or replace function public.append_marketplace_conversation_message(
  p_conversation_id text,
  p_message jsonb
)
returns setof public.marketplace_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_conversations%rowtype;
  sender_role text;
  timestamp_value timestamptz := now();
  clean_message jsonb;
  next_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in before sending a message.'; end if;

  select * into target
  from public.marketplace_conversations
  where id = p_conversation_id
  for update;
  if not found then raise exception 'Conversation not found.'; end if;

  if target.client_user_id = auth.uid() then
    sender_role := 'client';
  elsif exists (
    select 1 from public.coach_applications application
    where application.id = target.coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then
    sender_role := 'coach';
  else
    raise exception 'You do not have access to this conversation.';
  end if;

  clean_message := jsonb_build_object(
    'id', coalesce(nullif(p_message ->> 'id', ''), gen_random_uuid()::text),
    'sender', sender_role,
    'text', left(coalesce(p_message ->> 'text', ''), 5000),
    'attachments', coalesce(p_message -> 'attachments', '[]'::jsonb),
    'createdAt', timestamp_value
  );
  next_payload := target.payload || jsonb_build_object(
    'messages', coalesce(target.payload -> 'messages', '[]'::jsonb) || jsonb_build_array(clean_message),
    'updatedAt', timestamp_value,
    'unreadForCoach', case when sender_role = 'client' then coalesce((target.payload ->> 'unreadForCoach')::integer, 0) + 1 else 0 end,
    'unreadForClient', case when sender_role = 'coach' then coalesce((target.payload ->> 'unreadForClient')::integer, 0) + 1 else coalesce((target.payload ->> 'unreadForClient')::integer, 0) end
  );

  update public.marketplace_conversations
  set payload = next_payload,
      read_by_client_at = case when sender_role = 'client' then timestamp_value else read_by_client_at end,
      read_by_coach_at = case when sender_role = 'coach' then timestamp_value else read_by_coach_at end,
      updated_at = timestamp_value
  where id = p_conversation_id;

  return query select * from public.marketplace_conversations where id = p_conversation_id;
end;
$$;

create or replace function public.set_marketplace_relationship(
  p_conversation_id text,
  p_relationship_status text
)
returns setof public.marketplace_conversations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_conversations%rowtype;
  timestamp_value timestamptz := now();
begin
  if p_relationship_status not in ('pending', 'accepted', 'declined') then
    raise exception 'Choose a valid relationship status.';
  end if;
  select * into target from public.marketplace_conversations where id = p_conversation_id for update;
  if not found then raise exception 'Conversation not found.'; end if;
  if not public.current_user_is_admin() and not exists (
    select 1 from public.coach_applications application
    where application.id = target.coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then
    raise exception 'Only this coach or an administrator can change the client relationship.';
  end if;

  update public.marketplace_conversations
  set relationship_status = p_relationship_status,
      payload = payload || jsonb_build_object(
        'relationshipStatus', p_relationship_status,
        'relationshipUpdatedAt', timestamp_value,
        'updatedAt', timestamp_value,
        'unreadForClient', coalesce((payload ->> 'unreadForClient')::integer, 0) + 1
      ),
      updated_at = timestamp_value
  where id = p_conversation_id;
  return query select * from public.marketplace_conversations where id = p_conversation_id;
end;
$$;

create or replace function public.mark_marketplace_conversation_read(
  p_conversation_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_conversations%rowtype;
  reader_role text;
  timestamp_value timestamptz := now();
begin
  select * into target from public.marketplace_conversations where id = p_conversation_id for update;
  if not found then return; end if;
  if target.client_user_id = auth.uid() then
    reader_role := 'client';
  elsif exists (
    select 1 from public.coach_applications application
    where application.id = target.coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then
    reader_role := 'coach';
  else
    raise exception 'You do not have access to this conversation.';
  end if;

  update public.marketplace_conversations
  set payload = payload || case
        when reader_role = 'client' then jsonb_build_object('unreadForClient', 0, 'readByClientAt', timestamp_value)
        else jsonb_build_object('unreadForCoach', 0, 'readByCoachAt', timestamp_value)
      end,
      read_by_client_at = case when reader_role = 'client' then timestamp_value else read_by_client_at end,
      read_by_coach_at = case when reader_role = 'coach' then timestamp_value else read_by_coach_at end
  where id = p_conversation_id;
end;
$$;

create or replace function public.create_marketplace_service_request(p_request jsonb)
returns setof public.marketplace_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_id text := left(trim(coalesce(p_request ->> 'id', '')), 160);
  timestamp_value timestamptz := now();
  amount_cents integer;
  client_snapshot jsonb;
  clean_payload jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in before creating a service request.'; end if;
  if request_id = '' or request_id not like 'service-request-%' then
    raise exception 'A valid service request ID is required.';
  end if;
  begin
    amount_cents := round(coalesce(nullif(p_request #>> '{details,price,amount}', '')::numeric, 0) * 100)::integer;
  exception when others then
    amount_cents := null;
  end;

  client_snapshot := coalesce(p_request -> 'client', '{}'::jsonb)
    || jsonb_build_object('id', auth.uid()::text, 'userId', auth.uid()::text);
  clean_payload := p_request
    || jsonb_build_object(
      'id', request_id,
      'client', client_snapshot,
      'requestStatus', 'awaiting_payment',
      'paymentStatus', 'payment_required',
      'payoutStatus', 'not_started',
      'availabilityStatus', 'payment_pending',
      'claimedBy', null,
      'passedByCoachIds', '[]'::jsonb,
      'createdAt', timestamp_value,
      'updatedAt', timestamp_value
    );

  insert into public.marketplace_service_requests (
    id,
    client_user_id,
    request_status,
    payment_status,
    payout_status,
    price_amount_cents,
    currency,
    payload,
    read_by_client_at,
    created_at,
    updated_at
  ) values (
    request_id,
    auth.uid(),
    'awaiting_payment',
    'payment_required',
    'not_started',
    amount_cents,
    upper(left(coalesce(p_request #>> '{details,price,currency}', 'USD'), 3)),
    clean_payload,
    timestamp_value,
    timestamp_value,
    timestamp_value
  );

  return query select * from public.marketplace_service_requests where id = request_id;
end;
$$;

create or replace function public.mark_marketplace_service_request_paid(
  p_request_id text,
  p_payment_reference text default null
)
returns setof public.marketplace_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  timestamp_value timestamptz := now();
begin
  if not public.current_user_is_admin() then
    raise exception 'Administrator access is required.';
  end if;
  update public.marketplace_service_requests
  set request_status = 'matching',
      payment_status = 'paid',
      payout_status = 'held',
      payment_reference = nullif(left(trim(coalesce(p_payment_reference, '')), 250), ''),
      payload = payload || jsonb_build_object(
        'requestStatus', 'matching',
        'paymentStatus', 'paid',
        'payoutStatus', 'held',
        'availabilityStatus', 'open',
        'updatedAt', timestamp_value
      ),
      updated_at = timestamp_value
  where id = p_request_id and request_status = 'awaiting_payment';
  if not found then raise exception 'An awaiting-payment request was not found.'; end if;
  return query select * from public.marketplace_service_requests where id = p_request_id;
end;
$$;

create or replace function public.claim_marketplace_service_request(
  p_request_id text,
  p_coach_application_id uuid
)
returns setof public.marketplace_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_service_requests%rowtype;
  coach_record public.coach_applications%rowtype;
  timestamp_value timestamptz := now();
  coach_snapshot jsonb;
begin
  select * into coach_record
  from public.coach_applications
  where id = p_coach_application_id
    and user_id = auth.uid()
    and status = 'approved'
    and accepting_requests = true;
  if not found then raise exception 'Approved coach access is required.'; end if;

  select * into target
  from public.marketplace_service_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'This request is no longer available.'; end if;
  if target.request_status <> 'matching' or target.payment_status <> 'paid' or target.claimed_coach_application_id is not null then
    raise exception 'Another coach accepted this request or payment is not complete.';
  end if;
  if p_coach_application_id = any(target.passed_by_coach_ids) then
    raise exception 'This request was already passed.';
  end if;

  coach_snapshot := jsonb_build_object(
    'id', coach_record.id::text,
    'name', coalesce(nullif(coach_record.public_name, ''), coach_record.full_name),
    'title', coalesce(nullif(coach_record.public_title, ''), coach_record.coach_title),
    'avatarUrl', coalesce(coach_record.profile_photo_url, '')
  );
  update public.marketplace_service_requests
  set claimed_coach_application_id = p_coach_application_id,
      request_status = 'claimed',
      claimed_at = timestamp_value,
      payload = payload || jsonb_build_object(
        'claimedBy', coach_snapshot,
        'claimedAt', timestamp_value,
        'requestStatus', 'claimed',
        'availabilityStatus', 'claimed',
        'updatedAt', timestamp_value
      ),
      updated_at = timestamp_value
  where id = p_request_id;
  return query select * from public.marketplace_service_requests where id = p_request_id;
end;
$$;

create or replace function public.pass_marketplace_service_request(
  p_request_id text,
  p_coach_application_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_ids uuid[];
begin
  if not exists (
    select 1 from public.coach_applications application
    where application.id = p_coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then raise exception 'Approved coach access is required.'; end if;

  update public.marketplace_service_requests
  set passed_by_coach_ids = array_append(passed_by_coach_ids, p_coach_application_id),
      updated_at = now()
  where id = p_request_id
    and request_status = 'matching'
    and payment_status = 'paid'
    and not (p_coach_application_id = any(passed_by_coach_ids))
  returning passed_by_coach_ids into next_ids;
  if next_ids is not null then
    update public.marketplace_service_requests
    set payload = payload || jsonb_build_object(
      'passedByCoachIds', to_jsonb(next_ids),
      'updatedAt', updated_at
    ) where id = p_request_id;
  end if;
end;
$$;

create or replace function public.append_marketplace_service_message(
  p_request_id text,
  p_message jsonb
)
returns setof public.marketplace_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_service_requests%rowtype;
  sender_role text;
  timestamp_value timestamptz := now();
  clean_message jsonb;
begin
  select * into target from public.marketplace_service_requests where id = p_request_id for update;
  if not found then raise exception 'Service request not found.'; end if;
  if target.client_user_id = auth.uid() then
    sender_role := 'client';
  elsif target.claimed_coach_application_id is not null and exists (
    select 1 from public.coach_applications application
    where application.id = target.claimed_coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then
    sender_role := 'coach';
  else
    raise exception 'You do not have access to this service request.';
  end if;

  clean_message := jsonb_build_object(
    'id', coalesce(nullif(p_message ->> 'id', ''), gen_random_uuid()::text),
    'sender', sender_role,
    'text', left(coalesce(p_message ->> 'text', ''), 5000),
    'attachments', coalesce(p_message -> 'attachments', '[]'::jsonb),
    'createdAt', timestamp_value
  );
  update public.marketplace_service_requests
  set payload = payload || jsonb_build_object(
        'messages', coalesce(payload -> 'messages', '[]'::jsonb) || jsonb_build_array(clean_message),
        'updatedAt', timestamp_value,
        'unreadForCoach', case when sender_role = 'client' then coalesce((payload ->> 'unreadForCoach')::integer, 0) + 1 else 0 end,
        'unreadForClient', case when sender_role = 'coach' then coalesce((payload ->> 'unreadForClient')::integer, 0) + 1 else coalesce((payload ->> 'unreadForClient')::integer, 0) end
      ),
      read_by_client_at = case when sender_role = 'client' then timestamp_value else read_by_client_at end,
      read_by_coach_at = case when sender_role = 'coach' then timestamp_value else read_by_coach_at end,
      updated_at = timestamp_value
  where id = p_request_id;
  return query select * from public.marketplace_service_requests where id = p_request_id;
end;
$$;

create or replace function public.update_marketplace_service_request(
  p_request_id text,
  p_patch jsonb
)
returns setof public.marketplace_service_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_service_requests%rowtype;
  timestamp_value timestamptz := now();
  next_status text;
  next_details jsonb;
begin
  select * into target from public.marketplace_service_requests where id = p_request_id for update;
  if not found then raise exception 'Service request not found.'; end if;
  if not public.current_user_is_admin() and not exists (
    select 1 from public.coach_applications application
    where application.id = target.claimed_coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then raise exception 'Only the assigned coach or an administrator can update this request.'; end if;

  next_status := coalesce(nullif(p_patch ->> 'requestStatus', ''), target.request_status);
  if next_status not in (target.request_status, 'completed') then
    raise exception 'This request status transition is not allowed.';
  end if;
  next_details := coalesce(target.payload -> 'details', '{}'::jsonb) || coalesce(p_patch -> 'details', '{}'::jsonb);

  update public.marketplace_service_requests
  set request_status = next_status,
      completed_at = case when next_status = 'completed' then timestamp_value else completed_at end,
      payload = payload || jsonb_build_object(
        'details', next_details,
        'requestStatus', next_status,
        'availabilityStatus', case when next_status = 'completed' then 'closed' else coalesce(p_patch ->> 'availabilityStatus', payload ->> 'availabilityStatus') end,
        'updatedAt', timestamp_value
      ),
      updated_at = timestamp_value
  where id = p_request_id;
  return query select * from public.marketplace_service_requests where id = p_request_id;
end;
$$;

create or replace function public.mark_marketplace_service_request_read(p_request_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.marketplace_service_requests%rowtype;
  reader_role text;
  timestamp_value timestamptz := now();
begin
  select * into target from public.marketplace_service_requests where id = p_request_id for update;
  if not found then return; end if;
  if target.client_user_id = auth.uid() then
    reader_role := 'client';
  elsif target.claimed_coach_application_id is not null and exists (
    select 1 from public.coach_applications application
    where application.id = target.claimed_coach_application_id
      and application.user_id = auth.uid()
      and application.status = 'approved'
  ) then
    reader_role := 'coach';
  else
    raise exception 'You do not have access to this service request.';
  end if;

  update public.marketplace_service_requests
  set payload = payload || case
        when reader_role = 'client' then jsonb_build_object('unreadForClient', 0, 'readByClientAt', timestamp_value)
        else jsonb_build_object('unreadForCoach', 0, 'readByCoachAt', timestamp_value)
      end,
      read_by_client_at = case when reader_role = 'client' then timestamp_value else read_by_client_at end,
      read_by_coach_at = case when reader_role = 'coach' then timestamp_value else read_by_coach_at end
  where id = p_request_id;
end;
$$;

revoke all on function public.create_or_append_marketplace_conversation(uuid, jsonb, jsonb) from public;
revoke all on function public.append_marketplace_conversation_message(text, jsonb) from public;
revoke all on function public.set_marketplace_relationship(text, text) from public;
revoke all on function public.mark_marketplace_conversation_read(text) from public;
revoke all on function public.create_marketplace_service_request(jsonb) from public;
revoke all on function public.mark_marketplace_service_request_paid(text, text) from public;
revoke all on function public.claim_marketplace_service_request(text, uuid) from public;
revoke all on function public.pass_marketplace_service_request(text, uuid) from public;
revoke all on function public.append_marketplace_service_message(text, jsonb) from public;
revoke all on function public.update_marketplace_service_request(text, jsonb) from public;
revoke all on function public.mark_marketplace_service_request_read(text) from public;

grant execute on function public.create_or_append_marketplace_conversation(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.append_marketplace_conversation_message(text, jsonb) to authenticated;
grant execute on function public.set_marketplace_relationship(text, text) to authenticated;
grant execute on function public.mark_marketplace_conversation_read(text) to authenticated;
grant execute on function public.create_marketplace_service_request(jsonb) to authenticated;
grant execute on function public.mark_marketplace_service_request_paid(text, text) to authenticated;
grant execute on function public.claim_marketplace_service_request(text, uuid) to authenticated;
grant execute on function public.pass_marketplace_service_request(text, uuid) to authenticated;
grant execute on function public.append_marketplace_service_message(text, jsonb) to authenticated;
grant execute on function public.update_marketplace_service_request(text, jsonb) to authenticated;
grant execute on function public.mark_marketplace_service_request_read(text) to authenticated;

-- Include the marketplace tables in Supabase Realtime when available. Duplicate
-- additions are ignored so the migration remains safe to re-run during setup.
do $$
begin
  begin
    alter publication supabase_realtime add table public.marketplace_conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.marketplace_service_requests;
  exception when duplicate_object then null;
  end;
end;
$$;
