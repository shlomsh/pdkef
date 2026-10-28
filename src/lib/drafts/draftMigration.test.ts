import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureMigrated } from './draftMigration.ts';

describe('ensureMigrated', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves immediately when IndexedDB is unavailable', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(ensureMigrated()).resolves.toBeUndefined();
  });
});
