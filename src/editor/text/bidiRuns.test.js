import { describe, expect, it } from 'vitest';
import { WYSIWYG_STRING_BY_ID } from '../../test/fixtures/wysiwygStrings.js';
import { resolveBidiRuns } from './bidiRuns.js';

describe('resolveBidiRuns', () => {
  it('returns the whole line as one run for pure LTR text (control)', () => {
    expect(resolveBidiRuns('Hello world', 'ltr')).toEqual([{ text: 'Hello world', direction: 'ltr' }]);
  });

  it('returns the whole line as one run for pure RTL text (control), text left in logical order', () => {
    // "שלום" unreversed here on purpose - fontkit already reverses a
    // single-direction RTL run's glyphs correctly once it is given the true
    // logical text plus an explicit direction; this module must not
    // pre-reverse it (see the module-level doc in bidiRuns.js).
    expect(resolveBidiRuns('שלום', 'rtl')).toEqual([{ text: 'שלום', direction: 'rtl' }]);
  });

  it('returns nothing to reorder for an empty line', () => {
    expect(resolveBidiRuns('', 'rtl')).toEqual([{ text: '', direction: 'rtl' }]);
    expect(resolveBidiRuns('', 'ltr')).toEqual([{ text: '', direction: 'ltr' }]);
  });

  describe('the digit/date/phone/amount cases that motivated this module (docs/hebrew-text-shaping-export.md)', () => {
    // For each: the element is Hebrew-first, so its effective (fixed)
    // direction is 'rtl'. Digits are weak-directional (UAX#9 class EN) and
    // must come out as their own LTR run, never reversed, with the Hebrew
    // word(s) as separate RTL run(s) - unlike the current bug, where fontkit
    // reverses the *entire* string, including the digits, character by
    // character (measured: "21/08/2026" exports as "6202/80/12").

    it('keeps a date in its typed digit order', () => {
      const runs = resolveBidiRuns('תאריך 21/08/2026', 'rtl');
      expect(runs.map((r) => r.text)).toEqual(['21/08/2026', 'תאריך ']);
      expect(runs.map((r) => r.direction)).toEqual(['ltr', 'rtl']);
    });

    it('keeps a phone number in its typed digit order', () => {
      const runs = resolveBidiRuns('טלפון 054-1234567', 'rtl');
      expect(runs.map((r) => r.text)).toEqual(['054-1234567', 'טלפון ']);
      expect(runs.map((r) => r.direction)).toEqual(['ltr', 'rtl']);
    });

    it('keeps an amount in its typed digit order, with a Hebrew word on both sides', () => {
      const runs = resolveBidiRuns('סכום 1,250 שח', 'rtl');
      expect(runs.map((r) => r.text)).toEqual([' שח', '1,250', 'סכום ']);
      expect(runs.map((r) => r.direction)).toEqual(['rtl', 'ltr', 'rtl']);
    });

    it('keeps a house number in its typed digit order', () => {
      const runs = resolveBidiRuns('רחוב 17', 'rtl');
      expect(runs.map((r) => r.text)).toEqual(['17', 'רחוב ']);
      expect(runs.map((r) => r.direction)).toEqual(['ltr', 'rtl']);
    });
  });

  describe('user-supplied WYSIWYG mixed-direction strings', () => {
    const cases = [
      ['H3', [['21/08/2026', 'ltr'], ['תאריך ', 'rtl']]],
      ['H4', [[' ש"ח', 'rtl'], ['1,250.50', 'ltr'], ['סכום ', 'rtl']]],
      ['H5', [[' כתובת', 'rtl'], ['David Cohen', 'ltr'], ['שם: ', 'rtl']]],
      ['A4', [[' ريال', 'rtl'], ['1,250.50', 'ltr'], ['المبلغ ', 'rtl']]],
      ['A5', [['٢١/٠٨/٢٠٢٦', 'ltr'], ['التاريخ ', 'rtl']]],
      ['A6', [['Ahmed', 'ltr'], [' ', 'rtl'], ['١٢٥٠', 'ltr'], [' ', 'rtl'], ['1250', 'ltr'], ['مرحبا أحمد ', 'rtl']]],
      ['C2', [[' مرحبا', 'rtl'], ['Hello', 'ltr'], ['שלום ', 'rtl']]],
    ];

    it.each(cases)('%s: preserves token order while resolving visual runs', (id, expected) => {
      const runs = resolveBidiRuns(WYSIWYG_STRING_BY_ID[id].text, 'rtl');
      expect(runs.map(({ text, direction }) => [text, direction])).toEqual(expected);
    });
  });

  describe('mixed Latin + Hebrew (docs/hebrew-text-shaping-export.md, Layer 2)', () => {
    it('an LTR-anchored line (Latin label first) keeps the Hebrew segment as its own trailing RTL run', () => {
      // Effective direction is 'ltr' (first strong char is Latin "A").
      const runs = resolveBidiRuns('Arimo: שלום', 'ltr');
      expect(runs).toEqual([
        { text: 'Arimo: ', direction: 'ltr' },
        { text: 'שלום', direction: 'rtl' },
      ]);
    });

    it('an RTL-anchored line (Hebrew word first) keeps a trailing Latin word un-reversed', () => {
      // Effective direction is 'rtl' (first strong char is Hebrew). Painted
      // left to right this is ["world", "שלום "] - reading right to left
      // (the anchor side) reproduces the typed order: שלום world.
      const runs = resolveBidiRuns('שלום world', 'rtl');
      expect(runs.map((r) => r.text)).toEqual(['world', 'שלום ']);
      expect(runs.map((r) => r.direction)).toEqual(['ltr', 'rtl']);
    });
  });

  describe('run order, not just run content (a guard that only checked each run\'s own text could still ship reversed runs)', () => {
    it('places the first-strong-direction segment last for an RTL-anchored line, i.e. at the anchored (right) edge', () => {
      // pdfX is the RIGHT edge for an RTL-anchored element (usesRtlAnchoring),
      // and callers paint runs left to right with an increasing pen, so the
      // LAST run in this array is the one whose right edge lands on pdfX.
      // The first-typed content ("סכום") must be that last run.
      const runs = resolveBidiRuns('סכום 1,250 שח', 'rtl');
      expect(runs[runs.length - 1].text).toBe('סכום ');
      expect(runs[runs.length - 1].direction).toBe('rtl');
    });

    it('places the first-strong-direction segment first for an LTR-anchored line, i.e. at the anchored (left) edge', () => {
      // pdfX is the LEFT edge for an LTR-anchored element, and the first
      // run in the array is drawn there.
      const runs = resolveBidiRuns('Arimo: שלום', 'ltr');
      expect(runs[0].text).toBe('Arimo: ');
      expect(runs[0].direction).toBe('ltr');
    });
  });

  describe('Dari/Farsi (Bidi_Class AL, same as Arabic; Persian digits are a different raw class, checked rather than assumed)', () => {
    // Persian's own digit block (۰-۹, U+06F0-06F9) is Bidi_Class EN, NOT AN
    // like Arabic's own digit block (٠-٩) - a genuinely different starting
    // classification, not something to assume behaves like the Arabic case.
    // Measured directly before writing these assertions: UAX#9 rule W2
    // reclassifies a European Number to Arabic Number when the nearest
    // preceding strong type is AL, which Dari text always is here, so the
    // digit run still comes out grouped and un-reversed exactly like
    // Arabic's own AN digits and Hebrew's EN digits - but that convergence
    // is a fact about bidi-js's real resolution, not a hand-derived
    // certainty, which is exactly why this module delegates to a certified
    // library instead of re-deriving UAX#9 (see the module doc above).
    it('keeps a Dari date in its typed digit order', () => {
      const runs = resolveBidiRuns('تاریخ ۲۱/۰۸/۱۴۰۵', 'rtl');
      expect(runs.map((r) => r.text)).toEqual(['۲۱/۰۸/۱۴۰۵', 'تاریخ ']);
      expect(runs.map((r) => r.direction)).toEqual(['ltr', 'rtl']);
    });

    it('keeps a Dari amount in its typed digit order, with a Dari word on both sides', () => {
      const runs = resolveBidiRuns('مبلغ ۱۲۵۰ افغانی', 'rtl');
      expect(runs.map((r) => r.text)).toEqual([' افغانی', '۱۲۵۰', 'مبلغ ']);
      expect(runs.map((r) => r.direction)).toEqual(['rtl', 'ltr', 'rtl']);
    });

    it('keeps a trailing Latin name un-reversed after Dari text', () => {
      const runs = resolveBidiRuns('سلام Ahmad', 'rtl');
      expect(runs.map((r) => r.text)).toEqual(['Ahmad', 'سلام ']);
      expect(runs.map((r) => r.direction)).toEqual(['ltr', 'rtl']);
    });
  });

  describe('the paragraph direction is fixed by the caller, never auto-detected per line', () => {
    // This is the correctness detail the task exists to pin: the editor
    // resolves bidi with the *element's* effective direction (one fixed
    // value for the whole textarea, via its `dir` attribute - see
    // getEffectiveTextDirection in signHelpers.js), not with each line's own
    // auto-detected direction. A line whose own first-strong character
    // disagrees with the element's overall direction must still follow the
    // element - and "5 שלום" is exactly such a line: its own first strong
    // character is Hebrew, so auto-detecting from the line alone would give
    // the same (wrong, for an LTR element) answer as passing 'rtl'.
    it('produces different run splits/order for the same line under the two different explicit directions', () => {
      const asLtr = resolveBidiRuns('5 שלום', 'ltr');
      const asRtl = resolveBidiRuns('5 שלום', 'rtl');
      expect(asLtr).not.toEqual(asRtl);
    });

    it('follows the LTR element direction even though this line\'s own first strong character is Hebrew', () => {
      // Correct for an LTR element (the "5" typed first stays first/leftmost,
      // at the anchor, and the Hebrew word trails it) - this is NOT what you
      // get if the line were (wrongly) auto-detected on its own content,
      // which is exactly the 'rtl' case asserted separately below.
      const runs = resolveBidiRuns('5 שלום', 'ltr');
      expect(runs[0].direction).toBe('ltr');
      expect(runs[0].text.trim()).toBe('5');
      expect(runs[runs.length - 1]).toEqual({ text: 'שלום', direction: 'rtl' });
    });

    it('follows the RTL element direction, putting the Hebrew word first/leftmost instead', () => {
      const runs = resolveBidiRuns('5 שלום', 'rtl');
      expect(runs[0].direction).toBe('rtl');
      expect(runs[runs.length - 1]).toEqual({ text: '5', direction: 'ltr' });
    });
  });
});
