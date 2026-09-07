# Demo script — live public dashboard

One ~3 minute walkthrough on the real, deployed dashboard
(`https://dashboard-production-e04a.up.railway.app`) — no localhost, no
mocked data. Everything on screen is a real testnet transaction. This
script replaces `script.md` (that one assumed local dev + old micro-cent
prices; providers now price $0.5–$2/call and a real Hedera feedback bug
found tonight is fixed).

Each line is what to say. `[bracketed instructions]` are what to do.

---

## 0:00–0:20 — Open on the pitch

[Open `https://dashboard-production-e04a.up.railway.app/` in a browser,
full screen. Let the pitch card at the top be visible before talking.]

"This is Agent Bazaar. It's an AI agent that shops a live marketplace on
its own — it finds paid APIs, decides which one is worth the money, pays
for it with real crypto on testnet, and leaves a review on-chain. No
human clicks anything during the actual purchase."

[Point at the 3-step card: Sellers / Discovery / The buyer.]

"Two providers here are ours — a Hedera-rail one and an Arc-rail one.
Discovery runs through The Graph's Agent0 subgraph. The buyer is a
Claude-powered agent."

---

## 0:20–0:45 — The marketplace is real, not staged

[Scroll to "Our sellers (2)".]

"These two — Bazaar Market Intel on Hedera, Bazaar Task Runner on Arc —
are the ones we built. Both are live services, not fixtures — you can see
their reputation scores, real numbers from real purchases."

[Point at the reputation column: Arc 90/100 (1), Hedera 57/100 (3).]

[Scroll to "Other agents on The Graph (14)", point at the paginated
table.]

"Everything below is discovery working for real — 14+ agents other
hackathon builders registered on the same public subgraph, that we did
nothing to add. One GraphQL query finds all of it, ours and everyone
else's, across two chains."

---

## 0:45–1:45 — Run a live trade

[Switch to a terminal. Have this ready to paste:]

```bash
DOTENV_CONFIG_PATH=/path/to/repo/.env pnpm --filter buyer-agent start \
  "Find the Arc provider that sells task-running services. Buy its summarise endpoint and its classify-risk endpoint, then leave feedback." \
  --budget 2
```

"I'm running the buyer agent from my own laptop, right now, targeting
the real deployed providers. It gets a $2 budget and a plain-English
task — nothing else."

[Run it. While it runs, narrate the visible steps as they print:]

"It's discovering providers through the subgraph... ranking them by
price and reputation... now it's paying — that's a real $1 payment
settling through Circle's Gateway on Arc testnet, gas paid in USDC
since Arc uses USDC as its native gas token."

[If the live run is flaky on stage, cut to the pre-recorded proof: a
real $1.50 trade from tonight —
`https://testnet.arcscan.app/tx/2a073749-9f2b-4c6f-9ea3-3964b26cd483`
(summarise, $1) and
`https://testnet.arcscan.app/tx/33fc612c-4037-4c44-b1dc-3ff3d304e17a`
(classify-risk, $0.50) — and say "here's one I ran earlier, same
flow."]

---

## 1:45–2:15 — Watch it live on the dashboard

[Switch back to the browser, go to `/agent`.]

"This is the same run, streamed live — every tool call the LLM makes,
with its actual reasoning, not a canned script."

[Point at a recent entry, expand "tool input / result" on one.]

"This is real: the model's own words, the real HTTP call it made, the
real response. If you refresh this page from anywhere in the world right
now, you'd see the same thing — this data lives in a shared Postgres
database, not on my laptop."

---

## 2:15–2:45 — Reputation closes the loop

[Go to `/provider/base-sepolia/9180` (the Arc provider's detail page).]

"After a purchase, the agent posts a score to the ERC-8004 Reputation
Registry on-chain. This page reads that directly from the subgraph — not
a local record. That reputation is what the *next* buyer run uses to
decide who to trust."

[Point at "On-chain feedback" table with the real score.]

"We actually hit a real bug finding this — the agent was posting
feedback to the wrong chain, because it confused 'which rail settled the
payment' with 'which chain the identity is registered on.' Fixed it
tonight; you can see the real transaction that proves it now works:
`0x63a7ac676a2be1f2249bd7ced11502d9ce0a5ff235b9c729f5a68c364eeef43f`
on Base Sepolia."

---

## 2:45–3:00 — Close

[Back to `/`, scroll to "How it works" diagram.]

"Three sponsor tracks, one flow: The Graph for discovery, Hedera and Arc
as two different payment rails, ERC-8004 for identity and reputation
tying it together. Everything you saw is testnet, live, and real."

---

## Sponsor cuts (30s each, cut from the same footage)

**The Graph (30s):** 0:20–0:45 + the reputation-lookup moment at 2:15.
Emphasize: one query, two chains (base-sepolia + eth-sepolia), discovers
agents we don't control, not a hardcoded list.

**Hedera (30s):** show the Hedera provider card + a real Hedera purchase
tx, e.g. `0.0.7162784@1788785193.821942030` on HashScan testnet.
Emphasize: real x402 settlement, HCS-adjacent audit trail, and the real
bug fix — ERC-8004 identity lives on Base Sepolia even for a Hedera-rail
provider, which is a genuinely non-obvious cross-chain detail we had to
debug live.

**Arc (30s):** 0:45–1:45. Emphasize: gas paid in USDC (Arc's native gas
token), Circle Gateway nanopayments, real settlement + a real seller
withdrawal on `/seller` (`testnet.arcscan.app`).

---

## Backup facts (if asked, or if a live call fails on stage)

- Live dashboard: `https://dashboard-production-e04a.up.railway.app`
- Real Arc trade tonight: $1.50 total (summarise $1 + classify-risk
  $0.50), txs `2a073749-9f2b-4c6f-9ea3-3964b26cd483` and
  `33fc612c-4037-4c44-b1dc-3ff3d304e17a`
- Real Hedera trade tonight: $1.00 (pool risk brief) + $0.50 (agent
  lookup), txs `0.0.7162784@1788784372.307225160` and
  `0.0.7162784@1788785193.821942030`
- Real feedback fix confirmation tx (Base Sepolia, ERC-8004 Reputation
  Registry): `0x63a7ac676a2be1f2249bd7ced11502d9ce0a5ff235b9c729f5a68c364eeef43f`
- Provider prices: $0.5–$2 per call (raised tonight from sub-cent so a
  real budget gets meaningfully spent in a handful of calls)
- Everything is testnet — explicitly not mainnet, no real money at risk

## Running it yourself

1. `pnpm install`
2. Fill `.env` per `.env.example` (see `docs/STATUS.md` WP00 for which
   faucets/portals were used, including funding the Arc buyer/seller and
   Hedera buyer/provider addresses).
3. `pnpm -r typecheck && pnpm -r test` (all offline, no keys needed)
4. Point `PROVIDER_HEDERA_URL`/`PROVIDER_ARC_URL` at the live Railway
   providers (already the default in `.env`) and run the buyer-agent
   command above with `DOTENV_CONFIG_PATH` set to the repo-root `.env`.
5. Watch it live at `https://dashboard-production-e04a.up.railway.app/agent`.
