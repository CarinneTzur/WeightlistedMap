-- Prices are selected from an administrator-controlled catalog, not browser amounts.
begin;
create table if not exists public.marketplace_service_prices (
 category text not null,
 request_type text not null,
 duration text not null default '',
 price_id text not null,
 amount_cents integer not null check (amount_cents > 0),
 primary key(category, request_type, duration)
);
alter table public.marketplace_service_prices enable row level security;
revoke all on public.marketplace_service_prices from public, anon, authenticated;
grant select on public.marketplace_service_prices to authenticated;
create policy "Signed in users can read service prices"
 on public.marketplace_service_prices for select to authenticated using (true);

insert into public.marketplace_service_prices values
('quick_help', 'form_review', '', 'form_review_fixed_4', 400),
('quick_help', 'attempt_review', '', 'attempt_review_fixed_5', 500),
('quick_help', 'posing_review', '', 'posing_review_fixed_5', 500),
('quick_help', 'training_feedback', '', 'training_feedback_fixed_6', 600),
('quick_help', 'other', '', 'quick_other_fixed_6', 600),
('accountability', 'training_accountability', 'One workout', 'training_one_workout_fixed_5', 500),
('accountability', 'training_accountability', 'A few days', 'training_few_days_fixed_8', 800),
('accountability', 'training_accountability', 'One week', 'training_one_week_fixed_15', 1500),
('accountability', 'nutrition_accountability', 'One day', 'nutrition_one_day_fixed_4', 400),
('accountability', 'nutrition_accountability', 'A few days', 'nutrition_few_days_fixed_8', 800),
('accountability', 'nutrition_accountability', 'One week', 'nutrition_one_week_fixed_15', 1500),
('accountability', 'competition_accountability', 'One day', 'competition_accountability_one_day_fixed_5', 500),
('accountability', 'competition_accountability', 'A few days', 'competition_accountability_few_days_fixed_10', 1000),
('accountability', 'competition_accountability', 'One week', 'competition_accountability_one_week_fixed_15', 1500),
('accountability', 'general_accountability', 'One day', 'general_one_day_fixed_4', 400),
('accountability', 'general_accountability', 'A few days', 'general_few_days_fixed_8', 800),
('accountability', 'general_accountability', 'One week', 'general_one_week_fixed_15', 1500),
('accountability', 'other_accountability', 'One day', 'other_accountability_one_day_fixed_4', 400),
('accountability', 'other_accountability', 'A few days', 'other_accountability_few_days_fixed_8', 800),
('accountability', 'other_accountability', 'One week', 'other_accountability_one_week_fixed_15', 1500),
('session', 'technique_session', '', 'technique_session_fixed_15', 1500),
('session', 'posing_session', '', 'posing_session_fixed_15', 1500),
('session', 'workout_guidance', '', 'workout_guidance_fixed_18', 1800),
('session', 'competition_practice', '', 'competition_practice_fixed_18', 1800),
('session', 'other_session', '', 'other_session_fixed_15', 1500),
('competition', 'Meet Prep', '', 'competition_prep_fixed_10', 1000),
('competition', 'Meet-Day Support', '', 'competition_day_fixed_15', 1500),
('competition', 'Post-Meet Review', '', 'competition_review_fixed_8', 800),
('competition', 'Competition Prep', '', 'competition_prep_fixed_10', 1000),
('competition', 'Competition-Day Support', '', 'competition_day_fixed_15', 1500),
('competition', 'Post-Competition Review', '', 'competition_review_fixed_8', 800),
('competition', 'Show Prep Support', '', 'competition_prep_fixed_10', 1000),
('competition', 'Posing Practice', '', 'competition_prep_fixed_10', 1000),
('competition', 'Show-Day Support', '', 'competition_day_fixed_15', 1500),
('competition', 'Post-Show Review', '', 'competition_review_fixed_8', 800),
('competition', 'Event-Day Support', '', 'competition_day_fixed_15', 1500),
('competition', 'Post-Event Review', '', 'competition_review_fixed_8', 800)
on conflict (category, request_type, duration) do nothing;

create or replace function public.enforce_marketplace_price()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare price public.marketplace_service_prices%rowtype;
begin
 if tg_op = 'INSERT' then
   select * into price from public.marketplace_service_prices
   where category = new.payload ->> 'serviceCategory'
     and request_type = new.payload ->> 'requestType'
     and duration = case when new.payload ->> 'serviceCategory' = 'accountability'
       then coalesce(new.payload #>> '{details,duration}', '') else '' end;
   if not found then raise exception 'Unknown service package.'; end if;
   if new.price_amount_cents is distinct from price.amount_cents or new.currency <> 'USD'
     or new.payload #>> '{details,price,priceId}' is distinct from price.price_id then
     raise exception 'The service price has changed. Refresh and review your request.';
   end if;
   new.price_amount_cents := price.amount_cents;
   new.currency := 'USD';
   new.payload := jsonb_set(new.payload, '{details,price}',
     jsonb_build_object('priceId', price.price_id, 'amount', price.amount_cents / 100.0,
                       'currency', 'USD', 'label', '$' || (price.amount_cents / 100.0)::text));
 else
   if new.price_amount_cents is distinct from old.price_amount_cents
     or new.currency is distinct from old.currency
     or new.payload #> '{details,price}' is distinct from old.payload #> '{details,price}'
     or new.payload -> 'serviceCategory' is distinct from old.payload -> 'serviceCategory'
     or new.payload -> 'requestType' is distinct from old.payload -> 'requestType'
     or new.payload #> '{details,duration}' is distinct from old.payload #> '{details,duration}' then
     raise exception 'The purchased package and price cannot be changed.';
   end if;
 end if;
 return new;
end;
$$;
revoke all on function public.enforce_marketplace_price() from public;
create trigger enforce_marketplace_price before insert or update
on public.marketplace_service_requests for each row execute function public.enforce_marketplace_price();
commit;
