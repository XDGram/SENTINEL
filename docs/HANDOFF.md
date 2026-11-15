# Handoff: Watchdog (SERV Hackathon 02, Reppo track)

Deadline: **Nov 15 2026, 23:59 UTC**. Target submission ~22:00 UTC.

## Where things are
- Live site: https://watchdog-reppo.vercel.app (Vercel project `watchdog`, team `timeb7208-5361s-projects`, team id `team_aehGbVQxuk4rXpTFzXyLre8R`).
- Repo: `XDGram/WatchDog` (public). Work branch `claude/admiring-galileo-9rshh0`; **production deploys from `main`** (push the branch to `main` with a fast-forward after every finished change).
- Supabase project `gnnxxsifynkngdsbrbix` (threat memory). Server access is publishable key + server secret header checked by RLS (migration `20261115020000_app_key_access.sql`). No service key is used.
- Docs: `README.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`.

## What's built (all live, real data)
- Pipeline: rules → threat memory → live sources (GoPlus, ScamSniffer, MetaMask, optional web) → SERV Reasoning (`gpt-6-luna`) → Reppo verification → shared memory. Guards: rate limits, daily SERV cap, caching.
- Real Reppo results so far: eval `cmwhx2cwc000008l8u5dc3t9a` reject 65 → fixed evidence → `cmwhxesn0000107jtf2a6m7ry` accept 96 → Bayo blocked from memory with 0 AI calls. Later `cmwi058a0000008kzsazo8fz9` accept 100.
- Pages: `/` landing (hero + Ask box, living debris band, illustrated threats, auto-playing How it works, animated learning-loop relay, proof numbers), `/dashboard` (bento: wallet approvals, threat radar, donut, learning, activity, report), `/demo` (two Phantom-style wallets, fresh real drainer per run from `DRAINER_POOL` in `src/lib/sim-data.ts`), `/memory`, `/developers` (threat-feed API = revenue story).
- APIs: `/api/analyze`, `/api/ask`, `/api/check`, `/api/scan/wallet`, `/api/reppo/submit|status`, `/api/threats`, `/api/feed`, `/api/stats`, `/api/intel/check|sweep`, `/api/health`.
- 45 tests (`npm test`), lint, build all pass.

## Design rules the owner insisted on
- **Black and white** UI (white/off-white canvas, true black, neutral greys); colour only for meaning (red danger, amber caution, green safe). Keep it monochrome.
- One typeface throughout: **Geist**. Display headlines are Geist Bold (700, tracking -0.035em, always upright); body and mono labels are Geist too. Background: fine drifting dot grid.
- **No italics.** Display and body type stay upright everywhere.
- Use **Uiverse.io (MIT) elements** where possible, restyled; credit in README.
- Ambient motion always plays (owner's device uses reduced motion).
- Demo wallets look **Phantom-style** but never use Phantom's name/logo.

## Owner's working rules (important)
- **Do not write code until the owner says "go ahead".** Explain the plan first. Don't over-ask either; propose concrete defaults.
- Commits: author `0xDGraM-Dev <timeb7208@gmail.com>`; **no Co-Authored-By, no AI attribution** anywhere.
- Never commit secrets. Keys go into Vercel env vars only (the Vercel MCP connector can create/edit env vars; it cannot delete them).
- Every number shown must come from real data; label simulated parts.

## Next tasks (in order)
1. **Voice (approved plan, waiting for "go ahead")** using **ai33pro** with voice **Bella** (`elevenlabs_hpp4J3VqNfWAUOO0d1Us`).
   - API v3: `POST https://api.ai33.pro/v3/text-to-speech` multipart form: `text`, `voice_id`, `speed` (0.5–1.5), header `xi-api-key`. Returns `{ success, task_id }`. Poll `GET https://api.ai33.pro/v1/task/{task_id}` until `status` is `done`; audio is at `metadata.audio_url`. Female voices: `GET /v3/voices?provider=elevenlabs&gender=Female`.
   - Measured: ~9–12 s for ~35 words, ~212 credits (~1 credit/char). Python urllib was blocked (403), curl/fetch worked.
   - Plan: server route `/api/voice` (key server-only as `AI33_API_KEY` in Vercel), speak headline + one short sentence, start generating when the verdict arrives, cache per text (Supabase or memory), rate limit + daily cap, auto-speak on pause with mute toggle, Listen button on results, Ask answers read aloud, mic via browser SpeechRecognition (Chrome/Edge/Safari), fallback to browser speechSynthesis on failure.
   - The owner will give the ai33pro key directly (do not commit it).
2. **Tagline**: owner hasn't picked yet. Recommended: "One wallet gets attacked. / Every wallet gets protected." Sub-line: "Watchdog stops risky crypto transactions before you sign, explains them in plain English, and turns every verified attack into protection for everyone." Update hero, page title, README.
3. **README refresh** for the Watchdog name, voice, dashboard, Phantom-style demo, drainer pool.
4. **Demo video script** (~2 min), **X post** draft, then the owner submits at openserv.typeform.com/submissions02 with the X post link.

## Local dev
`npm i && npm run dev`. To hit real services locally set in the shell (not in files): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `WATCHDOG_DB_KEY`, `SERV_API_KEY`, `SERV_MODEL=gpt-6-luna`, `ETHERSCAN_API_KEY`. Without them it runs in memory/rules-only mode.
