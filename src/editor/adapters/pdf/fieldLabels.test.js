import { describe, expect, it } from 'vitest';
import { labelFieldCandidates, unmirrorParens } from './fieldLabels.js';

/** A page-percent text run, matching pdf.js's `dir` on `TextContent.items[]`. */
function text(str, { left, top, width = str.length * 1.4, height = 2.2, dir = 'rtl' } = {}) {
  return { str, dir, left, top, width, height };
}

function candidate(overrides) {
  return { id: 'c1', kind: 'comb', left: 30, top: 20, width: 12, height: 2.2, ...overrides };
}

describe('labelFieldCandidates', () => {
  it('anchors on a same-line neighbour touching the right side (RTL option text)', () => {
    // itc101's checkbox option text sits immediately to the candidate's right.
    const cand = candidate({ kind: 'checkbox', left: 40, top: 20, width: 1.3, height: 1.3 });
    const items = [text('גרוש/ה', { left: 30, top: 19.8, width: 9 })];
    const [out] = labelFieldCandidates([cand], items);
    expect(out.label).toBe('גרוש/ה');
    expect(out.notes).toMatch(/same-line-touch/);
  });

  it('anchors on a same-line neighbour touching the left side (health-style)', () => {
    const cand = candidate({ kind: 'checkbox', left: 20, top: 20, width: 1.3, height: 1.3 });
    const items = [text('כן', { left: 22, top: 19.8, width: 3 })];
    const [out] = labelFieldCandidates([cand], items);
    expect(out.label).toBe('כן');
  });

  it('prefers the closer of two touching neighbours', () => {
    const cand = candidate({ left: 40, top: 20, width: 5, height: 2.2 });
    const items = [
      text('רחוק', { left: 46, top: 19.8, width: 6 }), // 1pt gap
      text('קרוב', { left: 45.3, top: 19.8, width: 6 }), // 0.3pt gap - closer
    ];
    const [out] = labelFieldCandidates([cand], items);
    expect(out.label).toBe('קרוב');
  });

  it('rejects a same-line sentence as a comb label and falls back to the column header', () => {
    // itc101's children-table date cells share a baseline with unrelated running prose;
    // only a comb kind screens this out (findSameLineTouch's looksLikeSentence guard).
    const cand = candidate({ kind: 'comb', left: 40, top: 40, width: 12, height: 2.2 });
    const sentence = text('זהו משפט ארוך שאינו תווית שדה כלל', { left: 53, top: 39.8, width: 30 });
    const header = text('תאריך לידה', { left: 40, top: 35, width: 12 });
    const [out] = labelFieldCandidates([cand], [sentence, header]);
    expect(out.label).toBe('תאריך לידה');
    expect(out.notes).toMatch(/column-header-above/);
  });

  it('accepts a same-line sentence as a text-cell label (only combs screen prose)', () => {
    const cand = candidate({ kind: 'text', left: 40, top: 40, width: 12, height: 2.2 });
    const sentence = text('זהו משפט ארוך שאינו תווית שדה כלל', { left: 53, top: 39.8, width: 30 });
    const [out] = labelFieldCandidates([cand], [sentence]);
    expect(out.notes).toMatch(/same-line-touch/);
  });

  it('requires the header to overlap the candidate on the x-axis', () => {
    const cand = candidate({ left: 40, top: 40, width: 12, height: 2.2 });
    const unrelatedHeader = text('כותרת אחרת', { left: 0, top: 35, width: 10 }); // no x-overlap
    const [out] = labelFieldCandidates([cand], [unrelatedHeader]);
    // No touching neighbour and no overlapping header: falls all the way to the nearest-fallback.
    expect(out.label).toBe('כותרת אחרת');
    expect(out.notes).toMatch(/nearest-fallback/);
  });

  it('picks the nearest of several overlapping headers above', () => {
    const cand = candidate({ left: 40, top: 40, width: 12, height: 2.2 });
    const far = text('רחוק', { left: 40, top: 10, width: 12 });
    const near = text('קרוב', { left: 40, top: 35, width: 12 });
    const [out] = labelFieldCandidates([cand], [far, near]);
    expect(out.label).toBe('קרוב');
  });

  it('grows a short anchor into a two-word phrase from a tight neighbour', () => {
    const cand = candidate({ left: 60, top: 20, width: 12, height: 2.2 });
    const items = [
      text('זהות', { left: 45, top: 19.8, width: 8 }),
      text('מספר', { left: 53.5, top: 19.8, width: 8 }), // ~1.5pt from 'זהות', inside MERGE_GAP
    ];
    const [out] = labelFieldCandidates([cand], items);
    expect(out.label).toBe('מספר זהות');
  });

  it('does not absorb a distant multi-word footnote while growing a phrase', () => {
    // itc101/checkbox-0032: an option word with a footnote further along the same line must
    // not be swallowed into the label.
    const cand = candidate({ kind: 'checkbox', left: 60, top: 20, width: 1.3, height: 1.3 });
    const items = [
      text('פרוד/ה', { left: 50, top: 19.8, width: 6 }),
      text('(חובה לצרף אישור פ"ש)', { left: 20, top: 19.8, width: 25 }), // far away, 3+ real words
    ];
    const [out] = labelFieldCandidates([cand], items);
    expect(out.label).toBe('פרוד/ה');
  });

  it('excludes a candidate\'s own printed content from ever being used as a label', () => {
    // A pre-filled digit or a checkbox's own rendered glyph sits mostly inside the box.
    const cand = candidate({ kind: 'checkbox', left: 40, top: 20, width: 1.3, height: 1.3 });
    const ownGlyph = text('X', { left: 40.1, top: 20.1, width: 1.0, height: 1.0, dir: 'ltr' });
    const realLabel = text('תווית', { left: 45, top: 19.8, width: 6 });
    const [out] = labelFieldCandidates([cand], [ownGlyph, realLabel]);
    expect(out.label).toBe('תווית');
  });

  it('leaves an already-labelled candidate untouched (e.g. a native AcroForm field name)', () => {
    // One deliberate difference from the MOBI-10 spike's label.mjs, which always overwrote
    // `label`: a candidate that already carries a real label must not have it replaced by a
    // geometric guess (the two spike forms have no AcroForm fields, so this never fired
    // during the spike's own scoring - see fieldLabels.js's module docstring).
    const cand = candidate({ label: 'topmostSubform[0].f1_01[0]' });
    const items = [text('תווית גיאומטרית', { left: 18, top: 19.8, width: 12 })];
    const [out] = labelFieldCandidates([cand], items);
    expect(out.label).toBe('topmostSubform[0].f1_01[0]');
  });

  it('returns the candidate unchanged when no text run is on the page', () => {
    const [out] = labelFieldCandidates([candidate()], []);
    expect(out.label).toBeUndefined();
  });

  describe('RTL reading order and paren un-mirroring', () => {
    it('orders an embedded LTR digit-paren run after the Hebrew phrase it follows', () => {
      // "שכר עבודה (עובד יומי)" printed as two chunks: the Hebrew phrase (an RTL item, its own
      // paren glyphs mirrored on-page - see unmirrorParens) and a separate LTR "(4)" tag. Visual
      // (ascending-x) order on an RTL line puts the LTR tag first; reading order must reverse
      // the chunk sequence while keeping the LTR chunk's own item order untouched.
      const cand = candidate({ left: 68, top: 20, width: 12, height: 2.2 });
      const items = [
        // An LTR item's own parens are never mirrored - pdf.js already hands back "(4)".
        text('(4)', { left: 40, top: 19.8, width: 4, dir: 'ltr' }), // visually first (leftmost)
        // 1pt from the LTR tag (inside MERGE_GAP) so growPhrase merges them into one phrase.
        // An RTL item's own parens ARE mirrored on-page, per unmirrorParens below.
        text('שכר עבודה )עובד יומי(', { left: 45, top: 19.8, width: 20, dir: 'rtl' }),
      ];
      const [out] = labelFieldCandidates([cand], items);
      expect(out.label).toBe('שכר עבודה (עובד יומי) (4)');
    });

    it('un-mirrors a lone RTL item\'s own parens', () => {
      expect(unmirrorParens(')עובד יומי(', 'rtl')).toBe('(עובד יומי)');
      expect(unmirrorParens('(4)', 'ltr')).toBe('(4)'); // LTR items are never touched
    });
  });
});
