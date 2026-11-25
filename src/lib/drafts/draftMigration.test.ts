import { describe, expect, it } from 'vitest';
import { ensureMigrated } from './draftMigration.ts';

describe('ensureMigrated', () => {
  it('resolves immediately when IndexedDB is unavailable', async () => {
    // Live control: Node really has no IndexedDB.
    expect(typeof indexedDB).toBe('undefined');
    await expect(ensureMigrated()).resolves.toBeUndefined();
  });
});
