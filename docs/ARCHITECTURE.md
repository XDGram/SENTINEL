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
  │      Reppo-verified attacker? → block instantly (no AI call, no lookups)
  │
  ├─3─ Intel gathering        src/lib/intel/*           parallel, cached, 5s timeouts
  │      GoPlus Security API      address + phishing-site reputation
  │      ScamSniffer database     scam addresses + phishing domains (open source)
  │      MetaMask phishing list   phishing domains (open source)
  │      Web search               community reports: Reddit, YouTube, X, security blogs
  │
  ├─4─ SERV Reasoning         src/lib/serv.ts           one call per analysis
  │      reads rules + intel → verdict (safe / risky / uncertain),
  │      plain-language explanation, step-by-step trace citing evidence,
  │      decides whether this new attack should go to Reppo
  │
  └─5─ Discovered threat saved with a server-built evidence packet
```

If SERV is unreachable, the response is a clearly labelled rules + sources result. AI output is never faked.

## Learning loop

```
User A meets a new attacker
  → rules flag it, sources corroborate it, SERV recommends verification
  → POST /api/reppo/submit      Reppo evaluator panel, PENDING (usually 30–90 s)
  → GET  /api/reppo/status      SETTLED: accept → VERIFIED → threat memory
                                          reject / block → REJECTED (not trusted)
User B meets the same attacker (different site, same drainer)
  → threat memory match → blocked instantly
```

**Verification policy.** A threat enters memory only after three checks pass:
1. Rule-engine evidence.
2. At least one independent external source.
3. A Reppo `accept` verdict.

The payload sent to Reppo is built on the server. Clients can't submit arbitrary content or burn credits.

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
| `GET /api/health` | Which real services are connected (never key values) |

## Data honesty

The two wallets, their balances, history and contacts are **simulated**. The address-poisoning lookalike is simulated too.

The **attacker indicators** in the other scenarios are real entries from public scam databases. This means the GoPlus, ScamSniffer, MetaMask, SERV and Reppo calls are all real.

## Secrets

All keys are server-side env vars (see `.env.example`). They never appear in prompts, client code or the repo.
