import { describe, expect, it } from 'vitest';
import { cleanFieldLabel, labelFieldCandidates, unmirrorParens } from './fieldLabels.js';

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

  it('excludes a checkbox glyph that is larger than the printed square it draws (FORM-03)', () => {
    // Form 101 draws a checkbox as one Zapf Dingbats "o" whose box is about three times the area of
    // the square, and since SNG-09 the candidate is that square: the glyph is no longer mostly
    // inside it, and used to become the label's first word ("o לא").
    const cand = candidate({ kind: 'checkbox', left: 40.5, top: 20.4, width: 1, height: 0.7 });
    const glyph = text('o', { left: 40, top: 20, width: 1.4, height: 1.3, dir: 'ltr' });
    const option = text('לא', { left: 38.5, top: 19.9, width: 1.5 });
    const [out] = labelFieldCandidates([cand], [glyph, option]);
    expect(out.label).toBe('לא');
  });

  it('does not take a wide text run for a glyph just because it spans a candidate', () => {
    // The glyph rule needs a one-character item; a whole word that happens to cover a box is a label.
    const cand = candidate({ kind: 'checkbox', left: 40.5, top: 20.4, width: 1, height: 0.7 });
    const word = text('שם', { left: 40, top: 20, width: 3, height: 1.3 });
    const [out] = labelFieldCandidates([cand], [word]);
    expect(out.label).toBe('שם');
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

  describe('items that abut', () => {
    it('glues two RTL items with no gap between them into one word', () => {
      const cand = candidate({ left: 30, width: 16 });
      const items = [
        text('נ', { left: 50, top: 19.8, width: 1 }),
        text('קבה', { left: 46.99, top: 19.8, width: 3 }),
      ];
      expect(labelFieldCandidates([cand], items)[0].label).toBe('נקבה');
    });

    it('keeps a real word gap as a space', () => {
      const cand = candidate({ left: 30, width: 16 });
      const items = [
        text('נקבה', { left: 50, top: 19.8, width: 3 }),
        text('אחרת', { left: 46, top: 19.8, width: 3 }),
      ];
      expect(labelFieldCandidates([cand], items)[0].label).toBe('נקבה אחרת');
    });
  });

  describe('abutting LTR items', () => {
    const cand = candidate({ left: 80, width: 5 });
    const ltr = (str, left, width) => text(str, { left, top: 19.8, width, dir: 'ltr' });

    it('glues two LTR items with no gap', () => {
      const items = [ltr('AB', 70, 2), ltr('CD', 72.01, 2)];
      expect(labelFieldCandidates([cand], items)[0].label).toBe('ABCD');
    });

    it('keeps a word gap between LTR items as a space', () => {
      const items = [ltr('AB', 70, 2), ltr('CD', 72.6, 2)];
      expect(labelFieldCandidates([cand], items)[0].label).toBe('AB CD');
    });
  });

  describe('cleanFieldLabel', () => {
    it('strips blank and dash filler at the edges', () => {
      expect(cleanFieldLabel('סיום עבודה עונתית מתאריך _______ ____')).toBe('סיום עבודה עונתית מתאריך');
      expect(cleanFieldLabel('גרוש/ה –')).toBe('גרוש/ה');
      expect(cleanFieldLabel('סיבה אחרת. נא לפרט:____ ___')).toBe('סיבה אחרת. נא לפרט');
    });

    it('keeps printed punctuation at the edges', () => {
      expect(cleanFieldLabel('Apt.')).toBe('Apt.');
      expect(cleanFieldLabel('U.S.')).toBe('U.S.');
      expect(cleanFieldLabel('Are you ok?')).toBe('Are you ok?');
      expect(cleanFieldLabel('-5')).toBe('-5');
      expect(cleanFieldLabel('ת.ז.')).toBe('ת.ז.');
      expect(cleanFieldLabel('מ-')).toBe('מ-');
    });

    it('strips a dash only when whitespace separates it from the text', () => {
      expect(cleanFieldLabel('חופשה ללא תשלום מ -')).toBe('חופשה ללא תשלום מ');
      expect(cleanFieldLabel('סיבה אחרת. נא לפרט:___')).toBe('סיבה אחרת. נא לפרט');
      expect(cleanFieldLabel('-')).toBe('');
    });

    it('strips a dotted leader but keeps a single period', () => {
      expect(cleanFieldLabel('ร้อยละ............')).toBe('ร้อยละ');
      expect(cleanFieldLabel('Apt.')).toBe('Apt.');
    });

    it('returns an empty string for filler alone', () => {
      expect(cleanFieldLabel('____ -')).toBe('');
    });

    it('labelFieldCandidates drops a trailing dash item', () => {
      const cand = candidate({ left: 30, width: 16 });
      const items = [
        text('גרוש/ה', { left: 46.5, top: 19.8, width: 6 }),
        text('–', { left: 45.5, top: 19.8, width: 0.8 }),
      ];
      expect(labelFieldCandidates([cand], items)[0].label).toBe('גרוש/ה');
    });
  });

  describe('paren vote per call', () => {
    const cand = candidate({ left: 30, width: 16 });

    it('keeps parens that are already logical', () => {
      const items = [text('הכנסה (יש לצרף תלוש)', { left: 46.5, top: 19.8, width: 20 })];
      expect(labelFieldCandidates([cand], items)[0].label).toBe('הכנסה (יש לצרף תלוש)');
    });

    it('does not count a logical "1) ... (...)" item as mirrored', () => {
      const items = [
        text('הכנסה (יש)', { left: 46.5, top: 5, width: 12 }),
        text('1) הכנסה (שכר)', { left: 46.5, top: 19.8, width: 12 }),
      ];
      expect(labelFieldCandidates([cand], items)[0].label).toBe('1) הכנסה (שכר)');
    });

    it('flips parens when the page stores them mirrored, fragments included', () => {
      const items = [
        text('הכנסה )יש לצרף תלוש(', { left: 46.5, top: 5, width: 20 }),
        text('שכר )', { left: 46.5, top: 19.8, width: 6 }),
      ];
      expect(labelFieldCandidates([cand], items)[0].label).toBe('שכר (');
    });
  });

  describe('list numbers beside a box', () => {
    const box = candidate({ kind: 'checkbox', left: 86.48, top: 20, width: 1.3, height: 1.3 });
    const marker = (str, left, width) => text(str, { left, top: 19.8, width, dir: 'ltr' });

    it('skips a list number when words follow it', () => {
      const items = [
        marker('1', 84.62, 0.9), marker('.', 84.17, 0.4),
        text('אני חייל משוחרר', { left: 70, top: 19.8, width: 12.8 }),
      ];
      expect(labelFieldCandidates([box], items)[0].label).toBe('אני חייל משוחרר');
    });

    it('skips a list number to the right of the box', () => {
      const right = candidate({ kind: 'checkbox', left: 40, top: 20, width: 1.3, height: 1.3 });
      const items = [
        marker('1', 41.8, 0.9), marker('.', 42.8, 0.4),
        text('אני חייל משוחרר', { left: 44, top: 19.8, width: 12.8 }),
      ];
      expect(labelFieldCandidates([right], items)[0].label).toBe('אני חייל משוחרר');
    });

    it('keeps a bare quantity before a word', () => {
      const items = [marker('12', 84.62, 1.4), text('חודשים', { left: 76, top: 19.8, width: 7 })];
      expect(labelFieldCandidates([box], items)[0].label).toContain('12');
    });

    it('keeps a number that is the whole label', () => {
      const items = [marker('30', 84.62, 1.4)];
      expect(labelFieldCandidates([box], items)[0].label).toBe('30');
    });
  });
});
