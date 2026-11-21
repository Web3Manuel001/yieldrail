# Stellar Testnet Setup — Issuer and Assets

This demo runs on **Stellar testnet only**. No mainnet, no real funds, no custody.
Scripts read every address and secret from `.env`; nothing is hardcoded.

## 1. Prerequisites

```bash
cp .env.example .env
pnpm install
pnpm fund:accounts
```

`pnpm fund:accounts` is idempotent: it reuses existing secrets, generates missing
issuer/distributor/investor keypairs, funds them through Friendbot, and records
public addresses in `state.json`. Re-running it does not change `.env` or
`state.json` when nothing needs to happen.

## 2. Issue USTBL and create the investor trustline

```bash
pnpm issue:assets
```

This runs `scripts/issue-assets.ts` and performs two testnet transactions:

1. **Issuer flags** — the issuer account calls `setOptions` with
   `AUTH_REQUIRED | AUTH_REVOCABLE | AUTH_CLAWBACK_ENABLED` (`1 | 2 | 8 = 11`).
   Stellar has no "create asset" operation: the asset exists as soon as the
   issuer is configured and a holder trusts it.
2. **Investor trustline** — the investor calls `changeTrust` for
   `USTBL_ASSET_CODE` (`USTBL`) issued by `ISSUER_PUBLIC_KEY`.

Why each flag:

| Flag | Value | Purpose |
| --- | --- | --- |
| `AUTH_REQUIRED` | 1 | Only KYC-eligible holders the issuer authorizes can hold/transact. |
| `AUTH_REVOCABLE` | 2 | Issuer can freeze a holder's line on revocation/offboarding. |
| `AUTH_CLAWBACK_ENABLED` | 8 | Supports regulatory clawback of tokenized T-bill units. |

Because `AUTH_REQUIRED` is on, the new trustline starts **unauthorized**. That is
expected: the onboarding flow (later task) authorizes the investor with
`setTrustLineFlags`/`allowTrust` after mock KYC passes. Scripts are safe to
re-run; setting the same flags and re-submitting a trustline are no-ops on-chain.

Verify on testnet Horizon:

```bash
curl -s "https://horizon-testnet.stellar.org/accounts/$ISSUER_PUBLIC_KEY" | jq '.flags'
curl -s "https://horizon-testnet.stellar.org/accounts/$INVESTOR_PUBLIC_KEY" | jq '.balances'
```

`.balances` should include a `USTBL` line with `"is_authorized": false` until the
onboarding task authorizes it.

## 3. USDC on testnet — manual Circle faucet

Circle's testnet USDC is issued by Circle, not by this project. The faucet is a
web app with a captcha, so it **cannot be scripted or run in CI**; a human must
do this step once per fresh investor account:

1. Open <https://faucet.circle.com> in a browser.
2. Select **Stellar Testnet** as the network.
3. Paste the investor public key (`INVESTOR_PUBLIC_KEY`).
4. Complete the captcha and request testnet USDC.
5. Copy the USDC issuer address shown by the faucet into `.env`:

   ```dotenv
   USDC_ASSET_CODE=USDC
   USDC_ISSUER=<issuer address shown by the faucet>
   ```

The investor must already have a USDC trustline for that issuer, otherwise the
faucet payment fails. Use Stellar Laboratory (**Change Trust** operation) or the
adapter's `changeTrust` operation with `USDC_ASSET_CODE`/`USDC_ISSUER`; sign with
`INVESTOR_SECRET`, then re-request from the faucet.

> Testnet resets happen without notice. If the faucet or an asset disappears,
> re-run `pnpm fund:accounts` and `pnpm issue:assets`; no code changes or
> hardcoded addresses are needed.

## 4. Mock-USDC fallback (no external faucet)

When the Circle faucet is unavailable (captcha outage, rate limit, or offline
demo), use a mock USDC issuer that this project controls. USDC is then just
another Stellar testnet asset with `USDC_ASSET_CODE=USDC`.

Option A — **separate mock issuer (preferred)**: use the distributor account so
the USTBL issuer's `AUTH_REQUIRED`/clawback flags do not gate USDC.

```dotenv
USDC_ASSET_CODE=USDC
USDC_ISSUER=<DISTRIBUTOR_PUBLIC_KEY>
```

Then have the distributor issue mock USDC to the investor (trustline first,
signed by `INVESTOR_SECRET`) using a normal `payment` operation. Amounts stay in
Stroops (`bigint`, 7 decimals) in application code.

Option B — **reuse the USTBL issuer**:

```dotenv
USDC_ASSET_CODE=USDC
USDC_ISSUER=<ISSUER_PUBLIC_KEY>
```

This works, but because that account has `AUTH_REQUIRED`, every mock-USDC holder
must also be authorized by the issuer before receiving funds.

Mock USDC is testnet-only and must never be presented as real USDC. The API and
dashboard should label the fallback asset (for example
`USDC (mock, testnet)`) so the demo is unambiguous.
