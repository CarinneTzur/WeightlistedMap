-- V1 is discovery and ongoing coaching. Remove this trigger in a V2 migration
-- only after payments, private media, and service state transitions are verified.
begin;
create or replace function public.block_v1_service_creation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
 raise exception 'Quick Services are not available yet.';
end;
$$;
revoke all on function public.block_v1_service_creation() from public;
drop trigger if exists block_v1_service_creation on public.marketplace_service_requests;
create trigger block_v1_service_creation before insert on public.marketplace_service_requests
for each row execute function public.block_v1_service_creation();
commit;
