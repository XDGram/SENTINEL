# Sentinel architecture

Sentinel checks a wallet action **before** it is signed. It explains the risk in plain language and backs every claim with evidence. New attacks are verified through Reppo, and verified attackers are stored in a shared threat memory that protects the next user instantly.

## Request pipeline: `POST /api/analyze`

```
Wallet action (send / approve / permit)
  │
  ├─1─ Rule engine            src/lib/rules.ts          deterministic, no AI
  │      lookalike addresses, dust bait, unlimited approvals,
  │      permit signatures, brand-lookalike domains
  │
  ├─2─ Threat memory          src/lib/store.ts          Supabase
  │      Reppo-verified attacker? → block instantly (no AI call, no lookups),
  │      write a "caught" event
  │
  ├─3─ Intel gathering        src/lib/intel/*           parallel, cached, 5s timeouts
  │      GoPlus Security API      address + phishing-site reputation
  │      ScamSniffer database     scam addresses + phishing domains (open source)
  │      MetaMask phishing list   phishing domains (open source)
  │      Web search               community reports: Reddit, YouTube, X, security blogs
  │
  │    Clean send to a saved contact (no findings, no flags)? → safe, no SERV call
  │
  ├─4─ SERV Reasoning         src/lib/serv.ts           at most one call per analysis
  │      model gpt-6-luna (SERV_MODEL); 1-hour result cache;
  │      daily cap SERV_MAX_CALLS_PER_DAY (default 300) in src/lib/guard.ts
  │      reads rules + intel → verdict (safe / risky / uncertain),
  │      plain-language explanation, step-by-step trace citing evidence,
  │      decides whether this new attack should go to Reppo
  │
  └─5─ Discovered threat saved with a server-built evidence packet
```

If SERV is unreachable or the daily cap is reached, the response is a clearly labelled rules + sources result. AI output is never faked.

**Guards** (`src/lib/guard.ts`). Request bodies are validated, and each client is rate-limited per minute: analyze 20, ask 10, Reppo submit 5, feed and stats 60. Limits are kept per server instance, so they are best effort on serverless.

## Learning loop

```
User A meets a new attacker
  → rules flag it, sources corroborate it, SERV recommends verification
  → POST /api/reppo/submit      Reppo evaluator panel, PENDING (minutes)
  → GET  /api/reppo/status      SETTLED: accept → VERIFIED → threat memory
                                          reject / block → REJECTED (not trusted)
  → REJECTED may be resubmitted ONCE, after re-analysis refreshes the packet;
    a second rejection is final
User B meets the same attacker (different site, same drainer)
  → threat memory match → blocked instantly
```

**Verification policy.** A threat enters memory only after three checks pass:
1. Rule-engine evidence.
2. At least one independent external source.
3. A Reppo `accept` verdict.

The payload sent to Reppo is built on the server. Clients can't submit arbitrary content or burn credits.

### Live result (from Supabase `threats` and `threat_events`, 15 Nov 2026 UTC)

```
14:15:05  discovered   wallet A, spender 0x4341…a67b via usdt-rewards.xyz
                       (GoPlus + ScamSniffer flag it)
14:15:08  submitted    eval cmwhx2cwc000008l8u5dc3t9a
14:18:14  rejected     reject, score 65/100
          fixes: packet discloses simulation, includes the safe fix and
          source-independence caveats; confidence calibrated
14:24:48  submitted    eval cmwhxesn0000107jtf2a6m7ry  (the one allowed resubmit)
14:31:16  verified     accept, score 96/100 (Reppo: low confidence)
14:31:18  caught       wallet B (Bayo), same drainer on usdt-erc20.network:
                       blocked from memory, no SERV call, no source lookups
```

## Threat memory storage

Supabase Postgres holds the `threats`, `threat_events` and `intel_sweeps` tables (migrations in `supabase/migrations/`).

**Access** (`20261115020000_app_key_access.sql`). The server uses the public publishable key (`SUPABASE_PUBLISHABLE_KEY`) and sends a server-only secret (`SENTINEL_DB_KEY`) as the `x-sentinel-key` header.
- RLS policies on all three tables call `sentinel_request_ok()`. That function compares the header's SHA-256 with a hash stored in `private.app_key`.
- A request carrying only the public key, such as one from a browser, sees and changes nothing.
- The hash is inserted outside migrations, so no secret is in git.
- `SUPABASE_SERVICE_ROLE_KEY` still works as an alternative.

Without either, the app falls back to an in-process store, for local dev only.

## Verified threat feed: `GET /api/feed`

The product wallets, exchanges and dApps would pay for (free tier now; API keys later).
- Returns **only `verified` threats**: indicator, attack type, summary, domain, first seen, verified at, Reppo eval ID/score/decision, external sources, times caught.
- `?indicator=0x…` matches spender or address indicators. `?domain=` matches the attack's site and its subdomains.
- The site is read on the server from the evidence packet. **The packet itself is never returned.**
- `Cache-Control` allows 60 seconds of caching.

## Learning analytics: `GET /api/stats`

Every number is counted from `threats` and `threat_events`:
- threats by status
- Reppo submissions, threats submitted, and resubmissions (submissions minus distinct threats)
- verified, rejected and failed results
- latest evaluations, each submit paired with its settlement, with eval ID, decision and score
- repeat attacks blocked from memory, which equals `caught` events, equals repeat investigations avoided (each skipped SERV and all source lookups)

No catch rate is reported: there is no labelled benchmark to compute one against.

## Active intel gathering: `/api/intel/sweep`

A Vercel Cron job runs the sweep daily (see `vercel.json`, which is protected by `CRON_SECRET`). Each run:
- Refreshes the ScamSniffer and MetaMask blocklists.
- Records newly listed scam domains and addresses since the previous sweep.
- Pulls fresh community reports of wallet attacks.

Without the secret, the endpoint only lists past sweeps.

## API

| Route | Purpose |
|---|---|
| `POST /api/analyze` | Full pipeline for one wallet action |
| `POST /api/ask` | Follow-up question about an analysis (SERV) |
| `POST /api/reppo/submit` | Send a discovered threat to Reppo (server-gated) |
| `GET /api/reppo/status?threatId=` | Poll Reppo and advance the threat timeline |
| `GET /api/threats` | Threat memory and timeline events |
| `GET /api/intel/check?q=` | Look up an address or domain in the public sources |
| `GET /api/intel/sweep` | Past sweeps; with the cron secret, run one |
| `GET /api/feed` | Reppo-verified threat feed; `?indicator=` / `?domain=` lookup |
| `GET /api/stats` | Learning analytics from stored threats and events |
| `GET /api/health` | Which real services are connected (never key values) |

## Data honesty

The two wallets, their balances, history and contacts are **simulated**. The address-poisoning lookalike is simulated too.

The **attacker indicators** in the other scenarios are real entries from public scam databases. That includes the second new-attacker scenario, `a-airdrop`: spender `0x7fb2…4f41` (ScamSniffer and GoPlus) on `chainsairdrop.com` (GoPlus, ScamSniffer and MetaMask), all checked through `/api/intel/check`. This means the GoPlus, ScamSniffer, MetaMask, SERV and Reppo calls are all real.

## Secrets

All keys are server-side env vars (see `.env.example`). They never appear in prompts, client code or the repo.
