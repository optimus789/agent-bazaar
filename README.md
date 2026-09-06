# Agent Bazaar

An open marketplace where agents **sell** services behind HTTP 402 paywalls, **prove who they are** with ERC-8004 identities, get **discovered** through The Graph, and get **paid** in USDC or HBAR on Hedera and Arc. A procurement agent with a budget finds the cheapest reputable provider, pays it, uses the result, and leaves on-chain feedback that the next buyer can query.

Both halves of the agent economy in one repo: a buyer that pays, and sellers that earn.

## How it works

```
                 ┌──────────────────────────────────────────────────┐
                 │  Buyer agent  (apps/buyer-agent)                 │
                 │  budget · discovery · ranking · payment · review │
                 └───┬───────────────┬───────────────┬─────────────┘
                     │ x402 USDC     │ x402 HBAR/USDC│ Nanopayments USDC
                     │ Base Sepolia  │ Hedera testnet│ Arc testnet
                     ▼               ▼               ▼
   ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ The Graph gateway  │  │ Provider: Hedera │  │ Provider: Arc    │
   │ Agent0 (ERC-8004)  │  │ market-intel API │  │ task-runner API  │
   │ Messari DEX schema │  │ Blocky402 settle │  │ Circle Gateway   │
   │ Subgraph MCP       │  │ HCS receipts     │  │ batch settle     │
   └────────────────────┘  └──────────────────┘  └──────────────────┘
              ▲                      ▲                     ▲
              │ identity + feedback  │ ERC-8004 on Hedera  │ Circle Agent Marketplace
              └──── ERC-8004 registries on Base Sepolia ───┘
```

- **Discovery** is a standardized-schema query against The Graph's Agent0 subgraphs (Base Sepolia, Ethereum Sepolia). One query pattern, every chain. Providers show up there because they register in the ERC-8004 Identity Registry with a registration file that advertises x402 endpoints and prices.
- **Reasoning** happens twice: the buyer ranks providers on price, reputation and validation, explains its choice, and stays inside a budget; the Hedera provider itself sells *briefs* it derives from Messari standardized DEX subgraphs, not raw rows.
- **Payment** is x402 everywhere. The buyer pays The Graph's gateway per query (no API key), pays the Hedera provider through the Blocky402 facilitator, and pays the Arc provider gas-free through Circle Nanopayments.
- **Trust** closes the loop: the buyer calls `giveFeedback` on the ERC-8004 Reputation Registry; the score is visible in the Agent0 subgraph on the next discovery pass. Every Hedera settlement is mirrored as an HCS receipt.

## Repository layout

```
apps/
  provider-hedera/   x402-gated market-intel service, settled via Blocky402, HCS receipts
  provider-arc/      x402 task-runner service, settled via Circle Gateway Nanopayments
  buyer-agent/       the procurement agent (Vercel AI SDK + Claude, Hedera Agent Kit)
  dashboard/         Next.js UI: listings, live payments, agent decision log
packages/
  shared/            chain constants, addresses, env loading, types
  graph/             The Graph clients: Agent0, Messari, x402 gateway, MCP config
  identity/          ERC-8004 register / feedback, registration-file builder, HCS-14 UAID
docs/                architecture, demo script, status log
```

## Quick start

```bash
pnpm install
cp .env.example .env        # fill in keys; see .env.example for what each one is for
pnpm -r typecheck
pnpm -r test
pnpm --filter provider-hedera dev
pnpm --filter buyer-agent start -- "get me a risk brief on the top USDC pool on Base for under $0.02"
```

## Chains and addresses we rely on

| Thing | Value |
|---|---|
| Hedera testnet | chain 296 · x402 network `hedera:testnet` · facilitator `https://api.testnet.blocky402.com` · fee payer `0.0.7162784` |
| Hedera testnet USDC | HTS token `0.0.429274` (needs association) · HBAR asset id `0.0.0` |
| Arc testnet | chain 5042002 · RPC `https://rpc.testnet.arc.io` · explorer `https://testnet.arcscan.app` · gas is USDC · ERC-20 USDC `0x3600000000000000000000000000000000000000` (6 dp) |
| Base Sepolia | chain 84532 · ERC-8004 IdentityRegistry `0x8004A818BFB912233c491871b3d84c89A494BD9e` · ReputationRegistry `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| Hedera testnet ERC-8004 | same two addresses as above |
| Agent0 subgraphs | Base Sepolia `4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u` · Ethereum Sepolia `6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT` |
| Graph x402 gateway | one host for both networks: `https://gateway.thegraph.com/api/x402` — testnet pays on `base-sepolia`, prod pays $0.01 USDC on `base` (which network is determined by the client's own chain, not a separate subdomain) |
| Subgraph MCP | `https://subgraphs.mcp.thegraph.com/sse` with `Authorization: Bearer <Studio key>` |

## Status

See [docs/STATUS.md](docs/STATUS.md) for verified on-chain evidence per component, and [docs/architecture.md](docs/architecture.md) for the full system diagram. Dates that matter: Arc mainnet 16 Sept 2026, Arc "mainnet-ready" deadline 30 Sept 2026.

## For The Graph judges

**What's load-bearing:** discovery has no other path. `discover_providers` (`apps/buyer-agent/src/tools/discover.ts`) queries Agent0's ERC-8004 subgraphs on Base Sepolia and Ethereum Sepolia with one GraphQL document (`packages/graph/src/queries/agents.ts`) — the same document runs unchanged on both chains, which is what "composable/standardized schema" buys us: no per-chain query logic. Provider identity, rail, and price-catalog pointer all come from the on-chain ERC-8004 registration file that Agent0 indexes, not from a hardcoded provider list. The Hedera provider itself also builds its risk briefs from a second Graph product — Messari's standardized DEX subgraph schema (`packages/graph/src/messari.ts`) — so a single demo touches two different standardized Graph schemas.

**What breaks without The Graph:** the buyer agent would need a hardcoded list of providers and no way to discover new ones or read their on-chain reputation; the Hedera provider would have no standardized source for pool metrics and would need to hand-roll a Uniswap subgraph client per chain.

**Evidence:**
- Agent0 query, one document for two chains: `packages/graph/src/queries/agents.ts`
- Real registrations indexed by Agent0: agentId `9179` ([Base Sepolia tx](https://sepolia.basescan.org/tx/0x7c489b270f2eb9056015319785c1cc9a678274a5391d00729006866f53075f3c)), agentId `9180` ([Base Sepolia tx](https://sepolia.basescan.org/tx/0x5ddf8d1cbe60641a881d56a101db731f4c2a102efdca181bc7442176a5f7e2a8))
- Real ERC-8004 feedback tx (closes the reputation loop): https://sepolia.basescan.org/tx/0x7f99b2cf1e0013001ef798e4d1c4ad80859943dcfd0fb73e322cc885b64b2d06
- Full verified evidence: [docs/STATUS.md § WP02, WP04, WP06](docs/STATUS.md)

## For Hedera judges

**What's load-bearing:** the Hedera provider (`apps/provider-hedera`) is a real HTTP service that sells reasoned market briefs behind an x402 paywall, settled specifically through the **Blocky402 facilitator** (`https://api.testnet.blocky402.com`), with every settled payment mirrored to a **Hedera Consensus Service (HCS)** topic as an independent, publicly-auditable receipt trail (`apps/provider-hedera/src/hcs.ts`). The provider is also registered as an ERC-8004 agent on Hedera testnet itself (not only Base Sepolia), using an EVM-alias-activation technique documented in `docs/STATUS.md` since Hedera testnet's own EVM JSON-RPC layer has an unusual funding requirement for signing accounts.

**What breaks without Hedera:** the buyer agent would lose one of its two real payment rails and the market-intel provider would have no settlement path at all — Blocky402's facilitator is specific to Hedera's x402 scheme.

**Evidence:**
- Real x402 request paid end-to-end (buyer → Blocky402 → provider): [mirror node settlement](https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.7162784-1788723378-172223383), a real `-2000`/`+2000` USDC transfer
- Real HCS receipt topic (independent audit trail): [`0.0.10395241` on mirror node](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.10395241/messages)
- Real ERC-8004 identity on Hedera testnet: [agentId `109`](https://hashscan.io/testnet/transaction/0x1d7bb528de3dd7d0fc12c3ddc2a72f6dbb764000c5938b0c527b6f0ae4a5d521)
- Full verified evidence: [docs/STATUS.md § WP03, WP04, WP06](docs/STATUS.md)

## For Arc judges

**What's load-bearing:** the Arc provider (`apps/provider-arc`) accepts gas-free USDC nanopayments via **Circle Gateway** (`@circle-fin/x402-batching`), the buyer wraps `GatewayClient` with a hard per-session spending cap (`packages/shared/src/arcBuyer.ts`), and the full lifecycle — deposit → gasless pay → batch settle → withdraw to a payout wallet — is exercised for real, including the withdraw step, which surfaced a real Gateway API constraint (a scaling minimum-withdrawal-amount check) documented in `docs/STATUS.md`. The dashboard's `/seller` page is the required Arc frontend: live Gateway balance and a real withdraw form, admin token never reaching the browser.

**What breaks without Arc:** the buyer loses its gas-free payment rail and the cross-provider workflow (classify a Hedera-sourced brief on Arc) has nowhere to settle; the seller earnings/withdraw flow that demonstrates the "stablecoin-native finance" track disappears entirely.

**Evidence:**
- Real Gateway deposit: [approval tx](https://sepolia.basescan.org/tx/0xbd5264d79e71fef9ef3366b62dccc314ed31b1927b443384841bbaddad16c01b), [deposit tx](https://sepolia.basescan.org/tx/0x8740d2cfece4fb50f70fea135f30be47b4c75d09ffd05e56e3536ddd6893a44f)
- Ten real nanopayments settled, correctly recorded in the seller ledger (see `docs/STATUS.md` § WP05)
- Real withdrawal to the seller payout wallet: [mint tx `0x1d182bc9...`](https://sepolia.basescan.org/tx/0x1d182bc9c38484976ba234a14be310a8a0f9502e938dde8a98ff8ff9254d239a), `status: 0x1` confirmed
- Full verified evidence: [docs/STATUS.md § WP05, WP06, WP07](docs/STATUS.md)
