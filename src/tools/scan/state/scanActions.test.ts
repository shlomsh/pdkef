import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { createEditActions, createPageActions, pageViewActions } from './scanActions.ts';
import { ScanWork, type PageResult, type ScanPage } from './scanWork.ts';
import type { ScanDispatch, SetPages } from '../hooks/scanHost.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import type { Pins } from '../lib/edges/follow.ts';
import { newPage } from '../lib/scanPages.ts';
import { englishScanMessages as t } from '../messages.ts';
import { recordAction, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';

vi.mock('#lib/telemetry/actionTrail.ts', { spy: true });
vi.mock('#lib/telemetry/errorReport.ts', { spy: true });
vi.mock('../lib/scanPipeline.ts', { spy: true });
import { guessPage, splitQuads, tracePage } from '../lib/scanPipeline.ts';

const QUAD: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const MOVED: Quad = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }];
const photo = () => new File(['x'], 'a.jpg', { type: 'image/jpeg' });
const PINS: Pins = [[{ k: 0.5, at: { x: 0.5, y: 0.1 } }], [], [], []];
const SPINE = { top: 0.45, bottom: 0.55 };
const flush = drainPromises;
const aResult = (): PageResult => ({ key: 'k', url: 'blob:r', thumbUrl: 'blob:t', page: { blob: new Blob(['r']), width: 1, height: 1, thumb: new Blob(['t']), bentPx: 0 } });

type PageInput = Parameters<typeof createPageActions>[0];

function setup(pages: ScanPage[], extra: Partial<PageInput> = {}) {
  const work = new ScanWork();
  work.pages = pages;
  let current = pages;
  const setPagesCalls: unknown[] = [];
  const setPages: SetPages = (update) => { setPagesCalls.push(update); current = typeof update === 'function' ? update(current) : update; };
  const ctx = {
    pages, view: 'result' as const, failedIds: [] as number[], setRemoval: vi.fn(), setPages, setResults: vi.fn(), setCustomName: vi.fn(), setRejectedFiles: vi.fn(),
    forgetTurned: vi.fn(), work, unmountedRef: { current: false }, dispatch: vi.fn<ScanDispatch>(), announce: vi.fn<(text: string) => void>(),
    focusIdRef: { current: null as number | null }, ...extra,
  };
  return { ctx, work, setPagesCalls, pagesNow: () => current };
}

beforeEach(() => {
  vi.spyOn(URL, 'revokeObjectURL');
  vi.mocked(guessPage).mockClear();
  vi.mocked(splitQuads).mockClear();
  vi.mocked(tracePage).mockClear();
  resetActionTrailForTests();
  vi.mocked(recordAction).mockClear();
  vi.mocked(reportError).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createPageActions', () => {
  describe('findPage', () => {
    it('clears pins placed with the old corners', async () => {
      const page: ScanPage = { ...newPage(photo(), 'document'), sheet: true, opened: QUAD, quad: MOVED, edited: true, pins: PINS };
      const { ctx, pagesNow } = setup([page]);
      createPageActions(ctx).findPage(page);
      await flush();
      expect(pagesNow()[0]).toMatchObject({ quad: QUAD, pins: null });
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
      const page: ScanPage = { ...newPage(photo(), 'document'), sheet: true, opened: QUAD };
      const { ctx, pagesNow } = setup([page]);
      createPageActions(ctx).findPage(page);
      ctx.setPages((current) => current.map((p) => ({ ...p, quad: MOVED, edited: true })));
      await flush();
      expect(pagesNow()[0].quad).toEqual(MOVED);
    });
  });

  describe('traceCorners', () => {
    it('gives null without reading anything for an unknown or removed page', async () => {
      const page = newPage(photo(), 'document');
      const { ctx, work } = setup([page]);
      await expect(createPageActions(ctx).traceCorners(page.id + 99, QUAD)).resolves.toBeNull();
      work.removed.add(page.id);
      await expect(createPageActions(ctx).traceCorners(page.id, QUAD)).resolves.toBeNull();
      expect(tracePage).not.toHaveBeenCalled();
      expect(reportError).not.toHaveBeenCalled();
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
      work.results = { [a.id]: aResult() };
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
      work.results = { [a.id]: aResult() };
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

type EditInput = Parameters<typeof createEditActions>[0];

function editSetup(pages: ScanPage[], selectedIndex = 0, failedIds: number[] = [], extra: Partial<EditInput> = {}) {
  const { ctx, pagesNow, setPagesCalls } = setup(pages);
  const showResult = vi.fn<(page: ScanPage) => void>();
  const setDefaultFilter = vi.fn<EditInput['setDefaultFilter']>();
  const inspect = vi.fn<(page: ScanPage) => void>();
  const actions = createEditActions({ ...ctx, selected: pages[selectedIndex], selectedIndex, failedIds, setDefaultFilter, showResult, inspect, retakeFile: vi.fn(), removePage: vi.fn(), ...extra });
  return { ctx, actions, pagesNow, setPagesCalls, showResult, setDefaultFilter, inspect };
}

const arrow = (key: string, modifiers: { shiftKey?: boolean } = {}) => Object.assign(
  new Event('keydown', { cancelable: true }),
  { key, altKey: false, metaKey: false, ctrlKey: false, shiftKey: false, ...modifiers },
) as unknown as KeyboardEvent;

describe('createEditActions', () => {
  it('moves a tile with the arrow keys and says where it went', () => {
    const [a, b] = [newPage(photo(), 'document'), newPage(photo(), 'document')];
    const { ctx, actions, pagesNow } = editSetup([a, b]);
    const event = arrow('ArrowRight');
    actions.onTileKeyDown(event, a.id);
    expect(event.defaultPrevented).toBe(true);
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
    const retakeFile = vi.fn<(id: number, file: File) => void>();
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

const asking = (rightToLeft = false): ScanPage => ({ ...newPage(photo(), 'grayscale'), sheet: true, edited: true, question: { spine: SPINE, rightToLeft } });

describe('the split question (SCAN-67)', () => {
  function splitSetup() {
    const [before, page, after] = [newPage(photo(), 'document'), asking(), newPage(photo(), 'document')];
    return { ...editSetup([before, page, after], 1), before, page, after };
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

  it('does nothing without a selected page or a question', async () => {
    const plain = newPage(photo(), 'document');
    const { actions, pagesNow, ctx } = editSetup([plain], 0);
    actions.answerTwoPages(SPINE);
    await flush();
    expect(splitQuads).not.toHaveBeenCalled();
    expect(ctx.dispatch).not.toHaveBeenCalled();
    expect(pagesNow()).toEqual([plain]);
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
  function viewSetup(pages: ScanPage[], selected: ScanPage | undefined) {
    const made = editSetup(pages, 0);
    const traceCorners = vi.fn<Parameters<typeof pageViewActions>[0]['traceCorners']>();
    const retakeFile = vi.fn<(id: number, file: File) => void>();
    const edit = createEditActions({ ...made.ctx, selected, selectedIndex: 0, failedIds: [], setDefaultFilter: vi.fn(), showResult: made.showResult, inspect: made.inspect, retakeFile, removePage: vi.fn() });
    const actions = pageViewActions({ edit, findPage: vi.fn(), traceCorners, removePage: vi.fn(), selected, dispatch: made.ctx.dispatch });
    return { ...made, actions, traceCorners, retakeFile };
  }

  it('Retake works on the shown page, with the camera or a file', () => {
    const page = newPage(photo(), 'document');
    const { actions, traceCorners, ctx, retakeFile } = viewSetup([page], page);
    expect(actions.onTrace).toBe(traceCorners);
    actions.onRetakeCamera();
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'retakeOpened', pageId: page.id });
    const file = photo();
    actions.onRetake(file);
    expect(retakeFile).toHaveBeenCalledWith(page.id, file);
  });

  it('hands the split answers on from the edit actions', async () => {
    const page = asking();
    const { actions, ctx, pagesNow, showResult } = viewSetup([page], page);
    actions.onAskSplit();
    expect(ctx.dispatch).toHaveBeenLastCalledWith({ type: 'splitAsked', id: page.id });
    const placed = { top: 0.3, bottom: 0.7 };
    actions.onTwoPages(placed);
    expect(ctx.dispatch).toHaveBeenLastCalledWith({ type: 'splitStarted', id: page.id });
    await flush();
    expect(vi.mocked(splitQuads).mock.calls[0][1], 'the spine the person placed reaches the split').toEqual(placed);
    actions.onOnePage();
    expect(pagesNow()[0].question).toBeNull();
    expect(showResult).toHaveBeenCalledWith(page);
  });

  it('does nothing without a page', () => {
    const page = newPage(photo(), 'document');
    const { actions, ctx } = viewSetup([page], undefined);
    actions.onRetakeCamera();
    expect(ctx.dispatch).not.toHaveBeenCalled();
  });
});
