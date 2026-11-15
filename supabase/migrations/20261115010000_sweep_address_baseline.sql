-- Persist the ScamSniffer address list from the latest sweep, so the next sweep
-- can report newly listed addresses even after a cold start. Only the most
-- recent sweep keeps its list (older rows are cleared by the app).
-- Domains (~360k) are not stored; their count is already in `totals`.

alter table public.intel_sweeps
  add column if not exists scamsniffer_addresses text[];

create index if not exists intel_sweeps_baseline_idx
  on public.intel_sweeps (at desc)
  where scamsniffer_addresses is not null;
