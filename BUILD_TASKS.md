# BUILD_TASKS.md — feed ONE task per OpenCode session

## TASK 1 — Scaffold + persistence + health
Read AGENTS.md. Crown jewels already exist and are correct — DO NOT edit them.
Create the monorepo skeleton (pnpm workspaces, tsconfig.base.json, vitest),
packages/persistence/src/db.ts + migrate.ts that runs migrations/0001_ledger.sql,
and apps/api with GET /health -> {ok:true}.
Write tests: (a) migration runs; (b) a balanced entry posts via the posting protocol;
(c) an unbalanced entry is rejected by the trigger.
Run tests. Make ONE commit. Update docs/REVIEW_LOG.md. STOP and report.
