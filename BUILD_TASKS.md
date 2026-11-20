# BUILD_TASKS.md — paste one at a time into OpenCode

TASK 1 — Scaffold
"Read AGENTS.md. Create the monorepo layout, root package.json (workspaces), tsconfig.base,
vitest, .env.example, .gitignore, and a Fastify apps/api with GET /health returning {ok:true}.
Add a SQLite db module in packages/core with a migrations runner. Write one passing test.
Commit 'chore: scaffold monorepo + health endpoint'."
ACCEPT: pnpm install && pnpm test green; /health works.

TASK 2 — Stellar testnet client
"Read AGENTS.md. In packages/stellar, add a testnet client (Horizon.Server, Networks.TESTNET),
keypair helpers, and scripts/fund-accounts.ts that creates issuer/distributor/investor keypairs,
funds them via Friendbot, and writes addresses to .env + state.json (idempotent, reset-safe).
Never commit secrets. Test keypair generation. Commit."
ACCEPT: running fund-accounts twice is safe; addresses persisted.

TASK 3 — Issue assets
"Read AGENTS.md. scripts/issue-assets.ts: issuer issues USTBL with
AUTH_REQUIRED|AUTH_REVOCABLE|AUTH_CLAWBACK_ENABLED; investor establishes USTBL trustline.
Document the MANUAL Circle testnet USDC faucet step in docs/stellar-setup.md; add mock-USDC
fallback issuer. Test asset flag encoding. Commit."
ACCEPT: USTBL exists on testnet with correct flags; trustline created.

TASK 4 — Ledger core (CRITICAL)
"Read AGENTS.md. Implement packages/core ledger: migrations for accounts/journal_entries/
journal_lines + the per-asset balanced-entry TRIGGER + idempotency unique constraint.
bigint money helpers (stroops). postEntry(), getBalance() projection. Unit tests: balanced
entry posts; unbalanced rejected; replay idempotent; no floats. Commit."
ACCEPT: invariant tests pass; unbalanced entry throws.

TASK 5 — Compliance passport
"Read AGENTS.md. Mock KYC service in packages/core: createInvestor runs mock checks,
sets eligibility. On approval, packages/stellar calls allowTrust to authorize the investor's
USTBL trustline. Emit investor.kyc.approved. Test the approval→authorization path. Commit."
ACCEPT: approved investor has authorized trustline; rejected does not.

TASK 6 — Subscribe saga
"Read AGENTS.md. Order orchestrator: POST /v1/orders subscribe with Idempotency-Key.
Saga: reserve→investor pays USDC to issuer→issuer pays USTBL to investor→watcher confirms→
post balanced ledger entries→webhook order.settled. Compensate on failure. Test idempotent
replay + a failure compensation. Commit."
ACCEPT: subscribe settles; replay returns same order; ledger balanced.

TASK 7 — Redeem saga
"Read AGENTS.md. Redeem: clawback USTBL from investor, issuer returns USDC, post ledger,
webhook. Idempotent + compensatable. Test. Commit."
ACCEPT: redeem returns USDC; positions decrease; ledger balanced.

TASK 8 — Watcher + reconciliation
"Read AGENTS.md. packages/stellar Horizon streaming watcher ingests payments/effects with
checkpointing. Reconciliation job compares on-chain balances vs ledger projections; breaks
go to SUSPENSE + recon.break webhook + GET /v1/recon/status. Test a forced break. Commit."
ACCEPT: recon detects a mismatch and reports it; happy path shows zero breaks.

TASK 9 — Sweep engine
"Read AGENTS.md. POST /v1/sweeps stores rule. node-cron job: if investor idle USDC > threshold,
auto-subscribe into USTBL via the subscribe saga. Emit sweep.executed. Test threshold logic. Commit."
ACCEPT: idle USDC above threshold auto-sweeps; below does not.

TASK 10 — NAV + yield + statements
"Read AGENTS.md. Mock NAV oracle increases USTBL NAV over time (bigint 1e7). GET /v1/nav,
GET /v1/positions shows accrued yield. Simple statement generator (CSV). Test yield math
with integer rounding to ROUNDING account. Commit."
ACCEPT: position value grows with NAV; no float; rounding accounted.

TASK 11 — API polish + SDK + OpenAPI
"Read AGENTS.md. Finalize all REST routes + zod schemas + HMAC webhooks. Generate OpenAPI
and packages/sdk typed client. Docs/api.md. Test SDK against local API. Commit."
ACCEPT: SDK can run the full loop against the API.

TASK 12 — Dashboard
"Read AGENTS.md. apps/web (Vite+React+Tailwind): onboard investor, show KYC status, position,
accrued yield, sweep toggle, and a reconciliation panel. Wire to API. Commit."
ACCEPT: dashboard demonstrates the full loop visually.

TASK 13 — Soroban sweep-registry contract
"Read AGENTS.md. contracts/sweep-registry: minimal Rust soroban-sdk contract per the spec
(set_rule/get_rule/is_enabled, admin auth, rule_set event). Build wasm, scripts/deploy-contract.ts
via `stellar` CLI to testnet, write contract ID to state. Backend reads rules on-chain with DB
fallback. Test contract locally. Commit."
ACCEPT: contract deployed to testnet; backend reads a rule from it.

TASK 14 — Demo seed + docs + video script
"Read AGENTS.md. scripts/seed-demo.ts runs the ENTIRE loop end-to-end on testnet and prints
each step. Write README (quickstart + architecture), docs/demo-script.md (2-min narration).
Commit. Then list any remaining gaps."
ACCEPT: one command runs the full demo; README lets a judge reproduce it.
