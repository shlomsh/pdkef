import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const { cacheRecentFileMock, commitHandoffMock } = vi.hoisted(() => ({ cacheRecentFileMock: vi.fn(), commitHandoffMock: vi.fn() }));
vi.mock('../drafts/draftStore.ts', () => ({ cacheRecentFile: cacheRecentFileMock, commitHandoff: commitHandoffMock }));

import { settleHandoff } from './settleHandoff.ts';

const bytes = new ArrayBuffer(2);

describe('settleHandoff', () => {
  beforeEach(() => {
    calls.length = 0;
    cacheRecentFileMock.mockReset().mockImplementation(async (_t, r) => { calls.push(`cache:${r.fileName}`); return true; });
    commitHandoffMock.mockReset().mockImplementation(async () => { calls.push('commit'); });
  });

  it('commits a multi record at once without caching its members (they must not take recents slots)', async () => {
    await settleHandoff('merge', { files: [{ fileName: 'a.pdf', fileBytes: bytes }, { fileName: 'b.pdf', fileBytes: bytes }] });
    expect(calls).toEqual(['commit']);
  });

  it('writes a bare entry: no preview, the type defaulted', async () => {
    await settleHandoff('sign', { fileName: 'a.pdf', fileBytes: bytes });
    expect(cacheRecentFileMock).toHaveBeenCalledWith('sign', { fileName: 'a.pdf', fileType: 'application/pdf', fileBytes: bytes });
  });

  it('skips non-PDF entries but still commits', async () => {
    await settleHandoff('compress', { fileName: 'a.png', fileType: 'image/png', fileBytes: bytes });
    expect(calls).toEqual(['commit']);
  });

  it('commits even when the cache write throws', async () => {
    cacheRecentFileMock.mockRejectedValueOnce(new Error('quota'));
    await settleHandoff('sign', { fileName: 'a.pdf', fileBytes: bytes });
    expect(calls).toEqual(['commit']);
  });
});
