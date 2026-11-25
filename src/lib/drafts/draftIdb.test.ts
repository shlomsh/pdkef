import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../telemetry/errorReport.ts', { spy: true });

import { reportError } from '../telemetry/errorReport.ts';
import { hasIndexedDB, reportStoreError } from './draftIdb.ts';

describe('draftIdb', () => {
  afterEach(() => { vi.mocked(reportError).mockClear(); });

  it('does not report the two environment errors', () => {
    reportStoreError('drafts', Object.assign(new Error('x'), { name: 'InvalidStateError' }), 'open');
    reportStoreError('drafts', Object.assign(new Error('x'), { name: 'UnknownError' }), 'open');
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports any other error', () => {
    const error = new Error('boom');
    reportStoreError('drafts', error, 'step');
    expect(reportError).toHaveBeenCalledWith('drafts', error, 'step');
  });

  // Last in the file: importing fake-indexeddb/auto installs a real indexedDB for the rest of it.
  it('detects whether IndexedDB exists', async () => {
    // Live control: Node really has no IndexedDB until the real implementation is loaded.
    expect(typeof indexedDB).toBe('undefined');
    expect(hasIndexedDB()).toBe(false);
    await import('fake-indexeddb/auto');
    expect(typeof indexedDB).toBe('object');
    expect(hasIndexedDB()).toBe(true);
  });
});
