import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEditActions, createPageActions } from './scanActions.ts';
import { ScanWork, type ScanPage } from './scanWork.ts';
import type { Quad } from '../lib/quad.ts';
import { newPage } from '../lib/scanPages.ts';
import { englishScanMessages as t } from '../messages.ts';
import { recordAction } from '../../../lib/telemetry/actionTrail.ts';
import { reportError } from '../../../lib/telemetry/errorReport.ts';

vi.mock('../../../lib/telemetry/actionTrail.ts', () => ({ recordAction: vi.fn() }));
vi.mock('../../../lib/telemetry/productAnalytics.ts', () => ({ reportEdit: vi.fn() }));
vi.mock('../../../lib/telemetry/errorReport.ts', () => ({ reportError: vi.fn() }));
// EDGE: the real pipeline decodes photos on canvases, which node does not have.
const guessPage = vi.fn();
vi.mock('../lib/loadPipeline.ts', () => ({ loadPipeline: () => Promise.resolve({ guessPage }) }));

const QUAD: Quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
const photo = () => new File(['x'], 'a.jpg', { type: 'image/jpeg' });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(pages: ScanPage[], extra: Record<string, unknown> = {}) {
  const work = new ScanWork();
  work.pages = pages;
  let current = pages;
  const setPages = vi.fn((update) => { current = typeof update === 'function' ? update(current) : update; });
  const ctx = {
    pages, view: 'result' as const, setPages, setResults: vi.fn(), setCustomName: vi.fn(), setRejectedFiles: vi.fn(),
    forgetTurned: vi.fn(), work, unmountedRef: { current: false }, dispatch: vi.fn(), announce: vi.fn(),
    focusIdRef: { current: null as number | null }, ...extra,
  };
  return { ctx, work, pagesNow: () => current };
}

beforeEach(() => {
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  guessPage.mockReset();
  vi.mocked(recordAction).mockClear();
  vi.mocked(reportError).mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('createPageActions', () => {
  describe('findPage', () => {
    it('makes what it finds the person\'s corners', async () => {
      const page = newPage(photo(), 'document');
      const { ctx, pagesNow } = setup([page]);
      guessPage.mockResolvedValue(QUAD);
      createPageActions(ctx).findPage(page);
      await flush();
      expect(ctx.dispatch.mock.calls.map((c) => c[0].type)).toEqual(['findStarted', 'findEnded', 'findFound']);
      expect(pagesNow()[0]).toMatchObject({ quad: QUAD, edited: true, found: true });
      expect(ctx.announce).toHaveBeenCalledWith(t.pageFoundAnnounce);
    });
    it('says so when nothing is found, and when the search fails', async () => {
      const page = newPage(photo(), 'document');
      const { ctx } = setup([page]);
      guessPage.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('boom'));
      createPageActions(ctx).findPage(page);
      await flush();
      createPageActions(ctx).findPage(page);
      await flush();
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'findMissed', id: page.id });
      expect(ctx.announce).toHaveBeenCalledWith(t.findMissed);
      expect(reportError).toHaveBeenCalledWith('pdf_tool_run', expect.any(Error), 'scan_find_page');
    });
    it('does nothing once the island is gone', async () => {
      const page = newPage(photo(), 'document');
      const { ctx } = setup([page], { unmountedRef: { current: true } });
      guessPage.mockResolvedValue(QUAD);
      createPageActions(ctx).findPage(page);
      await flush();
      expect(ctx.dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('removePage', () => {
    it('ignores a page that is not there', () => {
      const { ctx } = setup([newPage(photo(), 'document')]);
      createPageActions(ctx).removePage(-1);
      expect(ctx.setPages).not.toHaveBeenCalled();
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
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'pageRemoved', id: a.id, neighbourId: b.id, nextNewId: null });
      expect(ctx.focusIdRef.current).toBe(b.id);
      expect(recordAction).toHaveBeenCalledWith('remove_file');
    });
    it('starts over when the last page goes', () => {
      const a = newPage(photo(), 'document');
      const { ctx } = setup([a]);
      createPageActions(ctx).removePage(a.id);
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'cleared' });
      expect(ctx.announce).toHaveBeenLastCalledWith(t.announceCleared);
    });
    it('from the corners asks for the top first', () => {
      const [a, b] = [newPage(photo(), 'document'), newPage(photo(), 'document')];
      const { ctx } = setup([a, b]);
      createPageActions(ctx).removeFromCorners(a.id);
      expect(ctx.dispatch.mock.calls[0][0]).toEqual({ type: 'scrollFocusRequested', top: true });
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
});

describe('createEditActions', () => {
  function editSetup(pages: ScanPage[], selectedIndex = 0, failedIds: number[] = []) {
    const { ctx, pagesNow } = setup(pages);
    const showResult = vi.fn();
    const setDefaultFilter = vi.fn();
    const actions = createEditActions({ ...ctx, selected: pages[selectedIndex], selectedIndex, failedIds, setDefaultFilter, showResult });
    return { ctx, actions, pagesNow, showResult, setDefaultFilter };
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
    const { ctx, actions } = editSetup([a, b]);
    actions.onTileKeyDown(arrow('a'), a.id);
    actions.onTileKeyDown(arrow('ArrowRight', { shiftKey: true }), a.id);
    actions.onTileKeyDown(arrow('ArrowLeft'), a.id);
    expect(ctx.setPages).not.toHaveBeenCalled();
  });
  it('keeps the corners a person moved', () => {
    const a = newPage(photo(), 'document');
    const { actions, pagesNow } = editSetup([a]);
    actions.commitCorners(a.id, QUAD);
    expect(pagesNow()[0]).toMatchObject({ quad: QUAD, edited: true });
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
    actions.rotatePage();
    expect(pagesNow()[0].turns).toBe(1);
    expect(ctx.announce).toHaveBeenCalledTimes(1);
  });
  it('shows the first page that could not be read', () => {
    const [a, b] = [newPage(photo(), 'document'), newPage(photo(), 'document')];
    const { ctx, actions } = editSetup([a, b], 0, [b.id]);
    actions.showFailedPage();
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'failedPageShown', id: b.id });
  });
  describe('approveCorners', () => {
    it('goes on to the next new photo', () => {
      const [a, b] = [newPage(photo(), 'document'), newPage(photo(), 'document')];
      const { ctx, actions, pagesNow, showResult } = editSetup([a, b]);
      actions.approveCorners();
      expect(pagesNow()[0].reviewed).toBe(true);
      expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'pageSelected', id: b.id });
      expect(showResult).not.toHaveBeenCalled();
    });
    it('goes to the result when none is left', () => {
      const a = newPage(photo(), 'document');
      const { ctx, actions, showResult } = editSetup([a]);
      actions.approveCorners();
      expect(showResult).toHaveBeenCalledWith(a);
      expect(ctx.announce).toHaveBeenCalledWith(t.announceResult);
    });
  });
  it('finishes the corners on the result and opens them again from the head', () => {
    const a = newPage(photo(), 'document');
    const { ctx, actions, showResult } = editSetup([a]);
    actions.finishCorners();
    expect(showResult).toHaveBeenCalledWith(a);
    actions.adjustCorners();
    expect(ctx.dispatch).toHaveBeenCalledWith({ type: 'cornersOpened', focus: true });
  });
});
