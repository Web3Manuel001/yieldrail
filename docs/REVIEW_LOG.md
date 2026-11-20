# Review Log
Reviewer owns crown jewels. Agent logs each task here; reviewer appends verdicts.

## Task 1 — Scaffold + persistence + health

Agent: complete — awaiting reviewer verdict.

Scope:
- Moved all SQLite I/O out of `packages/core` into new `@yieldrail/persistence` adapter.
- `packages/persistence/src/db.ts`: safe-integer connection + `postEntry` posting protocol.
- `packages/persistence/src/migrate.ts`: ordered SQL migrations, transaction + `schema_migrations`, runs `migrations/0001_ledger.sql`.
- `apps/api` exposes `GET /health -> {ok:true}`.
- Colocated tests: `packages/persistence/src/migrate.test.ts`, `packages/persistence/src/db.test.ts`.

Verification:
- `pnpm test`: 2 files / 3 tests pass (migration runs; balanced entry posts; unbalanced entry rejected by `trg_entry_balance`).
- `pnpm typecheck`: core, persistence, and api pass.
- `GET /health`: `{"ok":true}`.
- Crown-jewel files not modified.

Notes:
- `tsconfig.base.json` uses `moduleResolution: Bundler` because crown-jewel imports are extensionless.
- `noUncheckedIndexedAccess` is disabled because crown-jewel `money.ts` line 15 does not satisfy it; no crown-jewel edits were made.
