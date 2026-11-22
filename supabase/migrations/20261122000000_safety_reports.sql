begin;
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
commit;
