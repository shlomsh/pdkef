import { describe, expect, it } from 'vitest';
import { reconcile, KIND_PRECEDENCE, SOURCE_ORDER } from './fieldRegions.js';
import { oldReconcile } from './fieldRegionsReferenceOracle.js';

// Page percentages. Form 101's section ב row: the identity comb's teeth hang
// off the bottom rule of a 23pt cell that is as tall as the name cell beside it.
const teeth = { pageIndex: 0, left: 73.6, top: 27.28, width: 17.15, height: 0.84, cells: 9 };
const identityCell = { pageIndex: 0, left: 73.6, top: 25.32, width: 17.15, height: 2.77, kind: 'text' };
const nameCell = { pageIndex: 0, left: 52.7, top: 25.32, width: 20.9, height: 2.77, kind: 'text' };

/**
 * `reconcile` folded a single source ('ink') against an empty pool - what
 * `reconcileFields` used to do alone, before ARCH-24 step B turned
 * precedence into data. See `fieldRegions.js`'s module doc.
 */
function reconcileOneSource({ combs, checkboxes, cells }) {
  return reconcile({ ink: { combs, checkboxes, cells } });
}

describe('reconcile, one source', () => {
  it('gives an open comb the cell drawn around it as its writable strip, and drops the cell', () => {
    const { combs, cells } = reconcileOneSource({ combs: [teeth], checkboxes: [], cells: [identityCell, nameCell] });
    expect(combs[0].writable).toEqual({ left: 73.6, top: 25.32, width: 17.15, height: 2.77 });
    expect(cells).toEqual([nameCell]);
  });

  it('passes on the band a labelled cell publishes, not the ruled box around it', () => {
    // formCells.js already carves the caption off: the cell's own bounds are
    // the strip, and its `enclosure` is only the tap target.
    const labelled = {
      ...identityCell,
      top: 26.4,
      height: 1.69,
      enclosure: { left: 73.6, top: 25.32, width: 17.15, height: 2.77 },
    };
    const { combs } = reconcileOneSource({ combs: [teeth], checkboxes: [], cells: [labelled] });
    expect(combs[0].writable).toEqual({ left: 73.6, top: 26.4, width: 17.15, height: 1.69 });
  });

  it('takes the tightest enclosing cell, not a section frame that also contains the run', () => {
    const frame = { pageIndex: 0, left: 4.8, top: 25.05, width: 85.9, height: 13.9, kind: 'text' };
    const { combs, cells } = reconcileOneSource({ combs: [teeth], checkboxes: [], cells: [frame, identityCell] });
    expect(combs[0].writable.height).toBeCloseTo(2.77);
    expect(cells).toEqual([]);
  });

  it('claims the cell whose printed box holds the run, even when the run misses its strip', () => {
    // The carve cuts a caption band off the top of a ruled box; a run printed
    // in that band is inside the box but outside what the cell publishes. The
    // box is still the rectangle the question is about, so the cell goes and
    // the comb takes its strip - otherwise one printed box carries a comb and
    // a text field on top of each other.
    const inBand = { ...teeth, top: 25.4 };
    const labelled = {
      ...identityCell,
      top: 26.4,
      height: 1.69,
      enclosure: { left: 73.6, top: 25.32, width: 17.15, height: 2.77 },
    };
    const { combs, cells } = reconcileOneSource({ combs: [inBand], checkboxes: [], cells: [labelled] });
    expect(combs[0].writable).toEqual({ left: 73.6, top: 26.4, width: 17.15, height: 1.69 });
    expect(cells).toEqual([]);
  });

  it('compares printed boxes, not strips, when picking the tightest enclosing cell', () => {
    // Constructed so the two orderings disagree, which is the only way to see
    // which one is used: the frame's own caption leaves it a thin strip
    // (85.9 x 0.5 = 43) smaller in area than the identity cell's whole box
    // (17.15 x 2.77 = 47.5), while the box it was cut from is 25 times larger.
    // Tightness is a property of the printed box; a thin strip must not win it.
    const frame = {
      pageIndex: 0,
      left: 4.8,
      top: 26.5,
      width: 85.9,
      height: 0.5,
      kind: 'text',
      enclosure: { left: 4.8, top: 25.05, width: 85.9, height: 13.9 },
    };
    const { combs, cells } = reconcileOneSource({ combs: [teeth], checkboxes: [], cells: [frame, identityCell] });
    expect(combs[0].writable).toEqual({ left: 73.6, top: 25.32, width: 17.15, height: 2.77 });
    expect(cells).toEqual([]);
  });

  it('leaves a boxed comb alone - its boxes are the field - but still drops the cell around it', () => {
    const boxed = { ...teeth, boxed: true };
    const { combs, cells } = reconcileOneSource({ combs: [boxed], checkboxes: [], cells: [identityCell] });
    expect(combs[0]).toBe(boxed);
    expect(cells).toEqual([]);
  });

  it('drops a cell a checkbox sits in', () => {
    const box = { pageIndex: 0, left: 54, top: 26, width: 1.5, height: 1.5 };
    const { cells } = reconcileOneSource({ combs: [], checkboxes: [box], cells: [nameCell] });
    expect(cells).toEqual([]);
  });

  it('drops a cell whose printed box a checkbox sits in, above the strip it publishes', () => {
    // Health's yes/no rows, live: a ruled box with "כן" and "לא" printed on its top line
    // beside the two radios, and blank space under them. The cell publishes that blank band, so
    // only a sixth of each radio falls inside its bounds - but the box the radios are in is the
    // box this cell was cut from, and something else has already reported them. Published
    // anyway, this was 20 of the 27 false positives on that form's page 1.
    const radio = { pageIndex: 0, left: 52.3, top: 42.4, width: 1.1, height: 0.8 };
    const yesNo = {
      pageIndex: 0, left: 50.9, top: 42.9, width: 8.9, height: 1.4, kind: 'text',
      enclosure: { left: 50.9, top: 42.3, width: 8.9, height: 2.0 },
    };
    const { cells } = reconcileOneSource({ combs: [], checkboxes: [radio], cells: [yesNo] });
    expect(cells).toEqual([]);
  });

  it('keeps a cell whose printed box a neighbouring checkbox sits outside of', () => {
    const outside = { pageIndex: 0, left: 61, top: 42.4, width: 1.1, height: 0.8 };
    const yesNo = {
      pageIndex: 0, left: 50.9, top: 42.9, width: 8.9, height: 1.4, kind: 'text',
      enclosure: { left: 50.9, top: 42.3, width: 8.9, height: 2.0 },
    };
    const { cells } = reconcileOneSource({ combs: [], checkboxes: [outside], cells: [yesNo] });
    expect(cells).toEqual([yesNo]);
  });

  it('keeps a comb and a cell that merely touch', () => {
    const below = { ...nameCell, left: 73.6, top: 28.12 };
    const { combs, cells } = reconcileOneSource({ combs: [teeth], checkboxes: [], cells: [below] });
    expect(combs[0].writable).toBeUndefined();
    expect(cells).toEqual([below]);
  });
});

describe('reconcile, precedence pinned by its own data', () => {
  // A stand-in that behaves like formCells.js's own "closed box" candidate:
  // the same rectangle a comb also claims, phrased as a plain cell so the
  // comb-vs-cell outcome is legible.
  const disputedComb = { pageIndex: 0, left: 10, top: 10, width: 20, height: 4, cells: 3 };
  const disputedCell = { pageIndex: 0, left: 10, top: 10, width: 20, height: 4, kind: 'text' };

  it('a comb claims a cell on the same rectangle by default (KIND_PRECEDENCE)', () => {
    const { combs, cells } = reconcile({ ink: { combs: [disputedComb], checkboxes: [], cells: [disputedCell] } });
    expect(combs).toHaveLength(1);
    expect(cells).toEqual([]);
  });

  it('sabotage: reversing KIND_PRECEDENCE makes the cell claim the comb instead', () => {
    const reversed = [...KIND_PRECEDENCE].reverse();
    const { combs, cells } = reconcile(
      { ink: { combs: [disputedComb], checkboxes: [], cells: [disputedCell] } },
      { kindPrecedence: reversed },
    );
    expect(combs).toEqual([]);
    expect(cells).toHaveLength(1);
  });

  it('between two sources reporting the same cell, the earlier SOURCE_ORDER entry wins by default', () => {
    const inkCell = { pageIndex: 0, left: 30, top: 30, width: 10, height: 4, kind: 'text', from: 'ink' };
    const widgetCell = { pageIndex: 0, left: 30, top: 30, width: 10, height: 4, kind: 'text', from: 'widgets' };
    const { cells } = reconcile({
      ink: { combs: [], checkboxes: [], cells: [inkCell] },
      widgets: { combs: [], checkboxes: [], cells: [widgetCell] },
    });
    expect(cells).toEqual([inkCell]);
  });

  it('sabotage: reversing SOURCE_ORDER flips which of two equal-kind regions wins', () => {
    const inkCell = { pageIndex: 0, left: 30, top: 30, width: 10, height: 4, kind: 'text', from: 'ink' };
    const widgetCell = { pageIndex: 0, left: 30, top: 30, width: 10, height: 4, kind: 'text', from: 'widgets' };
    const { cells } = reconcile(
      {
        ink: { combs: [], checkboxes: [], cells: [inkCell] },
        widgets: { combs: [], checkboxes: [], cells: [widgetCell] },
      },
      { sourceOrder: [...SOURCE_ORDER].reverse() },
    );
    expect(cells).toEqual([widgetCell]);
  });
});

describe('reconcile, an unknown source name (ARCH-24 step C)', () => {
  // A name detectFormFields could hand reconcile (a new source) with no line
  // in SOURCE_ORDER - the case a third source hits before anyone gives it a
  // deliberate place in the precedence list.
  it('is folded in rather than silently dropped, appended after every named source', () => {
    const inkCell = { pageIndex: 0, left: 10, top: 10, width: 10, height: 4, kind: 'text' };
    const stubCell = { pageIndex: 0, left: 50, top: 50, width: 10, height: 4, kind: 'text' };
    const { cells } = reconcile({
      ink: { combs: [], checkboxes: [], cells: [inkCell] },
      stub: { combs: [], checkboxes: [], cells: [stubCell] },
    });
    // Both survive - they do not overlap, so this alone would also pass if
    // 'stub' were silently dropped and stubCell just never arrived. The next
    // test is what actually distinguishes "folded in, last" from "dropped".
    expect(cells).toEqual([inkCell, stubCell]);
  });

  it('still loses a same-rectangle tie to a name SOURCE_ORDER already knows, because it is appended last', () => {
    const inkCell = { pageIndex: 0, left: 30, top: 30, width: 10, height: 4, kind: 'text', from: 'ink' };
    const stubCell = { pageIndex: 0, left: 30, top: 30, width: 10, height: 4, kind: 'text', from: 'stub' };
    const { cells } = reconcile({
      ink: { combs: [], checkboxes: [], cells: [inkCell] },
      stub: { combs: [], checkboxes: [], cells: [stubCell] },
    });
    expect(cells).toEqual([inkCell]);
  });
});

describe('reconcile, same-source protected kinds do not block each other', () => {
  // A regression pin for a bug an independent reviewer found and confirmed
  // by running: `fold()`'s protected-kind branch computed `blockedBy` from
  // `next`, the accumulator it was still mutating for this same source, so a
  // checkbox (processed after combs in KIND_PRECEDENCE) was filtered against
  // combs its own source had just been accepted in the very same fold() call
  // - something `reconcileFields` never did (it only ever removed a cell,
  // never a checkbox or a comb). Fixed by reading `accepted`, the snapshot
  // from before this source's fold, instead.
  it('keeps an ink checkbox that overlaps an ink comb from the same source', () => {
    const comb = { pageIndex: 0, left: 10, top: 10, width: 20, height: 4, cells: 3 };
    const overlappingCheckbox = { pageIndex: 0, left: 12, top: 11, width: 2, height: 2 };
    const { combs, checkboxes } = reconcile({
      ink: { combs: [comb], checkboxes: [overlappingCheckbox], cells: [] },
    });
    expect(combs).toEqual([comb]);
    expect(checkboxes).toEqual([overlappingCheckbox]);
  });

  it('keeps an ink comb that overlaps an ink checkbox from the same source, the other way round', () => {
    const checkbox = { pageIndex: 0, left: 10, top: 10, width: 4, height: 4 };
    const overlappingComb = { pageIndex: 0, left: 11, top: 11, width: 2, height: 2, cells: 3 };
    const { combs, checkboxes } = reconcile({
      ink: { combs: [overlappingComb], checkboxes: [checkbox], cells: [] },
    });
    expect(combs).toEqual([overlappingComb]);
    expect(checkboxes).toEqual([checkbox]);
  });

  it('still excludes a later source\'s comb against an earlier source\'s checkbox (cross-source rule is unaffected)', () => {
    const inkCheckbox = { pageIndex: 0, left: 10, top: 10, width: 2, height: 2 };
    const widgetComb = { pageIndex: 0, left: 8, top: 10, width: 10, height: 4, cells: 3, boxed: true };
    const { combs, checkboxes } = reconcile({
      ink: { combs: [], checkboxes: [inkCheckbox], cells: [] },
      widgets: { combs: [widgetComb], checkboxes: [], cells: [] },
    });
    expect(combs).toEqual([]);
    expect(checkboxes).toEqual([inkCheckbox]);
  });
});

describe('reconcile vs. the pre-ARCH-24 oracle (differential)', () => {
  // Small, deterministic PRNG (mulberry32) so a failure is reproducible from
  // the printed seed alone, with no external dependency.
  function mulberry32(seed) {
    let a = seed;
    return function next() {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRegion(rng, idPrefix, i) {
    // A small grid with sizes 1-4 on a 0-8 range forces heavy overlap.
    const left = Math.floor(rng() * 8);
    const top = Math.floor(rng() * 8);
    const width = 1 + Math.floor(rng() * 4);
    const height = 1 + Math.floor(rng() * 4);
    return { id: `${idPrefix}${i}`, pageIndex: 0, left, top, width, height };
  }

  function makeComb(rng, idPrefix, i, { forceBoxed = false } = {}) {
    const region = makeRegion(rng, idPrefix, i);
    // `detectWidgetRegions` (formWidgets.js) always emits `boxed: true` -
    // only ink's own comb detector (formGrid.js) ever reports an open one.
    const boxed = forceBoxed || rng() < 0.5;
    return { ...region, cells: 1 + Math.floor(rng() * 9), boxed };
  }

  function makeCell(rng, idPrefix, i) {
    const region = makeRegion(rng, idPrefix, i);
    const kind = rng() < 0.5 ? 'text' : 'other';
    if (rng() >= 0.4) return { ...region, kind };
    const enclosure = {
      left: Math.max(0, region.left - Math.floor(rng() * 2)),
      top: Math.max(0, region.top - Math.floor(rng() * 2)),
      width: region.width + Math.floor(rng() * 3),
      height: region.height + Math.floor(rng() * 3),
    };
    return { ...region, kind, enclosure };
  }

  function makeSource(rng, prefix, { combs, checkboxes, cells }, comboOpts) {
    return {
      combs: Array.from({ length: combs }, (_, i) => makeComb(rng, `${prefix}c`, i, comboOpts)),
      checkboxes: Array.from({ length: checkboxes }, (_, i) => makeRegion(rng, `${prefix}x`, i)),
      cells: Array.from({ length: cells }, (_, i) => makeCell(rng, `${prefix}l`, i)),
    };
  }

  it('agrees with reconcileFields + withWidgetFields on every generated case, in order', () => {
    const totalCases = 600;
    const mismatches = [];
    for (let caseIndex = 0; caseIndex < totalCases; caseIndex += 1) {
      const rng = mulberry32(1000003 * (caseIndex + 1));
      const counts = () => ({
        combs: Math.floor(rng() * 4),
        checkboxes: Math.floor(rng() * 4),
        cells: Math.floor(rng() * 4),
      });
      const ink = makeSource(rng, 'i', counts());
      // widgetsSource never reports checkboxes (detectFormFields.ts) and its
      // combs are always boxed (formWidgets.js).
      const widgets = { ...makeSource(rng, 'w', counts(), { forceBoxed: true }), checkboxes: [] };

      const expected = oldReconcile({ ink, widgets });
      const actual = reconcile({ ink, widgets });

      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push({ caseIndex, ink, widgets, expected, actual });
      }
    }
    expect(mismatches).toEqual([]);
  });
});
