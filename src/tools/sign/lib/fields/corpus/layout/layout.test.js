import { describe, expect, it } from 'vitest';
import { loadLayoutPages, listLayoutPages } from './layoutStore.mjs';
import { sampleSwipes, expectedBands, columnRuns } from './sampleSwipes.mjs';
import { applyEdits } from './edits.mjs';
import { PINNED_ROWS } from './pinnedRows.mjs';
import { classifySwipe, matchGaps, matchRows, probeOutcome, runPinnedRows, summariseLayout } from './scoreLayout.mjs';
import { todaysReader } from './windowedReader.mjs';
import recorded from './layoutBaselines.json';

const pages = loadLayoutPages();
const features = pages.find((p) => p.truth.id === 'composed-features');

describe('layout corpus: committed pages and truth', () => {
  it('has every page of the manifest, each with a licence and a source', () => {
    expect(listLayoutPages().length).toBe(8);
    for (const { truth } of pages) {
      expect(truth.source.licence).toBeTruthy();
      expect(truth.source.url ?? truth.source.composed).toBeTruthy();
      expect(truth.rows.filter((r) => !r.ignore).length).toBeGreaterThan(20);
    }
  });

  it('covers a right-to-left page, a three-column page, spanning rows and ignored regions', () => {
    const by = (id) => pages.find((p) => p.truth.id === id).truth;
    expect(by('composed-hebrew').direction).toBe('rtl');
    expect(by('fr-2026-22353-p1').columns).toHaveLength(3);
    expect(by('composed-features').rows.some((r) => r.spans)).toBe(true);
    expect(by('arxiv-2610.39533-p4').ignore.length).toBeGreaterThan(0);
  });
});

describe('layout corpus: swipes', () => {
  it('samples the same swipes for the same seed, and a fixed count per page', () => {
    const a = sampleSwipes(features.truth, { seed: 3 });
    expect(sampleSwipes(features.truth, { seed: 3 })).toEqual(a);
    expect(a.filter((s) => s.kind === 'swipe')).toHaveLength(36);
    expect(a.filter((s) => s.kind === 'decoy')).toHaveLength(6);
  });

  it('never leaves a column run, and expects whole rows between the ends', () => {
    const run = columnRuns(features.truth).sort((a, b) => b.length - a.length)[0];
    const bands = expectedBands(run.slice(0, 3), run[0].x0 + 20, run[2].x1 - 20);
    expect(bands.map((b) => b.rowId)).toEqual(run.slice(0, 3).map((r) => r.id));
    expect(bands[1]).toMatchObject({ x0: run[1].x0, x1: run[1].x1 });
    expect(bands[0].x1).toBe(run[0].x1);
  });
});

describe('layout corpus: scoring', () => {
  const row = (id, y0, y1, extra = {}) => ({ id, x0: 10, x1: 100, y0, y1, column: 'c0', spans: false, gaps: [], ...extra });
  const truth = { id: 't', letterHeightPts: 7, columns: [{ id: 'c0', x0: 10, x1: 100 }, { id: 'c1', x0: 120, x1: 210 }], rows: [row('a', 0, 10), row('b', 14, 24), row('x', 30, 40, { ignore: true })] };

  it('matches rows one to one by vertical overlap within a column', () => {
    const found = [{ x0: 10, x1: 100, y0: 0, y1: 11, gaps: [] }, { x0: 12, x1: 98, y0: 60, y1: 70, gaps: [] }];
    const m = matchRows(truth, found);
    expect(m).toMatchObject({ tp: 1, fn: 1, fp: 1 });
  });

  it('does not match a row across columns', () => {
    const m = matchRows(truth, [{ x0: 130, x1: 200, y0: 0, y1: 10, gaps: [] }]);
    expect(m.tp).toBe(0);
  });

  it('pairs word gaps by overlap', () => {
    expect(matchGaps([[10, 14], [30, 34]], [[11, 15], [50, 53]])).toEqual({ tp: 1, fn: 1, fp: 1 });
  });

  it('calls a row that reaches into the next column merged', () => {
    expect(probeOutcome(truth.rows[0], { x0: 10, x1: 200 }, truth)).toBe('merged');
    expect(probeOutcome(truth.rows[0], { x0: 10, x1: 40 }, truth)).toBe('split');
    expect(probeOutcome(truth.rows[0], { x0: 10, x1: 99 }, truth)).toBe('ok');
    expect(probeOutcome(truth.rows[0], null, truth)).toBe('none');
  });

  it('scores a swipe correct, wrong or declined, and a band on a margin decoy wrong', () => {
    const swipe = { kind: 'swipe', expect: { bands: [{ rowId: 'a', x0: 30, x1: 100 }] } };
    const band = { x0: 31, x1: 99, y0: 0, y1: 10 };
    expect(classifySwipe(swipe, [band], truth).outcome).toBe('correct');
    expect(classifySwipe(swipe, [{ ...band, x1: 200 }], truth)).toMatchObject({ outcome: 'wrong', why: 'cross-column' });
    expect(classifySwipe(swipe, [{ ...band, y0: 14, y1: 24 }], truth)).toMatchObject({ outcome: 'wrong', why: 'wrong-row' });
    expect(classifySwipe(swipe, [], truth).outcome).toBe('declined');
    expect(classifySwipe({ kind: 'decoy', expect: { decline: 'margin' } }, [band], truth).outcome).toBe('wrong');
    expect(classifySwipe({ kind: 'decoy', expect: { decline: 'margin' } }, [], truth).outcome).toBe('declined');
  });

  it('summarises swipes with a confidence bound and the decline rate', () => {
    const s = summariseLayout([{
      rows: { tp: 1, fp: 0, fn: 0 }, spanning: { tp: 0, fp: 0, fn: 0 }, gaps: { tp: 0, fp: 0, fn: 0 }, edges: [0.1], outward: 0, matched: 1,
      probes: { ok: 1, merged: 0, split: 0, none: 0 }, columns: { probes: 0, countRight: 0, gutterErrPts: [] }, order: null, skew: null,
      pageId: 'p', level: 'clean', view: 'fit',
      swipes: [{ outcome: 'correct', why: 'bands' }, { outcome: 'wrong', why: 'x' }, { outcome: 'declined', why: 'y' }],
    }]);
    expect(s.swipes).toMatchObject({ correct: 1, wrong: 1, declined: 1, precision: 0.5, declineRate: 0.3333 });
    expect(s.swipes.lower).toBeLessThan(0.5);
  });
});

describe('layout corpus: edits', () => {
  it('lays a speck without touching the master', () => {
    const raster = { width: 100, height: 100, pxPerPoint: 2, data: new Uint8ClampedArray(100 * 100).fill(255) };
    const out = applyEdits(raster, [{ kind: 'speck', x: 10, y: 10, sizePts: 2 }]);
    expect(out.data[20 * 100 + 20]).toBeLessThan(100);
    expect(raster.data[20 * 100 + 20]).toBe(255);
  });
});

describe('layout corpus: pinned rows against today\'s reader', () => {
  const results = runPinnedRows({ pages, reader: todaysReader });

  it('finds every target row', () => {
    expect(results.map((r) => r.id)).toEqual(PINNED_ROWS.map((p) => p.id));
  });

  it('shows the three READ-01 R33 failures, and the drop cap, as failing known-gap rows', () => {
    for (const id of ['gutter-dust', 'spanning-heading', 'margin-speck', 'drop-cap']) {
      expect(results.find((r) => r.id === id)).toMatchObject({ knownGap: true, pass: false });
    }
  });

  it('keeps the pull quote passing, and every control (the same press without its dirt) passing', () => {
    expect(results.find((r) => r.id === 'pull-quote').pass).toBe(true);
    const controls = runPinnedRows({ pages, reader: todaysReader, rows: PINNED_ROWS.filter((p) => ['gutter-dust', 'margin-speck'].includes(p.id)).map((p) => ({ ...p, edits: undefined })) });
    expect(controls.every((r) => r.pass)).toBe(true);
  });

  it('matches the recorded baseline for the pinned rows', () => {
    expect(recorded.pinned).toEqual(results.map(({ id, knownGap, pass, why }) => ({ id, knownGap, pass, why })));
  });
});
