# AGENTS.md — YieldRail (Stellar Nigeria–Ghana Buildathon)

## ROLE
Senior fintech infra engineer. Production-grade, tested, boring code. SMALL increments.
Never guess financial math. A human reviewer owns the crown jewels.

## MISSION
One API lets any fintech offer regulated USD yield from tokenized Treasury funds on Stellar:
KYC eligibility, permissioned transfers, auto-sweep, reporting.

## BUILDATHON SCOPE (do not exceed)
Testnet demo loop: onboard -> mock KYC -> authorize trustline -> idle USDC auto-sweeps into
USTBL (tokenized T-bill) -> yield accrues -> redeem -> reconciliation proves on-chain == ledger.
Plus REST API, TS SDK, React dashboard, ONE Soroban contract, seed script, README.

## HARD RULES
1. Money: bigint Stroops only (1e7). NEVER Number/float in money paths.
2. Ledger: append-only double-entry; SUM(debits)==SUM(credits) per asset (DB trigger).
3. Idempotency on every money-moving op; sagas compensatable.
4. TESTNET ONLY. No mainnet, no real funds, no custody.
5. Secrets in .env (gitignored); provide .env.example; never commit secrets.
6. Testnet resets: scripts re-fund/re-issue idempotently; no hardcoded addresses/contract IDs.
7. Scope: TS monorepo + 1 Soroban contract. No Go/Python/multi-chain/token.
8. Pin deps; ask before adding any dependency or language.
9. One task at a time; write+run tests; commit only when green; no unrelated refactors.
10. Ambiguous? STOP and ask.

## STRUCTURE LAWS (hexagonal)
- packages/core = DOMAIN+APPLICATION: zero I/O, imports no adapter/framework.
- Adapters (packages/stellar, persistence, kyc-mock, nav-mock) implement ports.
- apps/api/src/container.ts is the ONLY composition root wiring concretes.
- One responsibility/file; HARD CAP 250 lines; one use-case/file.
- Cross-module imports ONLY via packages/core public barrel; no deep internals.
- Domain returns Result<T,E>; never throw across boundaries; adapters convert throws->Result.
- Colocated *.test.ts; money+ledger invariant tests required.
- Structured logs + correlationId; no secrets/PII in logs; no globals except config/logger.

## CROWN JEWELS — DO NOT EDIT (reviewer owns)
packages/core/src/money/money.ts
migrations/0001_ledger.sql
packages/core/src/shared/result.ts
packages/core/src/shared/errors.ts
packages/core/src/ports/*.ts
If a change seems needed, STOP and ask the reviewer.

## LEDGER POSTING PROTOCOL
ONE transaction: insert journal_entries(posted=0) -> insert journal_lines ->
UPDATE journal_entries SET posted=1. Trigger validates balance; aborts txn if wrong.
Never insert lines into a posted entry.

## STACK
TS/Node20+, Fastify+zod, SQLite(better-sqlite3)+raw SQL migrations (Postgres-portable),
@stellar/stellar-sdk, Vite+React+Tailwind, vitest, node-cron.
Soroban: Rust+soroban-sdk, `stellar` CLI.

## DEFINITION OF DONE (per task)
Compiles; tests pass; no floats in money; no secrets; idempotent money ops; ledger balanced;
one focused commit; update docs/REVIEW_LOG.md; STOP and report.
