import { describe, expect, it } from 'vitest';

import { parseEnv, upsertEnv } from './env-file';

describe('env file', () => {
  it('updates keys in place without duplicating or dropping unrelated entries', () => {
    const before = '# local testnet config\nFOO=old\nBAR=keep\n';

    const once = upsertEnv(before, { FOO: 'new', BAZ: 'added' });
    expect(once).toBe('# local testnet config\nFOO=new\nBAR=keep\nBAZ=added\n');

    const twice = upsertEnv(once, { FOO: 'new', BAZ: 'added' });
    expect(twice).toBe(once);
    expect(parseEnv(once)).toEqual({
      FOO: 'new',
      BAR: 'keep',
      BAZ: 'added',
    });
  });
});
