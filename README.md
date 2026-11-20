# YieldRail
The distribution layer for tokenized yield on Stellar.
One API lets any fintech offer regulated USD yield from tokenized Treasury funds.

## Buildathon Demo (testnet)
Onboard investor → mock KYC → authorize trustline (AUTH_REQUIRED) →
auto-sweep USDC into tokenized T-bill asset → yield accrual → redeem → reconciliation.

## Architecture
Fintech SDK/API → Compliance Passport → Order Orchestrator →
Double-Entry Ledger (Go) → Chain Adapter (Stellar) → Issuer Adapter
Soroban: sweep rules + eligibility registry · Horizon: reconciliation stream

## Stack
TypeScript (API/SDK/adapters) · Go (ledger/recon/watcher) ·
Soroban/Rust (contracts) · Stellar SDK · Postgres · Python (reporting)

## Status
Stellar Nigeria–Ghana Buildathon · testnet · building in public @web3manuel1
