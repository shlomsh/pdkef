import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { drainPromises } from '../../../test/support/drainPromises.ts';
import { answerInTurn, answerNetwork } from '../../../test/support/network.browser.ts';
import { brokenPhoto, drawnCorners, photoOfNothing, photoOfPage } from '../../../test/support/scanTool.browser.tsx';
import { createEditActions, createPageActions } from './scanActions.ts';
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
  it('findPage makes what it finds the person\'s corners, says so when nothing is found or the search fails, and does nothing once the island is gone', async () => {
    const page = newPage(await photoOfPage('a.jpg'), 'document');
    const found = setup([page]);
    createPageActions(found.ctx).findPage(page);
    await finished(guessPage);
    const corners = await read(guessPage, 0);
    expect(corners, 'what the guess found').toHaveLength(4);
    drawnCorners().forEach((corner, i) => {
      expect(corners[i].x).toBeCloseTo(corner.x, 1);
      expect(corners[i].y).toBeCloseTo(corner.y, 1);
    });
    expect(found.ctx.dispatch.mock.calls.map((c) => c[0].type), 'a found page').toEqual(['findStarted', 'findEnded', 'findFound']);
    expect(found.pagesNow()[0]).toMatchObject({ quad: corners, edited: true, found: true });
    expect(found.ctx.announce).toHaveBeenCalledWith(t.pageFoundAnnounce);

    const [empty, broken] = [newPage(await photoOfNothing('a.jpg'), 'document'), newPage(brokenPhoto('b.jpg'), 'document')];
    const missed = setup([empty, broken]);
    createPageActions(missed.ctx).findPage(empty);
    await finished(guessPage);
    expect(await read(guessPage, 1), 'a photo with no page in it').toBeNull();
    expect(missed.ctx.dispatch).toHaveBeenCalledWith({ type: 'findMissed', id: empty.id });
    expect(missed.ctx.announce).toHaveBeenCalledWith(t.findMissed);
    expect(await reports(), 'nothing found is not a failure').toEqual([]);
    createPageActions(missed.ctx).findPage(broken);
    await finished(guessPage);
    await expect(read(guessPage, 2)).rejects.toThrow();
    expect(missed.ctx.dispatch).toHaveBeenCalledWith({ type: 'findMissed', id: broken.id });
    expect(await reports(), 'a failed search').toMatchObject([{ area: 'pdf_tool_run', step: 'scan_find_page' }]);

    const gone = setup([page], { unmountedRef: { current: true } });
    createPageActions(gone.ctx).findPage(page);
    await finished(guessPage);
    expect(await read(guessPage, 3), 'a guess that finishes after the island is gone').toHaveLength(4);
    expect(gone.ctx.dispatch).toHaveBeenCalledTimes(1);
  });

  it('traceCorners traces the preview or the page\'s own file with the pins it is given, is read-only, and reports a failing pipeline once', async () => {
    const page = newPage(await photoOfNothing('a.jpg'), 'document');
    const withPreview = setup([page]);
    const preview = await photoOfPage('p.jpg');
    withPreview.work.previewBlobs.set(page.id, preview);
    const sides = await createPageActions(withPreview.ctx).traceCorners(page.id, QUAD);
    expect(sides, 'the sides the pipeline read').toHaveLength(4);
    expect(sides).toBe(await read(tracePage, 0));
    expect(vi.mocked(tracePage).mock.calls[0][0], 'the preview').toBe(preview);
    expect(vi.mocked(tracePage).mock.calls[0].slice(1)).toEqual([QUAD, null]);

    const own = newPage(await photoOfPage('a.jpg'), 'document');
    const ownSetup = setup([own]);
    await createPageActions(ownSetup.ctx).traceCorners(own.id, QUAD, PINS);
    expect(vi.mocked(tracePage).mock.calls[1][0], 'the file when pins are passed').toBe(own.file);
    expect(vi.mocked(tracePage).mock.calls[1].slice(1)).toEqual([QUAD, PINS]);
    await createPageActions(ownSetup.ctx).traceCorners(own.id, MOVED);
    expect(vi.mocked(tracePage).mock.calls[2][0], 'the page\'s own file when no preview exists').toBe(own.file);
    expect(vi.mocked(tracePage).mock.calls[2].slice(1)).toEqual([MOVED, null]);

    vi.mocked(tracePage).mockClear();
    vi.mocked(recordAction).mockClear();
    await createPageActions(ownSetup.ctx).traceCorners(own.id, QUAD);
    expect(tracePage).toHaveBeenCalledTimes(1);
    expect(ownSetup.setPagesCalls, 'read-only: state').toEqual([]);
    expect(ownSetup.ctx.dispatch, 'read-only: dispatch').not.toHaveBeenCalled();
    expect(recordAction, 'read-only: recorded action').not.toHaveBeenCalled();

    const broken = newPage(brokenPhoto('a.jpg'), 'document');
    const failing = setup([broken]);
    await expect(createPageActions(failing.ctx).traceCorners(broken.id, QUAD)).resolves.toBeNull();
    expect(await reports(), 'a failing pipeline').toMatchObject([{ area: 'pdf_tool_run', step: 'scan_trace_page' }]);
  });
});

describe('the split question (SCAN-67)', () => {
  const SPINE = { top: 0.45, bottom: 0.55 };
  const asking = (rightToLeft: boolean, file: File): ScanPage => ({ ...newPage(file, 'grayscale'), sheet: true, edited: true, question: { spine: SPINE, rightToLeft } });

  function splitSetup(rightToLeft = false, source: File = spread) {
    const [before, page, after] = [newPage(photo(), 'document'), asking(rightToLeft, source), newPage(photo(), 'document')];
    const { ctx, pagesNow } = setup([before, page, after]);
    const inspect = vi.fn();
    const actions = createEditActions({ ...ctx, selected: page, selectedIndex: 1, failedIds: [], setDefaultFilter: vi.fn(), showResult: vi.fn(), inspect, retakeFile: vi.fn(), removePage: vi.fn() });
    ctx.work.previewBlobs.set(page.id, source.slice(0, source.size, 'image/jpeg'));
    return { ctx, actions, pagesNow, before, page, after, inspect };
  }

  it('Two pages puts the pages in the sheet\'s place, left page first, each with its own corners, and on a right-to-left sheet reads the right page first', async () => {
    const { ctx, actions, pagesNow, before, after, page, inspect } = splitSetup();
    const preview = ctx.work.previewBlobs.get(page.id);
    actions.answerTwoPages(SPINE);
    await finished(splitQuads);
    const [left, right]: Quad[] = await read(splitQuads, 0);
    expect(meanX(left), 'left page').toBeLessThan(0.5);
    expect(meanX(right), 'right page').toBeGreaterThan(0.5);
    const now = pagesNow();
    expect(now.map((p) => p.id), 'order').toEqual([before.id, now[1].id, now[2].id, after.id]);
    expect(vi.mocked(splitQuads).mock.calls[0][0], 'preview').toBe(preview);
    expect(vi.mocked(splitQuads).mock.calls[0][1], 'spine').toEqual(SPINE);
    expect(now.slice(1, 3), 'new pages').toEqual([
      expect.objectContaining({ file: page.file, filter: 'grayscale', quad: left, opened: left, sheet: true, edited: true, guessed: true, found: true, question: null }),
      expect.objectContaining({ file: page.file, quad: right, opened: right, question: null }),
    ]);
    expect(now.slice(1, 3).map((p) => p.pins), 'pins').toEqual([null, null]);
    expect(now[1].id, 'new id').not.toBe(page.id);
    expect(inspect, 'inspected').toHaveBeenCalledTimes(2);
    expect(ctx.work.removed.has(page.id), 'sheet removed').toBe(true);
    expect(ctx.dispatch, 'splitMade').toHaveBeenCalledWith({ type: 'splitMade', oldId: page.id, newId: now[1].id });
    expect(ctx.announce, 'announced').toHaveBeenCalledWith(t.announceSplit.replace('{position}', '2'));
    expect(recordAction, 'recorded').toHaveBeenCalledWith('change_setting');
    expect(ctx.dispatch.mock.calls.map((c) => c[0].type), 'splitStarted').toContain('splitStarted');
    expect(ctx.dispatch.mock.calls.map((c) => c[0].type), 'splitEnded').toContain('splitEnded');

    vi.mocked(splitQuads).mockClear();
    const rtl = splitSetup(true);
    rtl.actions.answerTwoPages(SPINE);
    await finished(splitQuads);
    const [rtlLeft, rtlRight]: Quad[] = await read(splitQuads, 0);
    expect(rtl.pagesNow().slice(1, 3).map((p) => p.quad), 'right-to-left order').toEqual([rtlRight, rtlLeft]);
  });

  it('keeps the sheet and its question when the split fails, and reports it, and leaves the list alone when the sheet was answered while the split ran', async () => {
    const { ctx, actions, pagesNow, page } = splitSetup(false, brokenPhoto('broken.jpg'));
    actions.answerTwoPages(SPINE);
    await finished(splitQuads);
    await expect(read(splitQuads, 0), 'failed split').rejects.toThrow();
    expect(pagesNow()[1], 'sheet kept').toBe(page);
    expect(await reports(), 'split report').toMatchObject([{ area: 'pdf_tool_run', step: 'scan_split_sheet' }]);
    expect(ctx.work.removed.has(page.id), 'sheet not removed').toBe(false);
    expect(ctx.dispatch, 'splitEnded failed').toHaveBeenLastCalledWith({ type: 'splitEnded', id: page.id, failed: true });

    vi.mocked(splitQuads).mockClear();
    const answered = splitSetup();
    answered.actions.answerTwoPages(SPINE);
    answered.ctx.work.pages = answered.ctx.work.pages.map((p) => ({ ...p, question: null }));
    await finished(splitQuads);
    expect(await read(splitQuads, 0), 'answered split quads').toHaveLength(2);
    expect(answered.pagesNow(), 'list alone').toHaveLength(3);
  });
});
