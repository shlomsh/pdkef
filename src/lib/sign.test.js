import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import {
  signPdf,
  hexToRgbFractions,
  getEffectiveTextDirection,
  uniqueId,
  seedUniqueId,
  UnrepresentableTextError
} from './sign.js';
import { percentToPoints } from './coords.js';
import { combCellCount, combCharacters } from './comb.js';

function getFixtureFile(name = 'num-1.pdf') {
  const filePath = path.resolve(__dirname, './__fixtures__', name);
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
    const filePath = path.resolve(__dirname, '../../public/fonts', match[1]);
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
      fontFamily: 'Caveat',
      fontWeight: 'bold',
      fontSize: 20,
      color: '#000000'
    };

    // Should not throw despite Caveat-Bold.ttf not existing in public/fonts/.
    const blob = await signPdf(file, [element]);
    expect(blob).toBeInstanceOf(Blob);

    // The fallback path must have been exercised: a failed request for the
    // Bold file, then a successful one for the Regular file of the SAME family
    // (proving it didn't just silently fall through to a Helvetica StandardFont
    // with zero custom-font fetches).
    const requestedFiles = global.fetch.mock.calls.map(([url]) => String(url));
    expect(requestedFiles.some((u) => u.includes('Caveat-Bold.ttf'))).toBe(true);
    expect(requestedFiles.some((u) => u.includes('Caveat-Regular.ttf'))).toBe(true);
  });

  describe('refuses rather than silently drop characters no bundled font can draw (H5)', () => {
    it('throws UnrepresentableTextError naming the characters, instead of returning a PDF missing them', async () => {
      const file = getFixtureFile();
      const element = {
        id: 'el-chinese',
        type: 'text',
        pageIndex: 0,
        left: 10,
        top: 10,
        text: '你好吗呀吧', // Chinese - no bundled font carries CJK glyphs (see TODO.md, page-weight blocker)
        fontFamily: 'Heebo',
        fontSize: 20,
        color: '#000000'
      };

      await expect(signPdf(file, [element])).rejects.toBeInstanceOf(UnrepresentableTextError);
      const error = await signPdf(file, [element]).catch((e) => e);
      expect(error.characters).toEqual(['你', '好', '吗', '呀', '吧']);
    });

    it('reports which page to look on, so a long document is actionable', async () => {
      const file = getFixtureFile();
      const element = {
        id: 'el-chinese', type: 'text', pageIndex: 0, left: 10, top: 10,
        text: '你好吗呀吧', fontFamily: 'Heebo', fontSize: 20, color: '#000000'
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
        text: 'שלום 你好吗呀吧', fontFamily: 'Heebo', fontSize: 20, color: '#000000'
      };
      const combCells = combCellCount(element);
      // Non-vacuity: the Chinese really is beyond the drawn cells, and really
      // is unrepresentable - otherwise this passes for the wrong reason.
      expect(combCharacters(element).slice(0, combCells).join('')).not.toContain('你');
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
        text: '你好吗呀吧', fontFamily: 'Heebo', fontSize: 20, color: '#000000'
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

    it('should use textDirection only as a fallback before any text is typed', () => {
      expect(getEffectiveTextDirection({ type: 'text', text: '', textDirection: 'rtl' })).toBe('rtl');
    });

    it('should render digits and date/ID punctuation left-to-right regardless of a stale or inherited textDirection', () => {
      // A numeric field placed right after a Hebrew one otherwise inherits
      // that element's remembered direction and renders backwards/right-
      // anchored, even though "27/05/2008" has no Hebrew in it at all.
      expect(getEffectiveTextDirection({ type: 'text', text: '123', textDirection: 'rtl' })).toBe('ltr');
      expect(getEffectiveTextDirection({ type: 'text', text: '327-69-8221', textDirection: 'rtl' })).toBe('ltr');
      expect(getEffectiveTextDirection({ type: 'text', text: '27/05/2008', textDirection: 'rtl' })).toBe('ltr');
    });

    it('should let typed language direction override the fallback direction', () => {
      expect(getEffectiveTextDirection({ type: 'text', text: 'Hello', textDirection: 'rtl' })).toBe('ltr');
      expect(getEffectiveTextDirection({ type: 'text', text: 'שלום', textDirection: 'ltr' })).toBe('rtl');
      expect(getEffectiveTextDirection({ type: 'text', text: 'Hello שלום' })).toBe('ltr');
      expect(getEffectiveTextDirection({ type: 'text', text: 'שלום Hello' })).toBe('rtl');
    });
  });

  describe('uniqueId', () => {
    it('should generate sequential string IDs', () => {
      seedUniqueId([]); // reset max
      const id1 = uniqueId();
      const id2 = uniqueId();
      expect(id1).toMatch(/^el-\d+$/);
      expect(id2).toMatch(/^el-\d+$/);
      expect(id1).not.toBe(id2);
    });

    it('should respect seedUniqueId to prevent collisions', () => {
      seedUniqueId([{ id: 'el-10' }, { id: 'el-5' }]);
      const newId = uniqueId();
      expect(newId).toBe('el-11');
      const nextId = uniqueId();
      expect(nextId).toBe('el-12');
    });
  });
});
