# Sentinel front-end design spec

The single source of truth for the UI. Both build sessions follow it exactly.

## Direction

**Calm, trustworthy and human, for beginners who are scared of losing money.**
- **Primary reference:** a soft, editorial AI-companion landing page. It pairs a light grey-green canvas, a large light serif headline and one dark centred input box with quick-action chips. A speckled particle band dissolves into a dark lower section.
- **Secondary reference:** a technical SaaS page, used only for **detail styling**: monospace labels (`[N.01] > KEY VALUE`), numbered boxed cards (`// 001`), thin grid borders. Apply it to technical content only (reasoning traces, evidence IDs, Reppo eval IDs, the developer/API page).
- Reference images: `docs/design-references/primary-reference.jpg` and `secondary-reference.jpg` (internal only, not shipped in the app).
- **Style references only.** Use our own name, copy, colours and layout. Copy no branding, artwork or text.

## Stack (no hand-written HTML pages)

- **Framework:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4 (already installed).
- **Components:** **shadcn/ui** (Radix primitives) in `src/components/ui/*`.
- **Motion:** **Framer Motion (`motion`)**: the intercept moment, sheet/drawer reveals, timeline steps and number counters. Respect `prefers-reduced-motion`.
- **Data:** **TanStack Query** for all API calls, polling (Reppo status) and caching.
- **Icons:** **lucide-react**.
- **Fonts:** self-hosted via npm, so builds never fetch from the network:
  - `geist` (Geist Sans + Geist Mono) for body and mono
  - `@fontsource/instrument-serif` for display headlines
- **Particle band:** a typed React component on `<canvas>` 2D (requestAnimationFrame, devicePixelRatio aware, pauses offscreen and on reduced motion).
- **Typing:** every API response comes from `src/lib/types.ts` or the route's exported types. No `any`.

## Design tokens (Tailwind v4 `@theme` in `src/app/globals.css`)

| Token | Value | Use |
|---|---|---|
| `--color-canvas` | `#E8EBEA` | page background (top/light) |
| `--color-surface` | `#F4F6F5` | cards on light |
| `--color-ink` | `#1E2A28` | primary text, dark input box |
| `--color-ink-soft` | `#5B6865` | secondary text |
| `--color-deep` | `#26332F` | dark section background |
| `--color-deep-2` | `#2F3D39` | cards on dark |
| `--color-line` | `#D5DBD9` / dark `#3B4A46` | hairlines and grid |
| `--color-accent` | `#E59BD0` | particle highlights, focus ring |
| `--color-teal` | `#3D7A74` | links, neutral info |
| `--color-safe` | `#2F9E6E` | safe verdicts |
| `--color-risky` | `#D9475B` | dangerous verdicts |
| `--color-uncertain` | `#D99A2B` | suspicious / uncertain |
| `--color-pending` | `#7C6CD9` | Reppo pending |

- **Radius:** 14px for cards, 18px for the main input box, full for chips/pills.
- **Shadows:** one soft elevation for the input box (`0 20px 40px -20px rgb(30 42 40 / .45)`). Otherwise flat with hairlines.
- **Type scale:**
  - display serif 56/60 (mobile 38/42), weight 400, tracking -0.01em
  - section serif 36/40
  - body 15/24
  - labels: mono 11–12, uppercase, tracking 0.08em
- **Layout:** max width 1200px, 24px gutters (16px on phones), 8px spacing grid. Must work at 375px with no horizontal scroll.

## Pages and sections

### `/`: Home
1. **Nav:** wordmark "Sentinel" left; links `Check`, `Demo`, `Threat memory`, `Developers`; right "Try the demo" dark pill.
2. **Hero** (light canvas):
   - Serif headline, 2 lines: *"Know before you sign."* / *"Wallet safety that learns."*
   - Sub-line: "Sentinel explains risky crypto transactions in plain English, checks real scam databases, and gets smarter every time an attack is verified."
3. **Ask Sentinel box** (dark `ink`, centred, ~560px):
   - Placeholder: "Paste a wallet address, contract, or a suspicious link…"
   - Auto-detects input: a 0x address shows two choices, *Scan this wallet's approvals* and *Check this address*. Anything else is sent to `/api/check`. Messy chat text is fine, since the backend normalises it.
   - Chips under the text: `Scan my wallet`, `Check a link`, `Try the demo`; round submit button on the right.
   - Results open **below the box** in a large card (light), animated in.
4. **Threat field band:** the full-width particle canvas between the light and dark sections. Neutral dots are decorative; **highlighted pink/red dots = the real verified threats from `/api/feed`**, with a tiny mono caption: `● n verified attackers in Sentinel's memory` (real `count`).
5. **Dark section, "How Sentinel protects you":** five numbered cards in secondary-reference style (`// 001` … `// 005`): Rules → Live scam sources → SERV Reasoning → Reppo verification → Shared threat memory. One plain sentence each.
6. **Proof of learning strip** (dark): real numbers from `/api/stats`: threats discovered, Reppo verified, rejected, repeat attacks blocked, investigations avoided. Show the latest Reppo evaluations (eval ID mono, score, decision). **No invented numbers;** if a value is 0, show 0.
7. **Footer:** short "What's simulated vs real" note and the links.

### `/demo`: Two-wallet simulator (the judged demo)
- Two phone-style wallet cards side by side (stacked on mobile): **Ada (Lagos)** and **Bayo (Kano)**. Data and scenarios come from `src/lib/sim-data.ts` (`initialWallets`, `SCENARIOS`), with a "Simulated wallet" badge on each.
- Pick a scenario, then a review screen (send / approve / sign), then **Confirm**. A "Sentinel is checking…" state calls `POST /api/analyze`.
- **Intercept moment** (risky/uncertain): the phone shows "Sentinel paused this", and the **Analysis panel** slides in (right on desktop, bottom sheet on mobile):
  - verdict pill + one-line headline + plain explanation
  - **Evidence list**: each claim with a source badge (`Rules`, `Chain`, `GoPlus`, `ScamSniffer`, `MetaMask`, `Threat memory`, `Reppo`) and an external link when there is one
  - **Reasoning trace**: mono, numbered, collapsible
  - **Safe fix** button (e.g. "Send to the real Chidi instead", which re-runs the analysis with the corrected address → safe → "Sent" success)
  - **Ask a follow-up** chat (`POST /api/ask`)
  - **Reppo card**: when `shouldSubmitToReppo`, a "Verify with Reppo" button calls `POST /api/reppo/submit`, then polls `GET /api/reppo/status?threatId=` every 15 s. It shows *Pending at Reppo (usually a few minutes)*, then *Verified · score 96 · accept* or *Rejected · score 65*, with real values only.
  - When `matchedThreatId` is set: a "Caught from verified threat memory" banner showing **0 AI calls**, the latency, and the Reppo eval that verified it.
- Safe actions go straight to "Sent ✓".
- A small "Reset demo" control (client state only).

### Result components (shared by `/` and `/demo`)
- `VerdictHeader`, `EvidenceList`, `ReasoningTrace`, `SafeFixButton`, `AskSentinel`, `ReppoStatusCard`, `MemoryCatchBanner`, `CheckResult` (for `/api/check`) and `WalletScanReport` (for `/api/scan/wallet`):
  - the scanner's summary headline
  - `riskCounts` as a segmented bar
  - the **top 10** approvals: token, spender name or short address, risk pill, reasons, "disputed" note when present
  - a **Revoke** action that shows the prepared transaction (`to`, `data`) with copy buttons and the text "You sign this in your own wallet. Sentinel never moves funds."
  - the coverage/limitations block in a muted mono box

### `/memory`: Threat memory timeline
Restyle the existing page to the new system: vertical timeline per threat (discovered → submitted → rejected/verified → caught), mono eval IDs, status pills, real timestamps.

### `/developers`: Threat intelligence API (revenue story)
Secondary-reference style: mono, grid, numbered sections. It covers `GET /api/feed` (live preview of the real response), `?indicator=` / `?domain=`, `GET /api/stats`, `POST /api/check`, `POST /api/scan/wallet`, with curl examples and "Free tier now · API keys for wallets, exchanges and dApps."

## Behaviour rules
- **Honesty:** never show a number the API didn't return. Simulated data is always labelled. Errors show the API's message.
- **States:** every request has loading (skeleton or shimmer), empty, error and success states.
- **Rate limits:** on a 429, show "Too many requests, try again in Ns" using `Retry-After`.
- **Accessibility:** visible focus ring (`accent`), labels on inputs, colour never the only signal (icon + text on verdicts), contrast AA.
- **Performance:** no layout shift on result reveal; particle canvas ≤ 4ms per frame; images/icons inline SVG.
- **Copy voice:** short, warm, beginner-friendly English. No jargon without a one-line explanation.

## File ownership
- **pro1:** foundation (`globals.css` tokens, fonts, `src/components/ui/*` via shadcn, `src/app/layout.tsx`, `src/components/site/*` nav/footer, `src/app/providers.tsx` QueryClient), `/` (`src/app/page.tsx`, `src/components/home/*` incl. threat field + Ask box shell), `/memory`, `/developers`.
- **max1:** typed API client + hooks (`src/lib/client/*`), all result components (`src/components/sentinel/*`), `/demo` (`src/app/demo/*`, `src/components/demo/*`).
- **Contract between them:** the Ask box (pro1) renders `<CheckResult input=… />` or `<WalletScanReport address=… />` from `@/components/sentinel`. Until max1's version lands, pro1 uses a temporary placeholder with the same props.
