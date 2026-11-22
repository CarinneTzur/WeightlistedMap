begin;
alter table public.marketplace_conversations add column if not exists blocked_by_client boolean not null default false;

create or replace function public.set_coach_conversation_block(p_conversation_id text, p_blocked boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare target public.marketplace_conversations%rowtype;
begin
 if auth.uid() is null or p_blocked is null then raise exception 'Sign in to manage blocked coaches.'; end if;
 select * into target from public.marketplace_conversations where id=p_conversation_id for update;
 if not found or target.client_user_id <> auth.uid() then raise exception 'Conversation not found.'; end if;
 update public.marketplace_conversations set blocked_by_client=p_blocked where id=target.id;
 return p_blocked;
end;
$$;
revoke all on function public.set_coach_conversation_block(text,boolean) from public;
grant execute on function public.set_coach_conversation_block(text,boolean) to authenticated;

create or replace function public.prevent_blocked_conversation_messages()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if old.blocked_by_client and new.payload->'messages' is distinct from old.payload->'messages' then
  raise exception 'Messaging is unavailable for this conversation.';
 end if;
 return new;
end;
$$;
revoke all on function public.prevent_blocked_conversation_messages() from public;
drop trigger if exists prevent_blocked_conversation_messages on public.marketplace_conversations;
create trigger prevent_blocked_conversation_messages before update on public.marketplace_conversations
for each row execute function public.prevent_blocked_conversation_messages();
commit;
