# Sentinel

**Learns from the first user's attack, gets it verified through Reppo, then protects the next person.**

Sentinel is a wallet safety agent for people new to crypto. Before you send funds or sign something, Sentinel checks the action, tells you in plain English whether it is safe or risky, shows the evidence behind that answer, and offers a safe fix: use the correct address, cancel, revoke or reduce an allowance.

When Sentinel finds a new attacker, it does not just warn one person. The finding goes to **Reppo** for independent verification. Once Reppo accepts it, the attacker is stored in a shared **threat memory**, and the next user who meets the same attacker is blocked instantly. A daily sweep also gathers new threats from public sources.

Built for **SERV Hackathon 02, Reppo track**.

---

## The loop, live

This is the real run on the deployed app, read back from the Supabase `threats` and `threat_events` tables (15 Nov 2026, UTC):

| Time | Event |
|---|---|
| 14:15:05 | Ada (wallet A) meets the USDT-rewards drainer `0x4341…a67b` on `usdt-rewards.xyz`. Rules flag a permit; GoPlus and ScamSniffer both list the spender. Threat discovered. |
| 14:15:07 | Sent to Reppo, eval `cmwhx2cwc000008l8u5dc3t9a`. |
| 14:18:14 | Reppo: **reject, 65/100**. Not added to threat memory. |
| | Fixes from that feedback: the evidence packet now discloses what is simulated, includes the safe fix and the source-independence caveats, and Sentinel's confidence is calibrated. |
| 14:24:47 | Resubmitted (the one allowed retry), eval `cmwhxesn0000107jtf2a6m7ry`. |
| 14:31:16 | Reppo: **accept, 96/100** (Reppo reported low confidence). Added to threat memory. |
| 14:31:17 | Bayo (wallet B) meets the same drainer on a different site, `usdt-erc20.network`. **Blocked from threat memory before signing, with no SERV call and no source lookups.** |

`GET /api/stats` returns these counts and evaluations live, and `GET /api/feed` returns the verified threat.

## The problem

Beginners lose money to attacks that look like normal wallet actions:

- **Address poisoning.** An attacker sends you a tiny "dust" transfer from an address that looks like one you use. Later you copy the "recent" address from your history and send your funds to the attacker.
- **Approval and permit drains.** A fake dApp asks for an unlimited token approval or an off-chain `permit` signature. One click lets the attacker take every token of that type, now or months later.
- **Warnings nobody understands.** Existing warnings say things like "unverified contract, `setApprovalForAll`, EIP-712 typed data". Beginners don't understand them, so they click through.

Sentinel turns those signals into one short sentence a beginner understands, plus a button that does the safe thing.

## How it works

```
Wallet action (send / approve / permit / connect)
  ├─ 1. Rule engine        deterministic checks, no AI
  ├─ 2. Threat memory      Reppo-verified attacker? → blocked instantly
  ├─ 3. Intel sources      GoPlus, ScamSniffer, MetaMask list, web reports
  ├─ 4. SERV Reasoning     verdict, plain-language explanation, trace, Reppo decision
  └─ 5. New threat saved   with a server-built evidence packet for Reppo
```

Full detail is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## How Sentinel uses SERV Reasoning

SERV Reasoning is the brain (model `gpt-6-luna` by default, set with `SERV_MODEL`). It is called at most once per analysis and receives the rule-engine findings and the intel gathered from external sources. It returns:

- **Analysis:** what kind of attack this is, if any (address poisoning, unlimited approval, malicious permit, fake dApp).
- **Verdict:** `safe`, `risky` or `uncertain`, with a confidence score.
- **Plain-language explanation:** a short headline and explanation a beginner can act on.
- **Step-by-step trace:** an auditable list of reasoning steps that cites the evidence it used (rules, GoPlus, ScamSniffer, MetaMask, web reports).
- **Q&A:** follow-up questions about an analysis go to SERV through `POST /api/ask` ("Why is this dangerous?", "What does revoke mean?").
- **Reppo decision:** SERV decides whether a new attack is worth sending to Reppo for verification, and says why.

SERV is only called when there is something to reason about:

- **Skipped for clean sends to saved contacts.** If the recipient matches a saved contact exactly, the rules find nothing and no source flags it, the answer is deterministic.
- **Skipped for known attackers.** A Reppo-verified match in threat memory is blocked before SERV and before any source lookup.
- **Cached.** The same action with the same evidence reuses SERV's answer for an hour.
- **Capped.** A daily budget (`SERV_MAX_CALLS_PER_DAY`, default 300) limits spend on the public demo. Past the cap, results are labelled rules + sources.

The public API is protected by input validation and per-client rate limits (for example 20 analyses and 5 Reppo submissions per minute).

If SERV is unreachable, the response is clearly labelled as a rules + sources result. AI output is never faked.

## Intel sources

| Source | What it provides |
|---|---|
| **GoPlus Security API** | Address reputation and phishing-site checks |
| **ScamSniffer database** | Open-source lists of scam addresses and phishing domains |
| **MetaMask phishing list** | Open-source phishing-domain blacklist |
| **Web community reports** | Reddit, YouTube, X and security-blog reports, through web search (Tavily or Brave) |
| **Daily sweep** | A Vercel Cron job (`/api/intel/sweep`) refreshes the blocklists, records newly listed scam domains and addresses, and pulls fresh community reports |

Lookups run in parallel with 5-second timeouts. Sources that are not configured or that fail are reported as unavailable, never hidden.

## How Reppo verification works

1. Sentinel discovers a new attacker. The server builds an evidence packet from the rule findings and the external sources. The client cannot supply or change the payload.
2. If SERV recommends verification and the verification rule below is met, the packet goes to Reppo (`POST /api/reppo/submit`).
3. Reppo scores the submission with a panel of evaluators and answers in **minutes**. In the live run above, it took about 3 and 6½ minutes. While it waits, the threat shows as *pending*. Sentinel trusts Reppo's `accept` decision; a `block` route always rejects.
4. `GET /api/reppo/status` polls Reppo and moves the threat along its timeline:
   - **accept** → the threat is **verified** and enters threat memory.
   - **revise / reject** → the threat is **rejected** and is not trusted. It can be **resubmitted once**, after a new analysis refreshes its evidence packet. A second rejection is final.
   - failure → the threat is marked **failed** and can be resubmitted.
5. The next user who meets a verified attacker is blocked before signing, with no AI call and no lookups needed.

A demo safety cap (`REPPO_MAX_SUBMISSIONS`) limits how many evaluations the public demo can spend.

### Verification rule

A threat enters threat memory only when all three checks pass:

1. **Rule-engine evidence**
2. **At least one independent external source** (GoPlus, ScamSniffer, MetaMask or a web report)
3. **A Reppo `accept` verdict**

## Honesty notes

- The two wallets (their owners, balances, history and contacts) are **simulated**. The address-poisoning lookalike address is **simulated** too.
- The **attacker indicators** in the other scenarios are **real entries from public scam lists**.
- The **SERV, Reppo, GoPlus, ScamSniffer, MetaMask and web-search calls are real**. Verdicts, Reppo scores and sweep numbers come from those live calls.
- `GET /api/health` shows which real services are connected, and whether threat memory is on Supabase or the in-memory fallback.

## Track

**Reppo.** Reppo is the independent check between "one user saw something suspicious" and "every user is protected from it".

## Stack

- **Next.js 15** (App Router, API routes) with React 19 and Tailwind CSS 4
- **SERV Reasoning** through an OpenAI-compatible client
- **Reppo Evaluation API**
- **Supabase** (Postgres) for threat memory: `threats`, `threat_events` and `intel_sweeps` tables. The server connects with the public **publishable key plus a server-only secret** (`SENTINEL_DB_KEY`), sent as an `x-sentinel-key` header. RLS policies allow access only when that header's SHA-256 matches a hash stored in a private schema (migration `20261115020000_app_key_access.sql`). A browser holding only the publishable key gets nothing. The service role key is not needed.
- **Vercel** for hosting and the daily cron sweep

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the keys you have
npm run dev                  # http://localhost:3000
```

Environment variables (see [`.env.example`](.env.example)):

| Variable | Purpose |
|---|---|
| `SERV_API_KEY`, `SERV_MODEL` | SERV Reasoning (default model `gpt-6-luna`) |
| `SERV_MAX_CALLS_PER_DAY` | Daily SERV budget (default 300) |
| `REPPO_API_KEY` | Reppo Evaluation API |
| `REPPO_MAX_SUBMISSIONS` | Safety cap on demo evaluations |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SENTINEL_DB_KEY` | Threat memory: public key plus the server-only secret checked by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional alternative to the two keys above |
| `TAVILY_API_KEY` or `BRAVE_API_KEY` | Web search for community reports |
| `CRON_SECRET` | Protects the scheduled intel sweep |

Every key is optional for local dev. Without Supabase, threat memory falls back to an in-process store that resets on restart. Without SERV, analyses are labelled as rules + sources only.

To set up the database, run the SQL in [`supabase/migrations/`](supabase/migrations) against your Supabase project (SQL editor or `supabase db push`). Then store the hash of your `SENTINEL_DB_KEY` (outside git): `insert into private.app_key (secret_hash) values (encode(sha256(convert_to('<your key>', 'UTF8')), 'hex'));`

Keys live only in environment variables. They never appear in code, commits, prompts or client bundles.

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
| `GET /api/feed` | Reppo-verified threat feed; `?indicator=0x…` or `?domain=…` lookup |
| `GET /api/stats` | Learning analytics, counted from stored threats and events |
| `GET /api/health` | Which real services are connected (never key values) |

## Verified threat feed (the paid product)

`GET /api/feed` is what wallets, exchanges and dApps would pay for. It returns **only Reppo-verified threats**, never discovered or rejected ones.

```bash
curl https://sentinel-three-cyan.vercel.app/api/feed
curl "https://sentinel-three-cyan.vercel.app/api/feed?indicator=0x43412801d29861ecc4c4d86e5becfd16af86a67b"
curl "https://sentinel-three-cyan.vercel.app/api/feed?domain=usdt-rewards.xyz"
```

Each entry includes:
- `indicator`, `attackType`, `summary`, and `domain` (the site the attack was served from)
- `firstSeen` and `verifiedAt`
- `reppo`: `evalId`, `score` and `decision`
- `externalSources` (for example `goplus`, `scamsniffer`)
- `timesCaught` and `lastCaughtAt`

The server-built evidence packet sent to Reppo is never returned. Responses are cacheable for 60 seconds. It is a free tier today; API keys and usage tiers come later.

## Learning analytics

`GET /api/stats` reports what the learning loop has actually done. Every number is counted from the `threats` and `threat_events` tables:
- threats by status: discovered, submitted, verified, rejected, failed
- Reppo submissions, resubmissions, and the latest evaluations with eval ID, decision and score
- **repeat attacks blocked from memory**. Each one is a repeat investigation avoided, because it skipped SERV and every source lookup.

There is deliberately **no catch rate**. That would need a labelled benchmark set, which Sentinel does not have.

## Revenue

Sentinel is **free for users**. Wallets, exchanges and dApps pay for:

- the **verified threat feed** (`/api/feed`): Reppo-verified attackers, with evidence, as an API or stream
- the **explainer API**: plain-language risk explanations to show their own users before they sign

## Roadmap

- **More languages:** Nigerian Pidgin, Hausa and Yorùbá (the types already reserve them)
- **Voice:** spoken warnings and questions for users who prefer audio
- **Browser extension:** check real transactions inside any wallet before signing
- **Real-time alerts:** notify users when an address or approval they hold is newly flagged
