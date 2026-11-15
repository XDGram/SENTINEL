# Sentinel

**Learns from the first user's attack, gets it verified through Reppo, then protects the next person.**

Sentinel is a wallet safety agent for people new to crypto. Before you send funds or sign something, Sentinel checks the action, tells you in plain English whether it is safe or risky, shows the evidence behind that answer, and offers a safe fix: use the correct address, cancel, revoke or reduce an allowance.

When Sentinel finds a new attacker, it does not just warn one person. The finding goes to **Reppo** for independent verification. Once Reppo accepts it, the attacker is stored in a shared **threat memory**, and the next user who meets the same attacker is blocked instantly. A daily sweep also gathers new threats from public sources.

Built for **SERV Hackathon 02, Reppo track**.

---

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

SERV Reasoning is the brain. It is called once per analysis and receives the rule-engine findings and the intel gathered from external sources. It returns:

- **Analysis:** what kind of attack this is, if any (address poisoning, unlimited approval, malicious permit, fake dApp).
- **Verdict:** `safe`, `risky` or `uncertain`, with a confidence score.
- **Plain-language explanation:** a short headline and explanation a beginner can act on.
- **Step-by-step trace:** an auditable list of reasoning steps that cites the evidence it used (rules, GoPlus, ScamSniffer, MetaMask, web reports).
- **Q&A:** follow-up questions about an analysis go to SERV through `POST /api/ask` ("Why is this dangerous?", "What does revoke mean?").
- **Reppo decision:** SERV decides whether a new attack is worth sending to Reppo for verification, and says why.

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
3. Reppo allows **one pending evaluation at a time**. Each evaluation settles after a **settlement window** (`REPPO_SETTLEMENT_MINUTES`, about 10–30 minutes in practice). While it waits, the threat shows as *pending*.
4. `GET /api/reppo/status` polls Reppo and moves the threat along its timeline:
   - **accept** → the threat is **verified** and enters threat memory.
   - **revise / reject** → the threat is **rejected** and is not trusted.
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
- **Supabase** (Postgres) for threat memory: `threats`, `threat_events` and `intel_sweeps` tables, with RLS enabled and no public policies. It is accessed only from the server with the service role key.
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
| `SERV_API_KEY`, `SERV_MODEL` | SERV Reasoning |
| `REPPO_API_KEY` | Reppo Evaluation API |
| `REPPO_SETTLEMENT_MINUTES` | Reppo settlement window |
| `REPPO_MAX_SUBMISSIONS` | Safety cap on demo evaluations |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Threat memory (server-side only) |
| `TAVILY_API_KEY` or `BRAVE_API_KEY` | Web search for community reports |
| `CRON_SECRET` | Protects the scheduled intel sweep |

Every key is optional for local dev. Without Supabase, threat memory falls back to an in-process store that resets on restart. Without SERV, analyses are labelled as rules + sources only.

To set up the database, run the SQL in [`supabase/migrations/`](supabase/migrations) against your Supabase project (SQL editor or `supabase db push`).

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
| `GET /api/health` | Which real services are connected (never key values) |

## Revenue

Sentinel is **free for users**. Wallets, exchanges and dApps pay for:

- the **verified threat feed**: Reppo-verified attackers, with evidence, as an API or stream
- the **explainer API**: plain-language risk explanations to show their own users before they sign

## Roadmap

- **More languages:** Nigerian Pidgin, Hausa and Yorùbá (the types already reserve them)
- **Voice:** spoken warnings and questions for users who prefer audio
- **Browser extension:** check real transactions inside any wallet before signing
- **Real-time alerts:** notify users when an address or approval they hold is newly flagged
