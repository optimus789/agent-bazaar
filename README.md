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
| Graph x402 gateway | testnet `https://testnet.gateway.thegraph.com/api/x402` pays on `base-sepolia`; prod `https://gateway.thegraph.com/api/x402` pays $0.01 USDC on `base` |
| Subgraph MCP | `https://subgraphs.mcp.thegraph.com/sse` with `Authorization: Bearer <Studio key>` |

## Status

See [docs/STATUS.md](docs/STATUS.md) for verified on-chain evidence per component. Dates that matter: Arc mainnet 16 Sept 2026, Arc "mainnet-ready" deadline 30 Sept 2026.
