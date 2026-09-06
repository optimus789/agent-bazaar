# Demo script

One 3-minute master cut covers all three sponsors. Timestamps assume a
screen recording with the dashboard and a terminal side by side. Everything
shown is real testnet activity — no mocked screens, no staged data.

## Setup (before recording)

```bash
pnpm --filter provider-hedera exec tsx src/server.ts   # terminal 1
pnpm --filter provider-arc exec tsx src/server.ts      # terminal 2
pnpm --filter dashboard dev                            # terminal 3
```

Open `http://localhost:3000` in a browser.

## Master script (≈3:00)

**0:00–0:15 — The Graph: discovery**
Show the dashboard's `/` marketplace page. Point out both real providers
(Bazaar Market Intel on Hedera, Bazaar Task Runner on Arc) discovered via
one Agent0 GraphQL query across Base Sepolia and Ethereum Sepolia. Open
`packages/graph/src/queries/agents.ts` briefly to show it's one document,
not two.

**0:15–1:00 — the buyer agent reasons and pays**
In the terminal:
```bash
pnpm --filter buyer-agent start -- \
  "get me a risk brief on the Base pool with id 0x4c36388be6f416a29c8d8eee81c771ce6be14b18, then get a second opinion classifying the risk" \
  --budget 0.02
```
Narrate as it runs: discover → rank (show the rationale in the ranked
table) → pay the top provider. This is the real transcript from
`docs/demo/transcript-2026-09-06.md`.

**1:00–1:40 — Hedera: x402 settlement + HCS audit trail**
Cut to the dashboard's `/agent` page — the decision log updating live via
SSE as the run happens. When `buy_hedera` fires, cut to the HashScan link
for the real settlement:
https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.7162784-1788723378-172223383
— a real USDC transfer, buyer → provider, settled through Blocky402.
Then show the HCS receipt topic mirror node URL confirming the same
payment was independently logged to the audit trail.

**1:40–2:10 — Arc: nanopayment + seller dashboard**
When `buy_arc` fires for the classify-risk call, cut to `/payments` showing
the Arc nanopayment total, then `/seller` showing the Gateway balance.
Show the real withdrawal transaction:
https://sepolia.basescan.org/tx/0x1d182bc9c38484976ba234a14be310a8a0f9502e938dde8a98ff8ff9254d239a
— gas-free for the buyer, batched settlement, real payout to the seller
wallet.

**2:10–2:40 — trust: on-chain feedback**
Show the buyer's final report citing the real transaction IDs and receipts.
Show the `leave_feedback` call and its real tx on Base Sepolia:
https://sepolia.basescan.org/tx/0x7f99b2cf1e0013001ef798e4d1c4ad80859943dcfd0fb73e322cc885b64b2d06
Explain: the next buyer's `discover_providers` call will see this score.

**2:40–3:00 — architecture recap**
Show `docs/architecture.md`'s diagram. One sentence per sponsor: "The
Graph is how the buyer finds and trusts providers with no API key or
account. Hedera settles the market-intel payment with a full audit trail.
Arc makes the payment gas-free for the buyer and batches it for the
seller."

## Sponsor cuts (30s each, cut from the same footage)

**The Graph (30s):** 0:00–0:15 + 2:40–2:55. Emphasize: one query, two
chains, standardized ERC-8004 schema; reputation feedback loop closes on
the same subgraph.

**Hedera (30s):** 1:00–1:40. Emphasize: real x402 request settled through
Blocky402 specifically (not a generic facilitator), HCS receipt as an
independent audit trail, ERC-8004 identity also registered on Hedera
testnet itself (not just Base Sepolia).

**Arc (30s):** 1:40–2:10. Emphasize: gasless for the buyer, Circle Gateway
batch settlement, real withdrawal to a payout wallet — the full nanopayment
lifecycle, not just a single call.

## Running it yourself

A teammate with no prior context on this repo can reproduce the whole
flow from a clean checkout:

1. `pnpm install`
2. Fill `.env` per `.env.example` — see `docs/STATUS.md` WP00 for exactly
   which faucets and portals were used.
3. `pnpm -r typecheck && pnpm -r test` (all offline, no keys needed)
4. Start both providers and the dashboard (commands above).
5. Run the buyer-agent command above with a small `--budget`.

Every claim in this script maps to a link in [docs/STATUS.md](../STATUS.md).
