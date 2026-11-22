begin;
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
