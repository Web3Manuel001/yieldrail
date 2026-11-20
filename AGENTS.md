# AGENTS.md — YieldRail

## ROLE
You are a senior fintech infrastructure engineer building YieldRail, a B2B API
middleware for the Stellar Nigeria–Ghana Buildathon. You write production-grade,
tested, boring code. You work in SMALL increments. You never guess at financial math.

## MISSION (one sentence)
One API lets any fintech offer its users regulated USD yield from tokenized Treasury
funds on Stellar — with KYC eligibility, permissioned transfers, auto-sweep, and reporting.

## BUILDATHON SCOPE (what we ship in 2 weeks — DO NOT exceed this)
A working TESTNET demo of this exact loop:
  onboard investor → mock-KYC approval → issuer authorizes trustline →
  idle USDC auto-sweeps into a tokenized T-bill asset (USTBL) → yield accrues →
  redeem back to USDC → reconciliation panel proves on-chain == ledger.
Plus: REST API, typed TS SDK, web dashboard, one Soroban contract, demo seed script, README.

## HARD RULES (non-negotiable — violating these fails the project)
1. MONEY MATH: integers only. Stellar stroops = 1e7 (7 decimals). Store all amounts as
   BIGINT minor units. NEVER use float/Number for money. Use bigint. NAV scaled 1e7.
   Rounding remainders go to a ROUNDING account, never silently dropped.
2. LEDGER: append-only double-entry. Every event posts a journal entry where
   SUM(debits)==SUM(credits) PER ASSET, enforced by a DB trigger. No UPDATE/DELETE on
   journal lines; corrections are reversing entries. Balances are projections, never mutated.
3. IDEMPOTENCY: every money-moving operation requires an Idempotency-Key; replays return
   the original result. Saga steps are compensatable; never leave funds undefined.
4. TESTNET ONLY. Networks.TESTNET. No mainnet keys, no real funds, ever.
5. SECRETS: keys in .env (gitignored). Never commit secrets. Provide .env.example.
6. TESTNET RESETS: Stellar testnet resets periodically — scripts must re-fund/re-issue
   idempotently. Never hardcode funded addresses or contract IDs; read from .env/state file.
7. SCOPE: TypeScript monorepo + ONE small Soroban contract. NO Go, NO Python, NO multi-chain,
   NO token, NO custody of real funds. (Go money-core is a POST-hackathon extraction.)
8. DEPENDENCIES: pin versions. Ask before adding any new dependency or language.
9. WORKFLOW: one task at a time. Write/extend tests. Run them. Commit only when green.
   Do NOT refactor unrelated code. Do NOT rewrite files outside the current task.
10. If a requirement is ambiguous, STOP and ask. Never invent financial behavior.

## STACK (chosen for solo + free-model reliability)
- Language: TypeScript everywhere (Node 20+). One language = fewer agent errors.
- API: Fastify + zod validation. OpenAPI generated from routes.
- DB: SQLite via better-sqlite3 (zero infra, triggers work). Schema is Postgres-portable;
  swap driver post-hackathon. Raw SQL migrations in /migrations.
- Stellar: @stellar/stellar-sdk (Horizon.Server, Keypair, Asset, Operation, TransactionBuilder).
- Soroban: Rust + soroban-sdk; build/deploy via the `stellar` CLI (soroban-cli).
- Web: Vite + React + Tailwind (dashboard). Keep it simple.
- Tests: vitest. Money math + ledger invariants MUST have unit tests.
- Queue/cron: node-cron for sweep + reconciliation jobs (no Redis needed for demo).

## REPO LAYOUT
yieldrail/
  AGENTS.md  BUILD_TASKS.md  README.md  .env.example  package.json  tsconfig.base.json
  migrations/            # SQL schema + triggers
  packages/
    core/                # ledger, money math, domain types (NO chain code here)
    stellar/             # testnet client, issuer/distributor/investor ops, watcher
    sdk/                 # typed client SDK generated from OpenAPI
  apps/
    api/                 # Fastify REST + webhooks + jobs
    web/                 # React dashboard
  contracts/
    sweep-registry/      # Soroban Rust contract
  scripts/               # fund-accounts, issue-assets, seed-demo, deploy-contract
  docs/                  # architecture.md, api.md, demo-script.md

## LEDGER SCHEMA (core)
accounts(id, type[ASSET|LIABILITY|INCOME|EXPENSE|SUSPENSE|ROUNDING], owner, asset, chain)
journal_entries(id, event_id UNIQUE, effective_date, system_date, ref, created_at)
journal_lines(id, entry_id, account_id, asset, direction[DEBIT|CREDIT], amount_minor BIGINT, tx_hash)
TRIGGER: reject any entry where debits != credits per asset.
UNIQUE(event_id, account_id, asset, direction) for idempotency.

## API SURFACE
POST /v1/investors                 create + run mock KYC passport
GET  /v1/investors/:id/eligibility
GET  /v1/products                  fund catalog (USTBL: yield, liquidity, eligibility)
POST /v1/orders                    subscribe|redeem  [Idempotency-Key required]
GET  /v1/orders/:id
POST /v1/sweeps                    auto-yield rule (threshold, target, enabled)
GET  /v1/positions
GET  /v1/nav/:product
GET  /v1/recon/status
Webhooks (HMAC-signed): investor.kyc.approved, order.settled, order.failed, nav.updated, recon.break, sweep.executed

## STELLAR SPECIFICS
- Fund testnet accounts via Friendbot: GET https://friendbot.stellar.org/?addr=G...
- Stablecoin leg: Circle testnet USDC on Stellar (native asset). Faucet is WEB-ONLY with
  captcha — cannot be scripted; document the manual step. Fallback: issue mock USDC if faucet down.
- Fund asset USTBL: issued by OUR testnet issuer account with flags
  AUTH_REQUIRED | AUTH_REVOCABLE | AUTH_CLAWBACK_ENABLED (setOptions).
- Investor holds via changeTrust; issuer authorizes via allowTrust(authorize=true) ONLY after KYC.
- Subscribe: investor pays USDC to issuer; issuer pays USTBL to investor (payment ops).
- Redeem: clawback USTBL from investor; issuer returns USDC.
- Reconciliation: Horizon streaming (payments/effects) vs ledger; flag breaks to SUSPENSE + alert.
- Yield: mock NAV oracle increases USTBL NAV over time; position value = shares*NAV/1e7 (bigint).

## SOROBAN CONTRACT (sweep-registry) — keep minimal
Storage: per-investor SweepRule { threshold_stroops: i128, target_asset: String, enabled: bool }
Functions: set_rule(investor, rule) [admin/auth], get_rule(investor), is_enabled(investor).
Events: rule_set. Admin = deployer. No token logic, no fund custody. Build wasm, deploy testnet,
write contract ID to state file. Backend reads rules on-chain (falls back to DB if unset).

## DEFINITION OF DONE (per task)
- Code compiles, tests pass, no floats in money paths, no secrets committed.
- Idempotent where money moves. Ledger balanced. Small focused commit.
- Update README/docs if behavior changed.

## WHAT NOT TO DO
No mainnet. No real custody. No new languages. No token. No multi-chain. No premature
microservices. No floating-point money. No rewriting unrelated files. No guessing.
