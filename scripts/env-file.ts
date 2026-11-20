import { existsSync, readFileSync } from 'node:fs';

/** Read a file as text, returning '' when it does not exist. */
export function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/** Parse simple KEY=value lines, ignoring comments and blank lines. */
export function parseEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) continue;

    values[key] = rawValue.trim().replace(/^(['"])(.*)\1$/, '$2');
  }

  return values;
}

/**
 * Upsert keys into an .env file while preserving comments and unrelated keys.
 * Duplicate keys are collapsed to one line.
 */
export function upsertEnv(
  contents: string,
  updates: Readonly<Record<string, string>>,
): string {
  const remaining = new Map(Object.entries(updates));
  const seen = new Set<string>();
  const output: string[] = [];

  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    const key = match?.[1];

    if (key === undefined) {
      output.push(line);
      continue;
    }
    if (seen.has(key)) continue;

    seen.add(key);
    const next = remaining.get(key);
    if (next === undefined) {
      output.push(line);
      continue;
    }

    output.push(`${key}=${next}`);
    remaining.delete(key);
  }

  while (output.length > 0 && output[output.length - 1] === '') {
    output.pop();
  }

  for (const [key, value] of remaining) {
    output.push(`${key}=${value}`);
  }

  return `${output.join('\n')}\n`;
}
