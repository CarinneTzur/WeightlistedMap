begin;
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
commit;
