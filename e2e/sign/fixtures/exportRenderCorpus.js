/**
 * @file exportRenderCorpus.js
 * @description The element corpus behind `export-render-guard.spec.js` (W1).
 *
 * **Every string here is deliberately short.** The guard's sensitivity is
 * relative: it compares the ink a case produces against that same case's
 * stored baseline, normalised by the ink present. One wrong or missing glyph
 * in a four-glyph string moves that number by tens of percent; the same defect
 * inside a paragraph moves it by one or two, which is inside any tolerance
 * wide enough to survive a second machine's antialiasing. So the corpus is
 * many short cases rather than a few long ones, and a case that grows a
 * sentence is a case that stopped being able to fail.
 *
 * **What each case is here to catch**, since a corpus with no stated purpose
 * drifts into a list of strings someone liked:
 *
 *  - the four historical failure modes this guard exists for - a substituted
 *    font, a corrupted `glyf`, a subset missing composite components, a subset
 *    missing a glyph - all of which passed `pdffonts`, `pdftotext` and a zero
 *    exit code while rendering wrong (see TODO.md, W1);
 *  - one case per shipped script, because the guard map in
 *    docs/wysiwyg-text-architecture.md §1.3 says five of seven scripts have no
 *    agreement proof at all, and this is the first check any of them get on
 *    the artifact the user actually receives;
 *  - the two pipeline stages with the most machinery behind them: bidi run
 *    ordering (`mixed-*`) and Hebrew mark composition + placement (`nikud`);
 *  - the comb path, which skips bidi entirely and positions by cell index, in
 *    both directions - it is the one drawing path with its own geometry;
 *  - a font substitution (`substituted-hebrew-handwriting`), where the family
 *    that gets embedded is not the family the element asked for. That is
 *    exactly the shape of "a substituted font", and it is the case a baseline
 *    can prove is still resolving the way it did.
 *
 * **What is deliberately NOT here: anything `signPdf` refuses.** The refusal
 * path is `sign.test.js`'s and `textCoverage.test.js`'s; a corpus entry that
 * throws would fail the harness rather than test it.
 *
 * The page is one blank US-Letter-ish landscape sheet per case, sized in
 * `exportRenderHarness.js`, and every element sits at the same spot with the
 * same size unless the case is about size or position. Holding the geometry
 * fixed is what lets the signature grid catch a *positioning* regression: two
 * cases that differ only in where the ink landed have to read as different.
 */

/** Font size in points, shared by every case that is not about size. */
const SIZE = 28;

/** Where the box sits, as page percentages. Fixed so position is testable. */
const LEFT = 8;
const TOP = 22;

// For an RTL element, `left` is not the box's left edge - it is the anchored
// edge, which text.ts's `serialize` treats as the box's RIGHT edge (`boxLeft
// = pdfX - widthPoints` for combs; the plain-line pen starts at `pdfX -
// lineWidth`). Every case here used to share plain `LEFT`, so every RTL case
// was anchored at 8% of the page and drawn growing LEFT from there - off the
// left edge of the sheet, with only a clipped tail surviving. That is what
// the non-vacuity assertion caught on the very first baseline capture:
// "hebrew-arimo" and "mixed-rtl-paragraph" came out byte-identical, because
// both had been reduced to the same off-page fragment. RTL cases get their
// own anchor, set far enough right that the text draws fully on the page.
const RTL_ANCHOR = 92;

function textCase(id, text, overrides = {}) {
  return {
    id,
    element: {
      id: `el-${id}`,
      type: 'text',
      pageIndex: 0,
      left: LEFT,
      top: TOP,
      text,
      fontSize: SIZE,
      color: '#000000',
      ...overrides,
    },
  };
}

export const EXPORT_RENDER_CORPUS = [
  // --- Latin, including the four faces that carry `calt` (§1.3). Whether
  // fontkit and HarfBuzz walk those features the same way is W8's question;
  // this only asks whether the exported ink is still what it was.
  textCase('latin-arimo', 'Sarah Levi', { fontFamily: 'Arimo' }),
  textCase('latin-pacifico', 'Sarah Levi', { fontFamily: 'Pacifico' }),
  textCase('latin-caveat', 'David Cohen', { fontFamily: 'Caveat' }),
  textCase('latin-great-vibes', 'David Cohen', { fontFamily: 'Great Vibes' }),

  // --- Hebrew: plain, and with nikud. The second is the whole of layer 1
  // (composition) plus mark placement, in the one font the Hebrew guards
  // already trust, so a regression there is unambiguous.
  textCase('hebrew-arimo', 'שלום עולם', { fontFamily: 'Arimo', left: RTL_ANCHOR }),
  textCase('hebrew-nikud-arimo', 'בְּרֵאשִׁית', { fontFamily: 'Arimo', left: RTL_ANCHOR }),
  textCase('hebrew-heebo', 'שלום עולם', { fontFamily: 'Heebo', left: RTL_ANCHOR }),

  // --- A family with no Hebrew glyphs at all, so the export embeds a
  // different one than the element asked for. "A substituted font" is one of
  // the four failure modes; this is the case that pins the substitution.
  textCase('substituted-hebrew-handwriting', 'שלום', { fontFamily: 'Caveat', left: RTL_ANCHOR }),

  // --- Bidi. Both paragraph directions, because run ordering is resolved
  // against the element's own direction and the two are not mirror images.
  textCase('mixed-rtl-paragraph', 'שלום Tel Aviv', { fontFamily: 'Arimo', textDirection: 'rtl', left: RTL_ANCHOR }),
  textCase('mixed-ltr-paragraph', 'Tel Aviv שלום', { fontFamily: 'Arimo', textDirection: 'ltr' }),

  // --- The scripts with no agreement proof today, one case each.
  textCase('arabic-almarai', 'مرحبا', { fontFamily: 'Almarai', left: RTL_ANCHOR }),
  textCase('devanagari-kalam', 'नमस्ते', { fontFamily: 'Kalam' }),
  textCase('thai-mali', 'สวัสดี', { fontFamily: 'Mali' }),
  textCase('cyrillic-pt-sans', 'Привіт', { fontFamily: 'PT Sans' }),
  textCase('greek-tinos', 'Καλημέρα', { fontFamily: 'Tinos' }),

  // --- The comb path: positions by cell index, skips bidi, has its own
  // geometry. `width` is what makes an element a comb (see comb.js).
  textCase('comb-ltr', 'AB12', { fontFamily: 'Arimo', width: 40, combCells: 6 }),
  textCase('comb-rtl', 'שלום', { fontFamily: 'Arimo', width: 40, combCells: 6, textDirection: 'rtl', left: RTL_ANCHOR }),

  // --- Multi-line, which is the only place line height reaches the ink.
  textCase('multiline-arimo', 'One\nTwo', { fontFamily: 'Arimo' }),

  // --- Geometry cases. These exist so the signature is proven to see *where*
  // the ink is, not only how much: same text, same font, different size and
  // different position. If the grid were insensitive to placement these would
  // collide with `latin-arimo` and the non-vacuity assertion would say so.
  textCase('geometry-large', 'Sarah Levi', { fontFamily: 'Arimo', fontSize: 44 }),
  textCase('geometry-offset', 'Sarah Levi', { fontFamily: 'Arimo', left: 45, top: 60 }),

  // --- Colour reaches the ink measure through luminance, so a colour
  // regression (a fill written in the wrong space) is visible here. This
  // case used to draw the same string, size and position as `latin-arimo`,
  // which made it close to a uniform luminance-scaled copy of that case
  // (#c00000 gives an ink ratio of roughly 0.84) - only 16.01% apart, weak
  // headroom for a corpus entry that is supposed to be its own thing. It
  // draws its own string now so it is a distinct case rather than a scaled
  // duplicate. It does not need to pair against an identical black case to
  // prove the signature is colour-sensitive: a colour regression still moves
  // this case away from its OWN baseline, which is what the guard asserts.
  textCase('colour-red', 'Maya Reyes', { fontFamily: 'Arimo', color: '#c00000' }),
];
