import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reportError = vi.fn();
vi.mock('#lib/telemetry/errorReport.ts', async (importActual) => ({ ...(await importActual<object>()), reportError: (...args: unknown[]) => reportError(...args) }));
const runSavedFileCheck = vi.fn();
vi.mock('../lib/check/runCheck.ts', () => ({ runSavedFileCheck: (...args: unknown[]) => runSavedFileCheck(...args) }));

import useSavedFileCheck from './useSavedFileCheck.ts';
import type { SavedFileCheckState } from './useSavedFileCheck.ts';
import { DETAILS_SURVIVED_ANNOUNCEMENT } from '../lib/check/checkCopy.ts';

const bytes = () => Promise.resolve(new ArrayBuffer(4));
const unreadable = () => Object.assign(new Error('The requested file could not be read'), { name: 'NotReadableError' });

async function run(saved: Blob, heldBytes: ArrayBuffer | null = new ArrayBuffer(4)) {
  // Stable across renders: the hook's effect depends on the document identity.
  const pdfDocument = {} as never;
  let latest: SavedFileCheckState = { status: 'idle' };
  function Probe() {
    latest = useSavedFileCheck({
      pdfDocument, originalBytes: heldBytes, saved, boxes: [], deletedWords: [], picturePages: [],
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

  // RED-69: a tab left open across a deploy cannot load the check's chunk; a reload fixes it.
  it('asks for a reload, and still reports, when the check code cannot load', async () => {
    runSavedFileCheck.mockRejectedValue(new TypeError('Importing a module script failed.'));
    const saved = Object.assign(new Blob(['x']), { arrayBuffer: bytes });
    const state = await run(saved);
    expect(reportError).toHaveBeenCalledWith('redact', expect.any(TypeError), 'check_saved_file');
    expect(state.status).toBe('updated');
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

describe('useSavedFileCheck results', () => {
  const blob = () => Object.assign(new Blob(['x']), { arrayBuffer: bytes });
  const outcomeOf = (traces: object) => ({ traces: { saved: { thumbnails: [], pieceInfo: null, ...traces } }, context: {} });
  const settle = () => act(() => new Promise((r) => setTimeout(r, 50)));
  const deferred = () => {
    let resolve!: (value: unknown) => void;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
  };

  // A rendered hook whose export can change under it, as it does when the person edits and exports again.
  function mount(first: Blob | null, announce?: (message: string) => void) {
    const pdfDocument = {} as never;
    const heldBytes = new ArrayBuffer(4);
    const seen = { state: { status: 'idle' } as SavedFileCheckState, detailsSurvived: [] as string[] };
    function Probe({ saved }: { saved: Blob | null }) {
      const result = useSavedFileCheck({
        pdfDocument, originalBytes: heldBytes, saved, boxes: [], deletedWords: [], picturePages: [],
        announce, detailEdits: {} as never, detailRows: [],
      });
      seen.state = result.state;
      seen.detailsSurvived = result.detailsSurvived;
      return null;
    }
    const container = document.createElement('div');
    act(() => render(<Probe saved={first} />, container));
    return { seen, exportAgain: (saved: Blob | null) => act(() => render(<Probe saved={saved} />, container)) };
  }

  beforeEach(() => {
    reportError.mockClear();
    runSavedFileCheck.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('does not let a slow check for an old export overwrite the result of the newer export', async () => {
    const announce = vi.fn();
    const older = deferred();
    const newer = outcomeOf({});
    runSavedFileCheck.mockReturnValueOnce(older.promise).mockResolvedValueOnce(newer);
    const { seen, exportAgain } = mount(blob(), announce);
    await settle();
    await exportAgain(blob());
    await settle();
    expect(seen.state).toEqual({ status: 'done', outcome: newer, typed: [] });

    older.resolve(outcomeOf({ thumbnails: [{}], pieceInfo: {} }));
    await settle();
    expect(seen.state).toEqual({ status: 'done', outcome: newer, typed: [] });
    expect(seen.detailsSurvived).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('shows nothing once the export goes stale, even when its check finishes afterwards', async () => {
    const announce = vi.fn();
    const pending = deferred();
    runSavedFileCheck.mockReturnValueOnce(pending.promise);
    const { seen, exportAgain } = mount(blob(), announce);
    await settle();
    expect(seen.state.status).toBe('checking');
    await exportAgain(null);
    expect(seen.state.status).toBe('idle');

    pending.resolve(outcomeOf({ thumbnails: [{}] }));
    await settle();
    expect(seen.state.status).toBe('idle');
    expect(seen.detailsSurvived).toEqual([]);
    expect(announce).not.toHaveBeenCalled();
  });

  it('says so, and reports it, when even one trace survives the export', async () => {
    const announce = vi.fn();
    runSavedFileCheck.mockResolvedValue(outcomeOf({ thumbnails: [{}] }));
    const { seen } = mount(blob(), announce);
    await settle();
    expect(seen.detailsSurvived).toEqual(['Page pictures']);
    expect(announce).toHaveBeenCalledWith(DETAILS_SURVIVED_ANNOUNCEMENT('Page pictures'));
    expect(reportError).toHaveBeenCalledWith('redact', expect.any(Error), 'export_trace_survived');
  });

  it('stays quiet when no trace survives', async () => {
    const announce = vi.fn();
    runSavedFileCheck.mockResolvedValue(outcomeOf({}));
    const { seen } = mount(blob(), announce);
    await settle();
    expect(seen.state.status).toBe('done');
    expect(announce).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });
});
