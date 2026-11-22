-- Only the verified founder account may use both sides of its own conversation.
begin;
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

  if target.client_user_id = auth.uid()
    and p_message->>'sender' = 'coach'
    and exists (
      select 1 from auth.users u join public.coach_applications a on a.user_id=u.id
      where u.id=auth.uid() and lower(u.email)='getweightlisted@gmail.com'
        and u.email_confirmed_at is not null
        and a.id=target.coach_application_id and a.status='approved'
    ) then
    sender_role := 'coach';
  elsif target.client_user_id = auth.uid() then
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


commit;
