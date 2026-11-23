import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { answerInTurn, answerNetwork } from '../../../test/support/network.browser.ts';
import { brokenPhoto, drawnCorners, photoOfNothing, photoOfPage } from '../../../test/support/scanTool.browser.tsx';
import { createEditActions, createPageActions, pageViewActions } from './scanActions.ts';
import { ScanWork, type ScanPage } from './scanWork.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins } from '../lib/edges/follow.ts';
import { newPage } from '../lib/scanPages.ts';
import { loadPipeline } from '../lib/loadPipeline.ts';
import { englishScanMessages as t } from '../messages.ts';
import { recordAction, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { resetUsageEventsForTests } from '#lib/telemetry/productAnalytics.ts';
import { resetErrorReportingForTests, setReportingEnabledForTests } from '#lib/telemetry/errorReport.ts';
import { HttpResponse } from 'msw';

vi.mock('#lib/telemetry/actionTrail.ts', { spy: true });
vi.mock('../lib/scanPipeline.ts', { spy: true });
import { guessPage, splitQuads, tracePage } from '../lib/scanPipeline.ts';

answerNetwork();

const QUAD: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const MOVED: Quad = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }];
const photo = () => new File(['x'], 'a.jpg', { type: 'image/jpeg' });
const PINS: Pins = [[{ k: 0.5, at: { x: 0.5, y: 0.1 } }], [], [], []];
const flush = drainPromises;

const encoded = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the photo did not encode'))), 'image/jpeg', 0.95);
});

async function photoOfSpread(name: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 700;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.fillStyle = '#f2efe6';
  ctx.fillRect(0, 0, 1000, 700);
  ctx.fillStyle = '#222222';
  for (const left of [40, 540]) {
    for (let i = 0; i < 20; i += 1) ctx.fillRect(left, 50 + i * 30, 420 - (i % 5) * 30, 9);
  }
  ctx.fillRect(498, 0, 4, 700);
  return new File([await encoded(canvas)], name, { type: 'image/jpeg' });
}

const finished = async (step: (...args: never[]) => unknown) => {
  await flush();
  await Promise.allSettled(vi.mocked(step).mock.results.map((r) => r.value));
  await flush();
};
const read = (step: (...args: never[]) => unknown, call = 0) => vi.mocked(step).mock.results[call].value;
let seen: ReturnType<typeof answerInTurn>;
const reports = async () => {
  const bodies = vi.mocked(navigator.sendBeacon).mock.calls.filter(([url]) => url === '/api/report').map(([, body]) => body as Blob);
  await seen.arrived(bodies.length);
  return Promise.all(bodies.map(async (body) => JSON.parse(await body.text())));
};
const meanX = (quad: Quad) => quad.reduce((sum, p) => sum + p.x, 0) / 4;

function setup(pages: ScanPage[], extra: Record<string, unknown> = {}) {
  const work = new ScanWork();
  work.pages = pages;
  let current = pages;
  const setPagesCalls: unknown[] = [];
  const setPages = (update: ScanPage[] | ((p: ScanPage[]) => ScanPage[])) => { setPagesCalls.push(update); current = typeof update === 'function' ? update(current) : update; };
  const ctx = {
    pages, view: 'result' as const, failedIds: [] as number[], setRemoval: vi.fn(), setPages, setResults: vi.fn(), setCustomName: vi.fn(), setRejectedFiles: vi.fn(),
    forgetTurned: vi.fn(), work, unmountedRef: { current: false }, dispatch: vi.fn(), announce: vi.fn(),
    focusIdRef: { current: null as number | null }, ...extra,
  };
  return { ctx, work, setPagesCalls, pagesNow: () => current };
}

let spread: File;
beforeAll(async () => {
  await loadPipeline();
  spread = await photoOfSpread('spread.jpg');
});

beforeEach(() => {
  vi.spyOn(URL, 'revokeObjectURL');
  vi.spyOn(navigator, 'sendBeacon');
  setReportingEnabledForTests(true);
  resetErrorReportingForTests();
  seen = answerInTurn('post', '/api/report', () => new HttpResponse(null, { status: 204 }), () => new HttpResponse(null, { status: 204 }));
  vi.mocked(guessPage).mockClear();
  vi.mocked(splitQuads).mockClear();
  vi.mocked(tracePage).mockClear();
  resetActionTrailForTests();
  resetUsageEventsForTests();
  vi.mocked(recordAction).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  setReportingEnabledForTests(false);
});

describe('createPageActions', () => {
  describe('findPage', () => {
    it('makes what it finds the person\'s corners', async () => {
      const page = newPage(await photoOfPage('a.jpg'), 'document');
      const { ctx, pagesNow } = setup([page]);
      createPageActions(ctx).findPage(page);
      await finished(guessPage);
      const found = await read(guessPage);
      expect(found).toHaveLength(4);
      drawnCorners().forEach((corner, i) => {
        expect(found[i].x).toBeCloseTo(corner.x, 1);
        expect(found[i].y).toBeCloseTo(corner.y, 1);
      });
      expect(ctx.dispatch.mock.calls.map((c) => c[0].type)).toEqual(['findStarted', 'findEnded', 'findFound']);
      expect(pagesNow()[0]).toMatchObject({ quad: found, edited: true, found: true });
      expect(ctx.announce).toHaveBeenCalledWith(t.pageFoundAnnounce);
    });
    it('clears pins placed with the old corners', async () => {
      const page = { ...newPage(await photoOfPage('a.jpg'), 'document'), pins: PINS };
      const { ctx, pagesNow } = setup([page]);
      createPageActions(ctx).findPage(page);
      await finished(guessPage);
      expect(pagesNow()[0]).toMatchObject({ quad: await read(guessPage), pins: null });
    });
    it('says so when nothing is found, and when the search fails', async () => {
      const [empty, broken] = [newPage(await photoOfNothing('a.jpg'), 'document'), newPage(brokenPhoto('b.jpg'), 'document')];
      const { ctx } = setup([empty, broken]);
      createPageActions(ctx).findPage(empty);
      await finished(guessPage);
      expect(await read(guessPage, 0)).toBeNull();
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'findMissed', id: empty.id });
      expect(ctx.announce).toHaveBeenCalledWith(t.findMissed);
      expect(await reports()).toEqual([]);
      createPageActions(ctx).findPage(broken);
      await finished(guessPage);
      await expect(read(guessPage, 1)).rejects.toThrow();
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'findMissed', id: broken.id });
      expect(await reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'scan_find_page' }]);
    });
    it('goes back to the corners a PDF sheet opened with, and reads no edges on it (SCAN-55)', async () => {
      const page = { ...newPage(photo(), 'document'), sheet: true, opened: QUAD, quad: MOVED, edited: true };
      const { ctx, pagesNow } = setup([page]);
      createPageActions(ctx).findPage(page);
      await flush();
      expect(guessPage).not.toHaveBeenCalled();
      expect(pagesNow()[0]).toMatchObject({ quad: QUAD, edited: true, found: true });
    });
    it('finds nothing on a sheet saved with no opening corners (SCAN-55)', async () => {
      const page = { ...newPage(photo(), 'document'), sheet: true, quad: MOVED, edited: true };
      const { ctx, pagesNow } = setup([page]);
      createPageActions(ctx).findPage(page);
      await flush();
      expect(guessPage).not.toHaveBeenCalled();
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'findMissed', id: page.id });
      expect(pagesNow()[0].quad).toEqual(MOVED);
    });
    it('keeps corners the person moved while the guess waited', async () => {
      const page = newPage(await photoOfPage('a.jpg'), 'document');
      const { ctx, pagesNow } = setup([page]);
      createPageActions(ctx).findPage(page);
      ctx.setPages((current: ScanPage[]) => current.map((p) => ({ ...p, quad: MOVED, edited: true })));
      await finished(guessPage);
      expect(await read(guessPage)).toHaveLength(4);
      expect(pagesNow()[0].quad).toEqual(MOVED);
    });
    it('does nothing once the island is gone', async () => {
      const page = newPage(await photoOfPage('a.jpg'), 'document');
      const { ctx } = setup([page], { unmountedRef: { current: true } });
      createPageActions(ctx).findPage(page);
      await finished(guessPage);
      expect(await read(guessPage)).toHaveLength(4);
      expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('traceCorners', () => {
    it('traces the preview when there is one, and hands back what the pipeline reads', async () => {
      const page = newPage(await photoOfNothing('a.jpg'), 'document');
      const { ctx, work } = setup([page]);
      const preview = await photoOfPage('p.jpg');
      work.previewBlobs.set(page.id, preview);
      const sides = await createPageActions(ctx).traceCorners(page.id, QUAD);
      expect(sides).toHaveLength(4);
      expect(sides).toBe(await read(tracePage));
      expect(vi.mocked(tracePage).mock.calls[0][0]).toBe(preview);
      expect(vi.mocked(tracePage).mock.calls[0].slice(1)).toEqual([QUAD, null]);
    });
    it('passes the pins it is given on to the pipeline', async () => {
      const page = newPage(await photoOfPage('a.jpg'), 'document');
      const { ctx } = setup([page]);
      await createPageActions(ctx).traceCorners(page.id, QUAD, PINS);
      expect(vi.mocked(tracePage).mock.calls[0][0]).toBe(page.file);
      expect(vi.mocked(tracePage).mock.calls[0].slice(1)).toEqual([QUAD, PINS]);
    });
    it('traces the page\'s own file when no preview exists', async () => {
      const page = newPage(await photoOfPage('a.jpg'), 'document');
      const { ctx } = setup([page]);
      await createPageActions(ctx).traceCorners(page.id, MOVED);
      expect(vi.mocked(tracePage).mock.calls[0][0]).toBe(page.file);
      expect(vi.mocked(tracePage).mock.calls[0].slice(1)).toEqual([MOVED, null]);
    });
    it('gives null without reading anything for an unknown or removed page', async () => {
      const page = newPage(photo(), 'document');
      const { ctx, work } = setup([page]);
      await expect(createPageActions(ctx).traceCorners(page.id + 99, QUAD)).resolves.toBeNull();
      work.removed.add(page.id);
      await expect(createPageActions(ctx).traceCorners(page.id, QUAD)).resolves.toBeNull();
      expect(tracePage).not.toHaveBeenCalled();
    });
    it('gives null and reports once when the pipeline fails', async () => {
      const page = newPage(brokenPhoto('a.jpg'), 'document');
      const { ctx } = setup([page]);
      await expect(createPageActions(ctx).traceCorners(page.id, QUAD)).resolves.toBeNull();
      expect(await reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'scan_trace_page' }]);
    });
    it('is read-only: no state change, dispatch or recorded action', async () => {
      const page = newPage(await photoOfPage('a.jpg'), 'document');
      const { ctx, setPagesCalls } = setup([page]);
      await createPageActions(ctx).traceCorners(page.id, QUAD);
      expect(tracePage).toHaveBeenCalledTimes(1);
      expect(setPagesCalls).toEqual([]);
      expect(ctx.dispatch).not.toHaveBeenCalled();
      expect(recordAction).not.toHaveBeenCalled();
    });
  });

  describe('removePage', () => {
    it('ignores a page that is not there', () => {
      const { ctx, setPagesCalls } = setup([newPage(photo(), 'document')]);
      createPageActions(ctx).removePage(-1);
      expect(setPagesCalls).toEqual([]);
    });
    it('drops the page, its work and its result, and lands on the neighbour', () => {
      const [a, b] = [newPage(photo(), 'document'), newPage(photo(), 'document')];
      const { ctx, work, pagesNow } = setup([a, b]);
      work.results = { [a.id]: { key: 'k', url: 'blob:r', thumbUrl: 'blob:t', page: {} as never } };
      createPageActions(ctx).removePage(a.id);
      expect(pagesNow()).toEqual([b]);
      expect(work.removed.has(a.id)).toBe(true);
      expect(work.results).toEqual({});
      expect(ctx.setResults).toHaveBeenCalledWith({});
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'pageRemoved', id: a.id, neighbourId: b.id });
      expect(ctx.focusIdRef.current).toBe(b.id);
      expect(recordAction).toHaveBeenCalledWith('remove_file');
    });
    it('holds a read page for Undo with its work intact, then lets it go after five seconds', () => {
      vi.useFakeTimers();
      const [a, b] = [{ ...newPage(photo(), 'document'), guessed: true, preview: 'blob:p' }, newPage(photo(), 'document')];
      const { ctx, work, pagesNow } = setup([a, b], { failedIds: [a.id] });
      work.results = { [a.id]: { key: 'k', url: 'blob:r', thumbUrl: 'blob:t', page: {} as never } };
      const actions = createPageActions(ctx);
      actions.removePage(a.id);
      expect(pagesNow()).toEqual([b]);
      expect(work.removal).toEqual({ page: a, index: 0, failed: true });
      expect(work.removed.has(a.id)).toBe(false);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      actions.undoRemove();
      expect(pagesNow()).toEqual([a, b]);
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'pageRestored', id: a.id, failed: true });
      expect(recordAction).toHaveBeenCalledWith('undo');
      expect(work.removal).toBeNull();
      actions.removePage(a.id);
      vi.advanceTimersByTime(5000);
      expect(work.removal).toBeNull();
      expect(work.removed.has(a.id)).toBe(true);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:r');
      vi.useRealTimers();
    });
    it('drops a page still being read at once, and holds it once it failed', () => {
      const reading = () => ({ ...newPage(photo(), 'document'), guessed: true, preview: null });
      const [a, b, c] = [reading(), newPage(photo(), 'document'), reading()];
      const first = setup([a, b]);
      createPageActions(first.ctx).removePage(a.id);
      expect(first.work.removal).toBeNull();
      expect(first.work.removed.has(a.id)).toBe(true);
      const second = setup([c, b], { failedIds: [c.id] });
      createPageActions(second.ctx).removePage(c.id);
      expect(second.work.removal).toEqual({ page: c, index: 0, failed: true });
    });
    it('starts over when the last page goes', () => {
      const a = newPage(photo(), 'document');
      const { ctx } = setup([a]);
      createPageActions(ctx).removePage(a.id);
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'cleared' });
      expect(ctx.announce).toHaveBeenLastCalledWith(t.announceCleared);
    });

    it('lets a PDF keep coming in when the only page so far goes', () => {
      const a = newPage(photo(), 'document');
      const { ctx, work } = setup([a]);
      const { signal } = work.pdfImport;
      createPageActions(ctx).removePage(a.id);
      expect(signal.aborted).toBe(false);
    });
  });

  it('reset frees everything and clears the name, the skipped files and the download', () => {
    const a = newPage(photo(), 'document');
    const { ctx, work } = setup([a]);
    work.urls = ['blob:1'];
    work.resetDownloadFlow = vi.fn();
    createPageActions(ctx).reset();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
    expect(work.removed.has(a.id)).toBe(true);
    expect(ctx.setCustomName).toHaveBeenCalledWith(null);
    expect(ctx.setRejectedFiles).toHaveBeenCalledWith([]);
    expect(work.resetDownloadFlow).toHaveBeenCalled();
    expect(ctx.forgetTurned).toHaveBeenCalled();
  });

  it('reset ends the PDFs still coming in', () => {
    const { ctx, work } = setup([newPage(photo(), 'document')]);
    const { signal } = work.pdfImport;
    createPageActions(ctx).reset();
    expect(signal.aborted).toBe(true);
    expect(work.pdfImport.signal.aborted).toBe(false);
  });
});

describe('createEditActions', () => {
  function editSetup(pages: ScanPage[], selectedIndex = 0, failedIds: number[] = [], extra: Record<string, unknown> = {}) {
    const { ctx, pagesNow, setPagesCalls } = setup(pages);
    const showResult = vi.fn();
    const setDefaultFilter = vi.fn();
    const inspect = vi.fn();
    const actions = createEditActions({ ...ctx, selected: pages[selectedIndex], selectedIndex, failedIds, setDefaultFilter, showResult, inspect, retakeFile: vi.fn(), removePage: vi.fn(), ...extra });
    return { ctx, actions, pagesNow, setPagesCalls, showResult, setDefaultFilter, inspect };
  }
  const arrow = (key: string, extra = {}) => ({ key, altKey: false, metaKey: false, ctrlKey: false, shiftKey: false, preventDefault: vi.fn(), ...extra }) as unknown as KeyboardEvent;

  it('moves a tile with the arrow keys and says where it went', () => {
    const [a, b] = [newPage(photo(), 'document'), newPage(photo(), 'document')];
    const { ctx, actions, pagesNow } = editSetup([a, b]);
    const event = arrow('ArrowRight');
    actions.onTileKeyDown(event, a.id);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(pagesNow()).toEqual([b, a]);
    expect(ctx.focusIdRef.current).toBe(a.id);
    expect(recordAction).toHaveBeenCalledWith('reorder');
  });
  it('leaves other keys, modified keys and the ends of the list alone', () => {
    const [a, b] = [newPage(photo(), 'document'), newPage(photo(), 'document')];
    const { actions, setPagesCalls } = editSetup([a, b]);
    actions.onTileKeyDown(arrow('a'), a.id);
    actions.onTileKeyDown(arrow('ArrowRight', { shiftKey: true }), a.id);
    actions.onTileKeyDown(arrow('ArrowLeft'), a.id);
    expect(setPagesCalls).toEqual([]);
  });
  it('keeps the corners a person moved', () => {
    const a = newPage(photo(), 'document');
    const { actions, pagesNow } = editSetup([a]);
    actions.commitCorners(a.id, QUAD);
    expect(pagesNow()[0]).toMatchObject({ quad: QUAD, edited: true });
  });
  it('stores the pins placed with the corners', () => {
    const a = newPage(photo(), 'document');
    const { actions, pagesNow } = editSetup([a]);
    actions.commitCorners(a.id, QUAD, PINS);
    expect(pagesNow()[0]).toMatchObject({ quad: QUAD, pins: PINS, edited: true });
  });
  it('clears pins that were there when corners are committed without any', () => {
    const a = { ...newPage(photo(), 'document'), pins: PINS };
    const { actions, pagesNow } = editSetup([a]);
    actions.commitCorners(a.id, MOVED);
    expect(pagesNow()[0]).toMatchObject({ quad: MOVED, pins: null });
  });
  it('sets fine when commitCorners is given it, and leaves it alone when not', () => {
    // Protects: Fine-tune edges is the person's per-page choice; a plain corner drag must not flip it.
    const a = newPage(photo(), 'document');
    const { actions, pagesNow } = editSetup([a]);
    actions.commitCorners(a.id, QUAD, null, true);
    expect(pagesNow()[0].fine).toBe(true);
    actions.commitCorners(a.id, MOVED);
    expect(pagesNow()[0].fine).toBe(true);
    actions.commitCorners(a.id, QUAD, null, false);
    expect(pagesNow()[0].fine).toBe(false);
  });
  it('makes a chosen look the page\'s and the next photo\'s, and ignores the look it already has', () => {
    const a = newPage(photo(), 'document');
    const { actions, pagesNow, setDefaultFilter } = editSetup([a]);
    actions.chooseLook('document');
    expect(setDefaultFilter).not.toHaveBeenCalled();
    actions.chooseLook('grayscale');
    expect(pagesNow()[0].filter).toBe('grayscale');
    expect(setDefaultFilter).toHaveBeenCalledWith('grayscale');
  });
  it('turns the selected page a quarter and says which', () => {
    const a = newPage(photo(), 'document');
    const { ctx, actions, pagesNow } = editSetup([a]);
    actions.rotatePage(a.id);
    expect(pagesNow()[0].turns).toBe(1);
    expect(ctx.announce).toHaveBeenCalledTimes(1);
  });
  it('shows the first page that could not be read', () => {
    const [a, b] = [newPage(photo(), 'document'), newPage(photo(), 'document')];
    const { ctx, actions } = editSetup([a, b], 0, [b.id]);
    actions.showFailedPage();
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'failedPageShown', id: b.id });
  });
  it('approving the corners returns to the result on the same page', () => {
    const [a, b] = [newPage(photo(), 'document'), newPage(photo(), 'document')];
    const { ctx, actions, showResult } = editSetup([a, b]);
    actions.approveCorners();
    expect(showResult).toHaveBeenCalledWith(a);
    expect(ctx.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'pageSelected' }));
    expect(ctx.announce).toHaveBeenCalledWith(t.announceResult);
  });
  it('opens and closes a page', () => {
    const a = newPage(photo(), 'document');
    const { ctx, actions } = editSetup([a]);
    actions.openPage(a.id);
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'pageOpened', id: a.id });
    actions.closePage();
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'tableShown' });
  });
  it('retakes a page through the host', () => {
    const a = newPage(photo(), 'document');
    const retakeFile = vi.fn();
    const { actions } = editSetup([a], 0, [], { retakeFile });
    const file = photo();
    actions.retakePage(a.id, file);
    expect(retakeFile).toHaveBeenCalledWith(a.id, file);
  });
  it('opens the corners again from the head', () => {
    const a = newPage(photo(), 'document');
    const { ctx, actions } = editSetup([a]);
    actions.adjustCorners();
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'cornersOpened', focus: true });
  });
});

const SPINE = { top: 0.45, bottom: 0.55 };
const asking = (rightToLeft = false, file: File = photo()): ScanPage => ({ ...newPage(file, 'grayscale'), sheet: true, edited: true, question: { spine: SPINE, rightToLeft } });

describe('the split question (SCAN-67)', () => {
  function splitSetup(rightToLeft = false, source: File = spread) {
    const [before, page, after] = [newPage(photo(), 'document'), asking(rightToLeft, source), newPage(photo(), 'document')];
    const made = editSetup([before, page, after], 1);
    made.ctx.work.previewBlobs.set(page.id, source.slice(0, source.size, 'image/jpeg'));
    return { ...made, before, page, after };
  }
  function editSetup(pages: ScanPage[], selectedIndex: number) {
    const { ctx, pagesNow } = setup(pages);
    const showResult = vi.fn();
    const inspect = vi.fn();
    const actions = createEditActions({ ...ctx, selected: pages[selectedIndex], selectedIndex, failedIds: [], setDefaultFilter: vi.fn(), showResult, inspect, retakeFile: vi.fn(), removePage: vi.fn() });
    return { ctx, actions, pagesNow, showResult, inspect };
  }

  it('opens a page that asks on its question, and any other on its result', () => {
    const [plain, page] = [newPage(photo(), 'document'), asking()];
    const { ctx, actions } = editSetup([plain, page], 0);
    actions.openPage(page.id);
    expect(ctx.dispatch).toHaveBeenLastCalledWith({ type: 'splitAsked', id: page.id });
    actions.openPage(plain.id);
    expect(ctx.dispatch).toHaveBeenLastCalledWith({ type: 'pageOpened', id: plain.id });
  });

  it('asks again for the selected page on request', () => {
    const { ctx, actions, page } = splitSetup();
    actions.askSplit();
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'splitAsked', id: page.id });
  });

  it('One page drops the question and shows the result', () => {
    const { actions, pagesNow, showResult, page, ctx } = splitSetup();
    actions.answerOnePage();
    expect(pagesNow()[1].question).toBeNull();
    expect(showResult).toHaveBeenCalledWith(page);
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'scrollFocusRequested', top: true, focus: true });
  });

  it('Two pages puts the pages in the sheet\'s place, left page first, each with its own corners', async () => {
    const { ctx, actions, pagesNow, before, after, page, inspect } = splitSetup();
    const preview = ctx.work.previewBlobs.get(page.id);
    actions.answerTwoPages(SPINE);
    await finished(splitQuads);
    const [left, right]: Quad[] = await read(splitQuads);
    expect(meanX(left)).toBeLessThan(0.5);
    expect(meanX(right)).toBeGreaterThan(0.5);
    const now = pagesNow();
    expect(now.map((p) => p.id)).toEqual([before.id, now[1].id, now[2].id, after.id]);
    expect(vi.mocked(splitQuads).mock.calls[0][0]).toBe(preview);
    expect(vi.mocked(splitQuads).mock.calls[0][1]).toEqual(SPINE);
    expect(now.slice(1, 3)).toEqual([
      expect.objectContaining({ file: page.file, filter: 'grayscale', quad: left, opened: left, sheet: true, edited: true, guessed: true, found: true, question: null }),
      expect.objectContaining({ file: page.file, quad: right, opened: right, question: null }),
    ]);
    expect(now.slice(1, 3).map((p) => p.pins)).toEqual([null, null]);
    expect(now[1].id).not.toBe(page.id);
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(ctx.work.removed.has(page.id)).toBe(true);
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'splitMade', oldId: page.id, newId: now[1].id });
    expect(ctx.announce).toHaveBeenCalledWith(t.announceSplit.replace('{position}', '2'));
    expect(recordAction).toHaveBeenCalledWith('change_setting');
    expect(ctx.dispatch.mock.calls.map((c) => c[0].type)).toContain('splitStarted');
    expect(ctx.dispatch.mock.calls.map((c) => c[0].type)).toContain('splitEnded');
  });

  it('Two pages on a right-to-left sheet reads the right page first', async () => {
    const { actions, pagesNow } = splitSetup(true);
    actions.answerTwoPages(SPINE);
    await finished(splitQuads);
    const [left, right]: Quad[] = await read(splitQuads);
    expect(pagesNow().slice(1, 3).map((p) => p.quad)).toEqual([right, left]);
  });

  it('keeps the sheet and its question when the split fails, and reports it', async () => {
    const { ctx, actions, pagesNow, page } = splitSetup(false, brokenPhoto('broken.jpg'));
    actions.answerTwoPages(SPINE);
    await finished(splitQuads);
    await expect(read(splitQuads)).rejects.toThrow();
    expect(pagesNow()[1]).toBe(page);
    expect(await reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'scan_split_sheet' }]);
    expect(ctx.work.removed.has(page.id)).toBe(false);
    expect(ctx.dispatch).toHaveBeenLastCalledWith({ type: 'splitEnded', id: page.id, failed: true });
  });

  it('does nothing without a selected page or a question', async () => {
    const plain = newPage(photo(), 'document');
    const { actions, pagesNow } = editSetup([plain], 0);
    actions.answerTwoPages(SPINE);
    await flush();
    expect(splitQuads).not.toHaveBeenCalled();
    expect(pagesNow()).toEqual([plain]);
  });

  it('leaves the list alone when the sheet was answered while the split ran', async () => {
    const { actions, pagesNow, ctx } = splitSetup();
    actions.answerTwoPages(SPINE);
    ctx.work.pages = ctx.work.pages.map((p) => ({ ...p, question: null }));
    await finished(splitQuads);
    expect(await read(splitQuads)).toHaveLength(2);
    expect(pagesNow()).toHaveLength(3);
  });

  it('moving a corner or turning the sheet answers it as one page', () => {
    const { actions, pagesNow, page } = splitSetup();
    actions.commitCorners(page.id, QUAD);
    expect(pagesNow()[1]).toMatchObject({ quad: QUAD, question: null });
    const again = splitSetup();
    again.actions.rotatePage(again.page.id);
    expect(again.pagesNow()[1]).toMatchObject({ turns: 1, question: null });
  });
});

describe('pageViewActions', () => {
  const edit = { retakePage: vi.fn() } as unknown as Parameters<typeof pageViewActions>[0]['edit'];
  const page = { id: 7 } as ScanPage;

  it('Retake works on the shown page, with the camera or a file', () => {
    const dispatch = vi.fn();
    const traceCorners = vi.fn();
    const actions = pageViewActions({ edit, findPage: vi.fn(), traceCorners, removePage: vi.fn(), selected: page, dispatch });
    expect(actions.onTrace).toBe(traceCorners);
    actions.onRetakeCamera();
    expect(dispatch).toHaveBeenCalledWith({ type: 'retakeOpened', pageId: 7 });
    const file = new File(['x'], 'a.jpg');
    actions.onRetake(file);
    expect(edit.retakePage).toHaveBeenCalledWith(7, file);
  });

  it('hands the split answers on from the edit actions', () => {
    const split = { askSplit: vi.fn(), answerOnePage: vi.fn(), answerTwoPages: vi.fn() };
    const actions = pageViewActions({ edit: split as never, findPage: vi.fn(), traceCorners: vi.fn(), removePage: vi.fn(), selected: page, dispatch: vi.fn() });
    actions.onAskSplit();
    actions.onOnePage();
    actions.onTwoPages(SPINE);
    expect(split.askSplit).toHaveBeenCalled();
    expect(split.answerOnePage).toHaveBeenCalled();
    expect(split.answerTwoPages).toHaveBeenCalledWith(SPINE);
  });

  it('does nothing without a page', () => {
    const dispatch = vi.fn();
    pageViewActions({ edit, findPage: vi.fn(), traceCorners: vi.fn(), removePage: vi.fn(), selected: undefined, dispatch }).onRetakeCamera();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
