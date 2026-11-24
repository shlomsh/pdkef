import { render } from 'preact';
import { useReducer } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScanBoard } from './useScanBoard.ts';
import { useScanPages } from './useScanPages.ts';
import { useScanRefs } from './useScanRefs.ts';
import { useScanSettings } from './useScanSettings.ts';
import { newPage, processArgs } from '../lib/scanPages.ts';
import * as pipeline from '../lib/scanPipeline.ts';
import { FULL_QUAD } from '../lib/quad.ts';
import { initialScanState, reduceScan } from '../state/scanState.ts';
import type { ScanWork } from '../state/scanWork.ts';
import { installToolHarness, type ToolHarness } from '../../../test/harness/toolHarness.ts';
import { brokenPhoto } from '../../../test/support/scanPhotos.ts';

// The pipeline runs for real; the spy only lets a test see whether its warp was asked for.
vi.mock('../lib/scanPipeline.ts', { spy: true });

describe('useScanPages', () => {
  let harness: ToolHarness;
  let host: HTMLDivElement;
  let pages: ReturnType<typeof useScanPages>;
  let work: ScanWork;

  // The hooks the island builds it from, none of them replaced. The page list stays empty: no page is
  // watched for a result, so a test hands the queue the one run it looks at.
  function Probe() {
    const [, dispatch] = useReducer(reduceScan, initialScanState);
    const settings = useScanSettings();
    const board = useScanBoard();
    const refs = useScanRefs();
    work = refs.work;
    pages = useScanPages({ pages: [], setPages: () => undefined, work, unmountedRef: refs.unmountedRef, dispatch, settings, ...board });
    return null;
  }

  beforeEach(() => {
    harness = installToolHarness({ trackIndexedDb: true });
    host = document.createElement('div');
    act(() => { render(<Probe />, host); });
  });

  afterEach(async () => {
    act(() => { render(null, host); });
    // The draft restore and the hand-off intake read IndexedDB: they must end while the DOM still exists.
    await harness.settle();
    harness.restore();
    vi.mocked(pipeline.processPage).mockClear();
  });

  it('skips work a newer corner made stale before its turn came', async () => {
    const page = newPage(brokenPhoto('a.jpg'), 'document');
    work.pages = [page];
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    // The queue is busy with one job, so the page's run waits behind it.
    const busy = work.enqueue(async () => { started.resolve(); await gate.promise; });
    await started.promise;
    const run = pages.processed(page);
    const outcome = run.then(() => 'ran', (err: unknown) => (err as Error).name);
    work.pages = [{ ...page, quad: [{ x: 0.1, y: 0.1 }, FULL_QUAD[1], FULL_QUAD[2], FULL_QUAD[3]] }];
    gate.resolve();
    await busy;
    expect(await outcome).toBe('AbortError');
    expect(pipeline.processPage).not.toHaveBeenCalled();
  });

  it('runs the warp with the page\'s own arguments when nothing moved before its turn', async () => {
    const page = newPage(brokenPhoto('a.jpg'), 'document');
    work.pages = [page];
    await pages.processed(page).catch(() => undefined);
    expect(pipeline.processPage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pipeline.processPage).mock.calls[0]).toEqual(processArgs(page));
  });
});
