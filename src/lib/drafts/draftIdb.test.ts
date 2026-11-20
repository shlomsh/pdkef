import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../telemetry/errorReport.ts', { spy: true });

import { reportError } from '../telemetry/errorReport.ts';
import { hasIndexedDB, reportStoreError } from './draftIdb.ts';

describe('draftIdb', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.mocked(reportError).mockClear(); });

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

  it('detects whether IndexedDB exists', () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(hasIndexedDB()).toBe(false);
    vi.stubGlobal('indexedDB', {});
    expect(hasIndexedDB()).toBe(true);
  });
});
