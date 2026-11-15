-- Server access without the service_role key.
-- The app uses the public (anon/publishable) key plus a secret header,
-- `x-sentinel-key`, that only the server knows. RLS lets a request touch the
-- Sentinel tables only when that header's SHA-256 matches the stored hash.
-- Requests with just the public key (e.g. from a browser) get nothing.
-- The hash itself is inserted outside migrations, so no secret lives in git.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_key (
  id          int primary key default 1 check (id = 1),
  secret_hash text not null
);

-- True when the current PostgREST request carries the right x-sentinel-key.
create or replace function public.sentinel_request_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from private.app_key k
     where k.secret_hash = encode(
             sha256(convert_to(coalesce(current_setting('request.headers', true)::json ->> 'x-sentinel-key', ''), 'UTF8')),
             'hex')
  );
$$;

revoke all on function public.sentinel_request_ok() from public;
grant execute on function public.sentinel_request_ok() to anon;

grant usage on schema public to anon;
grant select, insert, update, delete on public.threats, public.threat_events, public.intel_sweeps to anon;
grant execute on function public.record_catch(text, timestamptz) to anon;

drop policy if exists sentinel_app_threats on public.threats;
create policy sentinel_app_threats on public.threats
  for all to anon using (public.sentinel_request_ok()) with check (public.sentinel_request_ok());

drop policy if exists sentinel_app_events on public.threat_events;
create policy sentinel_app_events on public.threat_events
  for all to anon using (public.sentinel_request_ok()) with check (public.sentinel_request_ok());

drop policy if exists sentinel_app_sweeps on public.intel_sweeps;
create policy sentinel_app_sweeps on public.intel_sweeps
  for all to anon using (public.sentinel_request_ok()) with check (public.sentinel_request_ok());
