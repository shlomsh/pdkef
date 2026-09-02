import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { PDFDocument, PDFName, PDFNumber, degrees } from '@cantoo/pdf-lib';
import {
  signPdf,
  UnrepresentableTextError
} from './sign.js';
import { hexToRgbFractions, getEffectiveTextDirection } from '../../../lib/signHelpers.js';
import { percentToPoints } from '../../geometry/coords.js';
import { applyAffineTransform, createPageGeometry, pageGeometryFromPdfJsPage } from '../../geometry/coords.js';
import { combCellCount, combCharacters } from '../../text/comb.js';

function getFixtureFile(name = 'num-1.pdf') {
  const filePath = path.resolve(__dirname, '../../../lib/__fixtures__', name);
  const buffer = fs.readFileSync(filePath);
  return new File([buffer], name, { type: 'application/pdf' });
}

// signPdf fetches bundled fonts from same-origin `/fonts/<name>.ttf` at runtime.
// Node's test environment has no server, so serve the real files straight off
// disk — this keeps the test honest about which files actually exist (a missing
// file here fails exactly like a 404 would in the browser).
function mockFontFetch() {
  const originalFetch = global.fetch;
  global.fetch = vi.fn(async (url) => {
    const match = /\/fonts\/(.+)$/.exec(String(url));
    if (!match) return originalFetch ? originalFetch(url) : Promise.reject(new Error('unexpected fetch'));
    const filePath = path.resolve(__dirname, '../../../../public/fonts', match[1]);
    if (!fs.existsSync(filePath)) {
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const buffer = fs.readFileSync(filePath);
    return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array(buffer).buffer };
  });
  return () => { global.fetch = originalFetch; };
}

async function getTextItems(blob) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({
    data: new Uint8Array(await blob.arrayBuffer()),
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  await loadingTask.destroy();
  return textContent.items;
}

describe('sign.js signPdf', () => {
  let restoreFetch;

  beforeEach(() => {
    restoreFetch = mockFontFetch();
  });

  afterEach(() => {
    restoreFetch();
    vi.restoreAllMocks();
  });

  it('runs every element serializer through the same cropped transform at 0/90/180/270 degrees', async () => {
    const source = await PDFDocument.create();
    const rotations = [0, 90, 180, 270];
    rotations.forEach((rotation) => {
      const page = source.addPage([400, 500]);
      page.setCropBox(40, 60, 240, 320);
      page.setRotation(degrees(rotation));
      page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
    });
    const file = new File([await source.save()], 'rotated-cropped.pdf', { type: 'application/pdf' });
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const elements = rotations.flatMap((_, pageIndex) => [
      { id: `text-${pageIndex}`, type: 'text', pageIndex, left: 10, top: 10, text: 'A', fontFamily: 'Arimo', fontSize: 12, color: '#000000' },
      { id: `symbol-${pageIndex}`, type: 'symbol', pageIndex, left: 20, top: 20, width: 8, height: 8, mark: 'check', color: '#1463ff' },
      { id: `signature-${pageIndex}`, type: 'signature', pageIndex, left: 30, top: 30, width: 12, height: 6, dataUrl: png },
      { id: `line-${pageIndex}`, type: 'line', pageIndex, x1: 10, y1: 50, x2: 40, y2: 60, color: '#1463ff', strokeWidth: 2 },
      { id: `rectangle-${pageIndex}`, type: 'rectangle', pageIndex, left: 45, top: 15, width: 12, height: 10, color: '#1463ff', strokeWidth: 2 },
      { id: `ellipse-${pageIndex}`, type: 'ellipse', pageIndex, left: 60, top: 30, width: 12, height: 10, color: '#1463ff', strokeWidth: 2 },
      { id: `whiteout-${pageIndex}`, type: 'whiteout', pageIndex, left: 70, top: 70, width: 10, height: 8, color: '#ffffff' },
    ]);

    const blob = await signPdf(file, elements);
    const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = getDocument({
      data: new Uint8Array(await blob.arrayBuffer()),
      useWorkerFetch: false,
      isEvalSupported: false,
    });
    const output = await loadingTask.promise;

    for (let pageIndex = 0; pageIndex < rotations.length; pageIndex++) {
      const page = await output.getPage(pageIndex + 1);
      // Non-vacuity: pdf.js sees the intended crop and rotation in the saved
      // document, rather than this only testing matrices detached from a PDF.
      expect(page.view).toEqual([40, 60, 280, 380]);
      expect(page.rotate).toBe(rotations[pageIndex]);
      expect(pageGeometryFromPdfJsPage(page).pdfToViewport)
        .toEqual(page.getViewport({ scale: 1 }).transform);

      const geometry = createPageGeometry({
        cropBox: { x: 40, y: 60, width: 240, height: 320 },
        rotation: rotations[pageIndex],
        userUnit: 2,
      });
      const textContent = await page.getTextContent();
      const textItem = textContent.items.find((item) => item.str === 'A');
      expect(textItem).toBeDefined();
      const viewportTextOrigin = applyAffineTransform(
        { x: textItem.transform[4], y: textItem.transform[5] },
        geometry.pdfToViewport,
      );
      expect(viewportTextOrigin.x).toBeCloseTo(geometry.width * 0.1, 6);
      expect(viewportTextOrigin.y).toBeGreaterThan(geometry.height * 0.1);

      const operatorList = await page.getOperatorList();
      const sharedTransforms = operatorList.fnArray.reduce((count, fn, index) => {
        if (fn !== OPS.transform) return count;
        const args = operatorList.argsArray[index];
        const matches = geometry.editorToPdf.every((value, argIndex) =>
          Math.abs(args[argIndex] - value) < 1e-8);
        return count + (matches ? 1 : 0);
      }, 0);
      // One q/cm/.../Q frame per text, symbol, signature, line, rectangle,
      // ellipse and whiteout serializer. A type bypassing the shared transform
      // drops this count immediately on every affected rotation fixture.
      expect(sharedTransforms).toBe(7);
    }

    await loadingTask.destroy();
  });

  it('bakes RTL text so its right edge lands at the stored `left` percent, not its left-start', async () => {
    // num-1.pdf is a 200x200pt page (see __fixtures__).
    const file = getFixtureFile();
    const pdfWidth = 200;

    // The editor stores `left` as the RIGHT-anchor percent for RTL text
    // (DraggableOverlayElement.tsx: `right: 100 - element.left`). left=80 means
    // the box's right edge sits at 80% of the page width from the left.
    const element = {
      id: 'el-rtl',
      type: 'text',
      pageIndex: 0,
      left: 80,
      top: 10,
      text: 'שלום',
      textDirection: 'rtl',
      fontFamily: 'Heebo',
      fontSize: 20,
      color: '#000000'
    };

    const blob = await signPdf(file, [element]);
    const items = await getTextItems(blob);
    // num-1.pdf already has its own "1" text item baked in — find our drawn RTL
    // run specifically (pdfjs tags it `dir: 'rtl'`) rather than assuming index 0.
    const item = items.find((i) => i.dir === 'rtl');
    expect(item).toBeDefined();

    const xStart = item.transform[4];
    const lineWidth = item.width;
    const rightEdge = xStart + lineWidth;
    const expectedRightEdge = percentToPoints(element.left, pdfWidth);

    // The right edge of the drawn glyph run must land at the anchored percent —
    // if the old (left-start) math were still in place, xStart itself would
    // equal expectedRightEdge instead, putting the whole word ~lineWidth points
    // too far right.
    expect(rightEdge).toBeCloseTo(expectedRightEdge, 0);
    expect(xStart).toBeLessThan(expectedRightEdge);
  });

  it('bakes LTR text starting at the stored `left` percent (unaffected by the RTL fix)', async () => {
    const file = getFixtureFile();
    const pdfWidth = 200;

    const element = {
      id: 'el-ltr',
      type: 'text',
      pageIndex: 0,
      left: 10,
      top: 10,
      text: 'Hello',
      textDirection: 'ltr',
      fontSize: 20,
      color: '#000000'
    };

    const blob = await signPdf(file, [element]);
    const items = await getTextItems(blob);
    const item = items.find((i) => i.str.includes('Hello'));
    expect(item).toBeDefined();

    const expectedLeftEdge = percentToPoints(element.left, pdfWidth);
    expect(item.transform[4]).toBeCloseTo(expectedLeftEdge, 0);
  });

  it('falls back to the same font family\'s Regular weight (not Helvetica) when a handwriting font has no Bold file', async () => {
    const file = getFixtureFile();
    const element = {
      id: 'el-bold-handwriting',
      type: 'text',
      pageIndex: 0,
      left: 10,
      top: 10,
      text: 'Signed',
      // Caveat, Dancing Script, Kalam and Mali all ship real Bold files now
      // (see CLAUDE.md's font-face guidance), so this fallback path needs a
      // family that genuinely still has none anywhere upstream. Great Vibes
      // and Sacramento (and Gveret Levin, Pacifico) qualify.
      fontFamily: 'Great Vibes',
      fontWeight: 'bold',
      fontSize: 20,
      color: '#000000'
    };

    // Should not throw despite GreatVibes-Bold.ttf not existing in public/fonts/.
    const blob = await signPdf(file, [element]);
    expect(blob).toBeInstanceOf(Blob);

    // The fallback path must have been exercised: a failed request for the
    // Bold file, then a successful one for the Regular file of the SAME family
    // (proving it didn't just silently fall through to a Helvetica StandardFont
    // with zero custom-font fetches).
    const requestedFiles = global.fetch.mock.calls.map(([url]) => String(url));
    expect(requestedFiles.some((u) => u.includes('GreatVibes-Bold.ttf'))).toBe(true);
    expect(requestedFiles.some((u) => u.includes('GreatVibes-Regular.ttf'))).toBe(true);
  });

  describe('refuses rather than silently drop characters no bundled font can draw (H5)', () => {
    // Chinese, then Pashto, were this suite's example in turn, and each
    // stopped being genuinely unrepresentable as its font landed (Noto Sans
    // SC/TC covering shared Han characters, see fonts.js's CATALOGUE comment;
    // Scheherazade New covering Pashto's eleven extra letters). Emoji is the
    // one fixture stable against the catalogue growing (see TODO.md).
    it('throws UnrepresentableTextError naming the characters, instead of returning a PDF missing them', async () => {
      const file = getFixtureFile();
      const element = {
        id: 'el-emoji',
        type: 'text',
        pageIndex: 0,
        left: 10,
        top: 10,
        text: '😀🎉',
        fontFamily: 'Heebo',
        fontSize: 20,
        color: '#000000'
      };

      await expect(signPdf(file, [element])).rejects.toBeInstanceOf(UnrepresentableTextError);
      const error = await signPdf(file, [element]).catch((e) => e);
      expect(error.characters).toEqual(['😀', '🎉']);
    });

    it('reports which page to look on, so a long document is actionable', async () => {
      const file = getFixtureFile();
      const element = {
        id: 'el-emoji', type: 'text', pageIndex: 0, left: 10, top: 10,
        text: '😀🎉', fontFamily: 'Heebo', fontSize: 20, color: '#000000'
      };
      const error = await signPdf(file, [element]).catch((e) => e);
      // 1-based, matching what the page navigation shows the user.
      expect(error.pageNumbers).toEqual([1]);
    });

    it('judges only the comb cells that are actually drawn, not the whole string', async () => {
      const file = getFixtureFile();
      // A comb renders slice(0, cellCount) and ignores the overflow, so an
      // unrepresentable character past the last cell never reaches the page
      // and must not refuse the document.
      const element = {
        id: 'el-comb', type: 'text', pageIndex: 0, left: 10, top: 10,
        width: 20, comb: true, combCells: 4,
        text: 'שלום 😀🎉', fontFamily: 'Heebo', fontSize: 20, color: '#000000'
      };
      const combCells = combCellCount(element);
      // Non-vacuity: the emoji really is beyond the drawn cells, and really
      // is unrepresentable - otherwise this passes for the wrong reason.
      expect(combCharacters(element).slice(0, combCells).join('')).not.toContain('😀');
      expect(combCharacters(element).length).toBeGreaterThan(combCells);

      await expect(signPdf(file, [element])).resolves.toBeInstanceOf(Blob);
    });

    it('refuses the whole document rather than writing the elements that come before the bad one', async () => {
      const file = getFixtureFile();
      const goodElement = {
        id: 'el-good', type: 'text', pageIndex: 0, left: 10, top: 10,
        text: 'שלום', fontFamily: 'Heebo', fontSize: 20, color: '#000000'
      };
      const badElement = {
        id: 'el-bad', type: 'text', pageIndex: 0, left: 10, top: 60,
        text: '😀🎉', fontFamily: 'Heebo', fontSize: 20, color: '#000000'
      };

      // The good element is first in the array; if the pre-pass only checked
      // as it went (or ran after serializing), this would resolve with a PDF
      // that already has "שלום" baked in rather than refusing outright.
      await expect(signPdf(file, [goodElement, badElement])).rejects.toBeInstanceOf(UnrepresentableTextError);
    });

    it('does not flag ordinary Hebrew, Latin or digits - no false positive', async () => {
      const file = getFixtureFile();
      const element = {
        id: 'el-clean', type: 'text', pageIndex: 0, left: 10, top: 10,
        text: 'רחוב 17, Tel Aviv', fontFamily: 'Heebo', fontSize: 20, color: '#000000'
      };

      const blob = await signPdf(file, [element]);
      expect(blob).toBeInstanceOf(Blob);
    });

    it('reports only the one unrepresentable character in an otherwise-clean Hebrew line', async () => {
      const file = getFixtureFile();
      const element = {
        id: 'el-emoji', type: 'text', pageIndex: 0, left: 10, top: 10,
        text: 'שלום 😀', fontFamily: 'Heebo', fontSize: 20, color: '#000000'
      };

      const error = await signPdf(file, [element]).catch((e) => e);
      expect(error).toBeInstanceOf(UnrepresentableTextError);
      expect(error.characters).toEqual(['😀']);
    });
  });
});

describe('sign.js pure functions', () => {
  describe('hexToRgbFractions', () => {
    it('should convert standard hex colors correctly', () => {
      expect(hexToRgbFractions('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgbFractions('#ffffff')).toEqual({ r: 1, g: 1, b: 1 });
      expect(hexToRgbFractions('#ff0000')).toEqual({ r: 1, g: 0, b: 0 });
    });

    it('should handle hex colors without the # prefix', () => {
      expect(hexToRgbFractions('00ff00')).toEqual({ r: 0, g: 1, b: 0 });
    });

    it('should return black for invalid or undefined input if fallback is not provided', () => {
      expect(hexToRgbFractions(undefined)).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgbFractions(null)).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgbFractions('invalid')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('should use the provided fallback color', () => {
      expect(hexToRgbFractions(null, '#0000ff')).toEqual({ r: 0, g: 0, b: 1 });
    });
  });

  describe('getEffectiveTextDirection', () => {
    it('should return ltr by default for empty or latin text', () => {
      expect(getEffectiveTextDirection({ type: 'text', text: '' })).toBe('ltr');
      expect(getEffectiveTextDirection({ type: 'text', text: 'Hello world' })).toBe('ltr');
    });

    it('should return rtl for hebrew or arabic text', () => {
      expect(getEffectiveTextDirection({ type: 'text', text: 'שלום' })).toBe('rtl');
      expect(getEffectiveTextDirection({ type: 'text', text: 'مرحبا' })).toBe('rtl');
    });

    it('uses English/LTR for empty legacy text even when it stores RTL direction', () => {
      expect(getEffectiveTextDirection({ type: 'text', text: '', textDirection: 'rtl' })).toBe('ltr');
    });

    it('should render digits and date/ID punctuation left-to-right regardless of a stale or inherited textDirection', () => {
      // A numeric field placed right after a Hebrew one otherwise inherits
      // that element's remembered direction and renders backwards/right-
      // anchored, even though "27/05/2008" has no Hebrew in it at all.
      expect(getEffectiveTextDirection({ type: 'text', text: '123', textDirection: 'rtl' })).toBe('ltr');
      expect(getEffectiveTextDirection({ type: 'text', text: '327-69-8221', textDirection: 'rtl' })).toBe('ltr');
      expect(getEffectiveTextDirection({ type: 'text', text: '27/05/2008', textDirection: 'rtl' })).toBe('ltr');
    });

    it('should treat every non-RTL script as left-to-right, not just Latin', () => {
      // Devanagari/Thai/Cyrillic/Greek/CJK have no RTL character in them, so
      // they must resolve to ltr on their own rather than inheriting the
      // direction of the element edited before them.
      for (const text of ['नमस्ते भारत', 'สวัสดี', 'Привет', 'Γειά σου', 'こんにちは']) {
        expect(getEffectiveTextDirection({ type: 'text', text, textDirection: 'rtl' })).toBe('ltr');
      }
    });

    it('should let typed language direction override the fallback direction', () => {
      expect(getEffectiveTextDirection({ type: 'text', text: 'Hello', textDirection: 'rtl' })).toBe('ltr');
      expect(getEffectiveTextDirection({ type: 'text', text: 'שלום', textDirection: 'ltr' })).toBe('rtl');
      expect(getEffectiveTextDirection({ type: 'text', text: 'Hello שלום' })).toBe('ltr');
      expect(getEffectiveTextDirection({ type: 'text', text: 'שלום Hello' })).toBe('rtl');
    });
  });

  /**
   * W6 extraction guard (docs/wysiwyg-text-architecture.md §7, §9 guardrail
   * 4): round-trip the produced PDF through BOTH `pdftotext` and pdf.js and
   * assert the extracted codepoint sequence against the typed text. Two
   * extractors on purpose - §7 measured that they disagree with each other,
   * so a single-extractor guard would have called today's pre-W6 behaviour
   * fine.
   *
   * What each extractor is actually held to, and why the two assertions
   * differ:
   *
   * - `pdftotext` is the extractor `/ActualText` was written for (poppler
   *   runs its own bidi over the field - see drawShapedRun's doc comment in
   *   text.ts). Every corpus case below is asserted to extract EXACTLY the
   *   typed text (mod the directional formatting characters, U+202A-U+202E
   *   / U+2066-U+2069, that `pdftotext -layout` itself inserts around a
   *   bidi run for terminal display - those are pdftotext's own presentation
   *   marks, never present in what was typed, and stripping them is the
   *   correct normalization for a content comparison, not a weakening of it).
   *   This is the actual thing W6 buys.
   * - pdf.js IGNORES `/ActualText` entirely (§7), so this guard cannot and
   *   does not assert pdf.js output equals the typed text for every case -
   *   that would be asserting something W6 does not and cannot fix, and
   *   would misrepresent the feature. Latin and Arabic here have no
   *   composition/reordering step to disagree over, so pdf.js's answer does
   *   already equal the typed text and is asserted as such (a real
   *   regression signal: if this ever stops holding, drawShapedRun's glyph
   *   draw order changed). Hebrew and the mixed-direction case are asserted
   *   against pdf.js's exact KNOWN-DIVERGENT output (decomposed marks
   *   reordered per cluster; bidi runs concatenated in visual, not typed,
   *   order) - unchanged before and after W6, and pinned here so a future
   *   change can't silently make it worse without a failing test noticing.
   */
  describe('W6 /ActualText extraction guard (docs/wysiwyg-text-architecture.md §7)', () => {
    // This describe block sits under 'sign.js pure functions', not
    // 'sign.js signPdf', so it needs its own font-fetch mocking rather than
    // relying on that other describe's beforeEach/afterEach.
    let restoreFetch;
    beforeEach(() => { restoreFetch = mockFontFetch(); });
    afterEach(() => { restoreFetch(); });

    // Bidi formatting characters pdftotext's own `-layout` mode inserts
    // around a directional run for terminal display - not content, and never
    // present in typed text. Stripping them is what makes the comparison
    // honest rather than the comparison finding a false negative.
    const BIDI_FORMATTING_CHARS = /[‎‏‪-‮⁦-⁩]/g;

    let pdftotextAvailable = false;
    try {
      execFileSync('which', ['pdftotext'], { stdio: 'ignore' });
      pdftotextAvailable = true;
    } catch {
      // eslint-disable-next-line no-console
      console.warn(
        '[W6 extraction guard] `pdftotext` (poppler-utils) not found on PATH - ' +
        'the pdftotext half of this guard is SKIPPED, not faked. Install ' +
        'poppler-utils (e.g. `brew install poppler`) to run it locally; ' +
        'adding it as a CI dependency is a decision for a human, not this test.',
      );
    }
    const itPdftotext = pdftotextAvailable ? it : it.skip;

    function extractPdftotextText(buffer) {
      const tmpPath = path.join(os.tmpdir(), `pdkef-w6-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
      fs.writeFileSync(tmpPath, buffer);
      try {
        const raw = execFileSync('pdftotext', ['-layout', tmpPath, '-'], { encoding: 'utf8' });
        return raw.replace(BIDI_FORMATTING_CHARS, '');
      } finally {
        fs.unlinkSync(tmpPath);
      }
    }

    // num-1.pdf (the fixture every case below signs onto) already carries a
    // baked-in "1" text item of its own (see getFixtureFile's doc comment
    // elsewhere in this file) - pdf.js reports it as items[0], with an empty
    // items[1] pdf.js itself inserts between text runs. Drop both so only
    // the glyphs this test actually drew are compared.
    function drawnPdfJsItems(items) {
      return items.filter((item) => item.str !== '').slice(1);
    }

    itPdftotext('keeps an authored Persian ZWNJ in searchable exported text', async () => {
      const typed = 'می\u200Cروم';
      const file = getFixtureFile();
      const blob = await signPdf(file, [{
        id: 'el-persian-zwnj', type: 'text', pageIndex: 0, left: 50, top: 10,
        text: typed, textDirection: 'rtl', fontFamily: 'Scheherazade New',
        fontSize: 20, color: '#000000',
      }]);
      const extracted = extractPdftotextText(Buffer.from(await blob.arrayBuffer()));
      expect(extracted).toContain(typed);
    });

    const corpus = [
      // The measured case from §7: Hebrew niqud, composed to presentation
      // forms for shaping and decomposed again for extraction.
      { name: 'Hebrew (בְּרֵאשִׁית, Arimo)', text: 'בְּרֵאשִׁית', fontFamily: 'Arimo', textDirection: 'rtl', pdfJsExpected: 'ּבְרֵאׁשִית' },
      // Plain LTR Latin: no composition, no bidi reordering - both
      // extractors should already agree with the typed text on this one.
      { name: 'Latin (Hello World, Arimo)', text: 'Hello World', fontFamily: 'Arimo', textDirection: 'ltr', pdfJsExpected: 'Hello World' },
      // Mixed-direction (H6's own corpus): an RTL paragraph with an embedded
      // LTR digit run. pdftotext must recover the typed logical order;
      // pdf.js concatenates in VISUAL draw order (digits, then the Hebrew
      // word), which is why its expected string here is NOT the typed one.
      { name: 'mixed direction (רחוב 17, Heebo)', text: 'רחוב 17', fontFamily: 'Heebo', textDirection: 'rtl', pdfJsExpected: '17 רחוב' },
      // Arabic: RTL, no niqud-style marks to reorder in this word, so both
      // extractors already agree with the typed text.
      { name: 'Arabic (مرحبا, Almarai)', text: 'مرحبا', fontFamily: 'Almarai', textDirection: 'rtl', pdfJsExpected: 'مرحبا' },
    ];

    for (const testCase of corpus) {
      describe(testCase.name, () => {
        itPdftotext('extracts exactly the typed text via pdftotext', async () => {
          const file = getFixtureFile();
          const element = {
            id: 'el-w6', type: 'text', pageIndex: 0, left: 50, top: 10,
            text: testCase.text, textDirection: testCase.textDirection,
            fontFamily: testCase.fontFamily, fontSize: 20, color: '#000000',
          };
          const blob = await signPdf(file, [element]);
          const extracted = extractPdftotextText(Buffer.from(await blob.arrayBuffer()));
          expect(extracted).toContain(testCase.text);
        });

        it('matches pdf.js\'s known extraction (unaffected by /ActualText, which pdf.js ignores)', async () => {
          const file = getFixtureFile();
          const element = {
            id: 'el-w6', type: 'text', pageIndex: 0, left: 50, top: 10,
            text: testCase.text, textDirection: testCase.textDirection,
            fontFamily: testCase.fontFamily, fontSize: 20, color: '#000000',
          };
          const blob = await signPdf(file, [element]);
          const items = await getTextItems(blob);
          const joined = drawnPdfJsItems(items).map((item) => item.str).join('');
          expect(joined).toBe(testCase.pdfJsExpected);
        });
      });
    }
  });
});
