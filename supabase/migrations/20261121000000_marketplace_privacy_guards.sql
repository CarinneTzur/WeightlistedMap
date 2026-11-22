begin;
create or replace function public.guard_marketplace_privacy()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare visible boolean;
begin
  if auth.uid() is null then raise exception 'Sign in before changing marketplace records.'; end if;
  if public.current_user_is_admin() then return new; end if;
  -- Safety controls remain available even when a client hides their profile.
  if tg_table_name = 'marketplace_conversations' and tg_op = 'UPDATE' then
    if new.client_user_id = auth.uid()
       and (to_jsonb(new) - 'blocked_by_client') = (to_jsonb(old) - 'blocked_by_client') then
      return new;
    end if;
  end if;
  select profile_visible into visible from public.profiles where user_id = new.client_user_id;
  if visible is distinct from true then
    raise exception 'This client profile is hidden. Marketplace changes are unavailable.';
  end if;
  if tg_table_name = 'marketplace_conversations' and tg_op = 'UPDATE' then
    if to_jsonb(old)->>'relationship_status' = 'declined'
       and new.payload->'messages' is distinct from old.payload->'messages' then
      raise exception 'This coaching request is closed.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_marketplace_privacy() from public;
drop trigger if exists guard_marketplace_conversation_privacy on public.marketplace_conversations;
create trigger guard_marketplace_conversation_privacy before insert or update
on public.marketplace_conversations for each row execute function public.guard_marketplace_privacy();
drop trigger if exists guard_marketplace_service_privacy on public.marketplace_service_requests;
create trigger guard_marketplace_service_privacy before insert or update
on public.marketplace_service_requests for each row execute function public.guard_marketplace_privacy();
commit;

