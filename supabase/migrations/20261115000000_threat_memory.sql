-- Sentinel threat memory.
-- Accessed only from the server with the service role key. RLS is enabled with
-- no policies, so the anon and authenticated roles cannot read or write.

create table if not exists public.threats (
  id                     text primary key,
  fingerprint            text not null unique,
  attack_type            text not null check (attack_type in ('address-poisoning','unlimited-approval','malicious-permit','fake-dapp')),
  summary                text not null,
  indicator              text not null,
  status                 text not null default 'discovered' check (status in ('discovered','submitted','verified','rejected','failed')),
  reppo_eval_id          text unique,
  reppo_score            numeric,
  reppo_decision         text check (reppo_decision in ('accept','revise','reject')),
  reppo_route            text,
  discovered_at          timestamptz not null default now(),
  submitted_at           timestamptz,
  verified_at            timestamptz,
  caught_count           integer not null default 0,
  last_caught_at         timestamptz,
  reppo_packet           text,
  serv_recommends_submit boolean,
  external_sources       text[]
);

create index if not exists threats_indicator_idx on public.threats (indicator);
create index if not exists threats_status_idx on public.threats (status);
create index if not exists threats_discovered_at_idx on public.threats (discovered_at desc);

create table if not exists public.threat_events (
  id        text primary key,
  threat_id text not null references public.threats (id) on delete cascade,
  kind      text not null check (kind in ('discovered','submitted','verified','rejected','failed','caught')),
  at        timestamptz not null default now(),
  wallet_id text check (wallet_id in ('A','B')),
  detail    text not null
);

create index if not exists threat_events_threat_id_idx on public.threat_events (threat_id);
create index if not exists threat_events_at_idx on public.threat_events (at desc);

create table if not exists public.intel_sweeps (
  id                 text primary key,
  at                 timestamptz not null,
  totals             jsonb not null,
  new_domains        jsonb,
  new_addresses      jsonb,
  new_domain_count   integer,
  new_address_count  integer,
  community_reports  jsonb not null default '[]'::jsonb,
  errors             jsonb not null default '[]'::jsonb
);

create index if not exists intel_sweeps_at_idx on public.intel_sweeps (at desc);

alter table public.threats       enable row level security;
alter table public.threat_events enable row level security;
alter table public.intel_sweeps  enable row level security;

revoke all on public.threats, public.threat_events, public.intel_sweeps from anon, authenticated;

-- Atomic catch counter, so two users caught at the same moment both count.
create or replace function public.record_catch(p_threat_id text, p_at timestamptz)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.threats
     set caught_count = caught_count + 1,
         last_caught_at = p_at
   where id = p_threat_id;
$$;

revoke all on function public.record_catch(text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_catch(text, timestamptz) to service_role;
