import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportError = vi.fn();
vi.mock('../../lib/errorReport.ts', () => ({ reportError: (...args: unknown[]) => reportError(...args) }));
const runSavedFileCheck = vi.fn();
vi.mock('./check/runCheck.ts', () => ({ runSavedFileCheck: (...args: unknown[]) => runSavedFileCheck(...args) }));

import useSavedFileCheck from './useSavedFileCheck.ts';
import type { SavedFileCheckState } from './useSavedFileCheck.ts';

const bytes = () => Promise.resolve(new ArrayBuffer(4));
const unreadable = () => Object.assign(new Error('The requested file could not be read'), { name: 'NotReadableError' });

async function run(saved: Blob, heldBytes: ArrayBuffer | null = new ArrayBuffer(4)) {
  // Stable across renders: the hook's effect depends on the document identity.
  const pdfDocument = {} as never;
  let latest: SavedFileCheckState = { status: 'idle' };
  function Probe() {
    latest = useSavedFileCheck({
      pdfDocument, originalBytes: heldBytes, saved, boxes: [], findTerms: [], picturePages: [],
      detailEdits: {} as never, detailRows: [],
    }).state;
    return null;
  }
  const container = document.createElement('div');
  act(() => render(<Probe />, container));
  // The effect awaits two reads and a dynamic import before it settles.
  await act(() => new Promise((r) => setTimeout(r, 300)));
  return latest;
}

describe('useSavedFileCheck read errors', () => {
  beforeEach(() => {
    reportError.mockClear();
    runSavedFileCheck.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('treats a NotReadableError on the saved blob as the environment: no report, no failed state', async () => {
    const saved = Object.assign(new Blob(['x']), { arrayBuffer: () => Promise.reject(unreadable()) });
    const state = await run(saved);
    expect(reportError).not.toHaveBeenCalled();
    expect(state.status).toBe('idle');
  });

  it('still reports any other read error and shows the failed state', async () => {
    const saved = Object.assign(new Blob(['x']), { arrayBuffer: () => Promise.reject(new TypeError('boom')) });
    const state = await run(saved);
    expect(reportError).toHaveBeenCalledWith('redact', expect.any(TypeError), 'check_saved_file');
    expect(state.status).toBe('failed');
  });

  it('still reports an error from the check itself', async () => {
    runSavedFileCheck.mockRejectedValue(unreadable());
    const saved = Object.assign(new Blob(['x']), { arrayBuffer: bytes });
    const state = await run(saved);
    expect(reportError).toHaveBeenCalledWith('redact', expect.anything(), 'check_saved_file');
    expect(state.status).toBe('failed');
  });

  // DEBT-51: the File may have moved on disk; the bytes read at load are what the check compares.
  it('checks against the held bytes, so a File that moved on disk cannot fail it', async () => {
    runSavedFileCheck.mockResolvedValue({ traces: { saved: { thumbnails: [], pieceInfo: null } }, context: {} });
    const saved = Object.assign(new Blob(['x']), { arrayBuffer: bytes });
    const state = await run(saved);
    expect(reportError).not.toHaveBeenCalled();
    expect(state.status).toBe('done');
  });
});
