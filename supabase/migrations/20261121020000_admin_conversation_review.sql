begin;
create table if not exists public.admin_conversation_reviews (
 id uuid primary key default gen_random_uuid(),
 admin_user_id uuid not null default auth.uid(),
 record_kind text not null check (record_kind in ('conversation', 'service')),
 record_id text not null,
 reason text not null check (length(trim(reason)) between 5 and 500),
 reviewed_at timestamptz not null default now()
);
alter table public.admin_conversation_reviews enable row level security;
revoke all on public.admin_conversation_reviews from public, anon, authenticated;
grant select on public.admin_conversation_reviews to authenticated;
drop policy if exists "Admins can read review history" on public.admin_conversation_reviews;
create policy "Admins can read review history" on public.admin_conversation_reviews
for select to authenticated using (public.current_user_is_admin());

create or replace function public.review_marketplace_conversation(p_kind text, p_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.current_user_is_admin() then
  raise exception 'Administrator access required.';
 end if;
 if length(trim(coalesce(p_reason, ''))) < 5 or length(p_reason) > 500 then
  raise exception 'Enter a review reason between 5 and 500 characters.';
 end if;
 if p_kind = 'conversation' then
  select payload into result from public.marketplace_conversations where id = p_id;
 elsif p_kind = 'service' then
  select payload into result from public.marketplace_service_requests where id = p_id;
 else raise exception 'Invalid conversation type.';
 end if;
 if result is null then raise exception 'Conversation not found.'; end if;
 insert into public.admin_conversation_reviews(admin_user_id, record_kind, record_id, reason)
 values(auth.uid(), p_kind, p_id, trim(p_reason));
 return result;
end;
$$;
revoke all on function public.review_marketplace_conversation(text,text,text) from public;
grant execute on function public.review_marketplace_conversation(text,text,text) to authenticated;
-- List metadata without downloading message bodies before a review is opened.
create or replace function public.admin_conversation_summaries()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
 if auth.uid() is null or not public.current_user_is_admin() then
  raise exception 'Administrator access required.';
 end if;
 return coalesce((select jsonb_agg(summary) from (
  select jsonb_build_object('id',id,'relationshipStatus',relationship_status,
   'client',jsonb_build_object('fullName',payload #>> '{client,fullName}'),
   'coachName',payload->>'coachName','updatedAt',updated_at) as summary
  from public.marketplace_conversations order by updated_at desc limit 100
 ) recent), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_conversation_summaries() from public;
grant execute on function public.admin_conversation_summaries() to authenticated;
commit;
