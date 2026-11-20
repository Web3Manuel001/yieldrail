import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  TESTNET_FRIENDBOT_URL,
  TESTNET_HORIZON_URL,
  createTestnetClient,
  ensureFunded,
  generateKeypair,
  keypairFromSecret,
} from '@yieldrail/stellar';

import { parseEnv, readText, upsertEnv } from './env-file';

const ROLES = ['issuer', 'distributor', 'investor'] as const;
type Role = (typeof ROLES)[number];

const ENV_PREFIX: Record<Role, string> = {
  issuer: 'ISSUER',
  distributor: 'DISTRIBUTOR',
  investor: 'INVESTOR',
};

interface AccountState {
  publicKey: string;
  fundedAt: string;
}

interface StateFile {
  network: 'testnet';
  updatedAt: string;
  accounts: Partial<Record<Role, AccountState>>;
}

const envPath = fileURLToPath(new URL('../.env', import.meta.url));
const statePath = fileURLToPath(new URL('../state.json', import.meta.url));

function log(correlationId: string, event: Record<string, unknown>): void {
  console.log(JSON.stringify({ correlationId, ...event }));
}

function logError(correlationId: string, error: unknown): void {
  console.error(
    JSON.stringify({
      correlationId,
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
}

function readState(path: string): StateFile {
  if (!existsSync(path)) {
    return {
      network: 'testnet',
      updatedAt: new Date(0).toISOString(),
      accounts: {},
    };
  }

  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null || !('accounts' in parsed)) {
    throw new Error(`Invalid state file: ${path}`);
  }
  return parsed as StateFile;
}

function writePrivateFile(path: string, contents: string): void {
  writeFileSync(path, contents, { mode: 0o600 });
  chmodSync(path, 0o600);
}

async function main(): Promise<void> {
  const correlationId = randomUUID();

  try {
    const fileEnv = parseEnv(readText(envPath));
    const env: Record<string, string | undefined> = {
      ...fileEnv,
      ...process.env,
    };

    const clientResult = createTestnetClient(
      env.HORIZON_URL ?? TESTNET_HORIZON_URL,
    );
    if (!clientResult.ok) throw clientResult.error;
    const client = clientResult.value;

    const stateExists = existsSync(statePath);
    const previousState = readState(statePath);
    let changed = !stateExists;
    const prepared: Array<{
      role: Role;
      publicKey: string;
      secret: string;
      keypairAction: 'created' | 'reused';
    }> = [];

    for (const role of ROLES) {
      const existingSecret = env[`${ENV_PREFIX[role]}_SECRET`];

      if (existingSecret !== undefined && existingSecret !== '') {
        const restored = keypairFromSecret(existingSecret);
        if (!restored.ok) throw restored.error;
        prepared.push({
          role,
          publicKey: restored.value.publicKey(),
          secret: restored.value.secret(),
          keypairAction: 'reused',
        });
        continue;
      }

      const generated = generateKeypair();
      if (!generated.ok) throw generated.error;
      prepared.push({
        role,
        publicKey: generated.value.publicKey,
        secret: generated.value.secret,
        keypairAction: 'created',
      });
    }

    const updates: Record<string, string> = {};
    for (const item of prepared) {
      const prefix = ENV_PREFIX[item.role];
      updates[`${prefix}_SECRET`] = item.secret;
      updates[`${prefix}_PUBLIC_KEY`] = item.publicKey;
    }

    // Persist identities before funding so a Friendbot failure never loses keys.
    writePrivateFile(envPath, upsertEnv(readText(envPath), updates));

    const nextAccounts: Partial<Record<Role, AccountState>> = {};
    for (const item of prepared) {
      const funded = await ensureFunded(
        client,
        item.publicKey,
        env.FRIENDBOT_URL ?? TESTNET_FRIENDBOT_URL,
      );
      if (!funded.ok) throw funded.error;

      const previous = previousState.accounts[item.role];
      const unchanged =
        previous !== undefined && previous.publicKey === item.publicKey;
      if (!unchanged || item.keypairAction === 'created' || funded.value === 'funded') {
        changed = true;
      }
      nextAccounts[item.role] = {
        publicKey: item.publicKey,
        fundedAt: unchanged
          ? previous.fundedAt
          : new Date().toISOString(),
      };

      log(correlationId, {
        level: 'info',
        role: item.role,
        publicKey: item.publicKey,
        keypair: item.keypairAction,
        funding: funded.value,
      });
    }

    const nextState: StateFile = {
      network: 'testnet',
      updatedAt: changed ? new Date().toISOString() : previousState.updatedAt,
      accounts: nextAccounts,
    };
    writePrivateFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`);

    log(correlationId, { level: 'info', event: 'fund-accounts.complete' });
  } catch (error) {
    logError(correlationId, error);
    process.exitCode = 1;
  }
}

await main();
