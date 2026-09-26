import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, PDFDict, PDFName, PDFStream, decodePDFRawStream } from '@cantoo/pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { detectFormFields, pageGeometry, toPageTextRuns } from '../detectFormFields.ts';
import { pageCropBox } from '../pageInk.js';

/**
 * A tick centres in its box (SNG-09, measured 2026-09-26).
 *
 * Form 101 prints every checkbox as a Zapf Dingbats glyph: 61 are ❏ (code
 * 0x6f) and 6 are ❑ (0x71). The region used to be the glyph's advance by the
 * font-wide ascent/descent, which takes in the drop shadow and the space below
 * the square, so a centred tick sat ~0.6pt right and ~0.6pt low and poked past
 * the square's right edge. The region now has to be the square a person sees:
 * the glyph's inner (hole) contour.
 *
 * Every expected number here comes from outside the detector. The square is read
 * from the font embedded in the file, and the glyph origins and sizes come from
 * pdf.js's text layer, not from pdfObjects.js's own content-stream walk. So the
 * guard does not restate the table it checks.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const FORM = path.join(repoRoot, 'src/tools/sign/fields/corpus/scoring/forms/income-tax-101-2024.pdf');
const TOLERANCE_PT = 0.1;
const CODES = { o: 0x6f, q: 0x71 };

/** Glyph-space bounds of the innermost contour of `code`'s glyph, [x0, y0, x1, y1]. */
function innerSquare(font, code) {
  const contours = [];
  for (const command of font.glyphForCodePoint(code).path.commands) {
    if (command.command === 'moveTo') contours.push([]);
    for (let i = 0; i < command.args.length; i += 2) contours.at(-1)?.push([command.args[i], command.args[i + 1]]);
  }
  const boxes = contours.map((points) => {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  return boxes.reduce((a, b) => ((b[2] - b[0]) * (b[3] - b[1]) < (a[2] - a[0]) * (a[3] - a[1]) ? b : a));
}

function embeddedZapf(doc) {
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    if (!/ZapfDingbats/.test(object.get(PDFName.of('BaseFont'))?.asString?.() ?? '')) continue;
    const descriptor = doc.context.lookup(object.get(PDFName.of('FontDescriptor')));
    const file = doc.context.lookup(descriptor.get(PDFName.of('FontFile2')));
    if (file instanceof PDFStream) return fontkit.create(Buffer.from(decodePDFRawStream(file).decode()));
  }
  throw new Error('form 101 no longer embeds a ZapfDingbats TrueType font');
}

const expected = [];
const regions = [];

beforeAll(async () => {
  const bytes = fs.readFileSync(FORM);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = embeddedZapf(doc);
  const squares = Object.fromEntries(Object.entries(CODES).map(([char, code]) => [char, innerSquare(font, code)]));

  const require = createRequire(import.meta.url);
  const pdfjsDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    standardFontDataUrl: `${path.join(pdfjsDir, 'standard_fonts')}${path.sep}`,
    cMapUrl: `${path.join(pdfjsDir, 'cmaps')}${path.sep}`,
    wasmUrl: `${path.join(pdfjsDir, 'wasm')}${path.sep}`,
    cMapPacked: true,
    useSystemFonts: false,
  });
  const textRuns = [];
  try {
    const pdf = await loading.promise;
    for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
      const page = await pdf.getPage(pageIndex + 1);
      const { items, styles } = await page.getTextContent();
      // The operator list is what loads each font's object, and with it the
      // PDF font name that tells the Zapf runs apart from the rest.
      await page.getOperatorList();
      textRuns.push(toPageTextRuns(items, pageGeometry(doc.getPage(pageIndex))));
      const zapfFonts = new Set(Object.keys(styles).filter((name) => page.commonObjs.has(name)
        && /ZapfDingbats/.test(page.commonObjs.get(name).name ?? '')));
      for (const item of items) {
        if (!zapfFonts.has(item.fontName) || !squares[item.str]) continue;
        const [a, b, c, d, e, f] = item.transform;
        const [x0, y0, x1, y1] = squares[item.str].map((v) => v / 1000);
        expect(b === 0 && c === 0, 'form 101 draws its boxes unrotated').toBe(true);
        expected.push({ pageIndex, x0: e + a * x0, y0: f + d * y0, x1: e + a * x1, y1: f + d * y1 });
      }
    }
  } finally {
    await loading.destroy();
  }

  const found = await detectFormFields(doc, { textRuns });
  for (const region of found.checkboxes) {
    const page = doc.getPage(region.pageIndex);
    expect(page.getRotation().angle).toBe(0);
    const crop = pageCropBox(page);
    const left = crop.x + (region.left / 100) * crop.width;
    const top = crop.y + crop.height - (region.top / 100) * crop.height;
    regions.push({
      pageIndex: region.pageIndex,
      x0: left,
      x1: left + (region.width / 100) * crop.width,
      y1: top,
      y0: top - (region.height / 100) * crop.height,
    });
  }
}, 30000);

describe('form 101: a Zapf Dingbats checkbox region is the square a person sees', () => {
  it('finds every printed box, and only those', () => {
    expect(expected).toHaveLength(67);
    expect(regions).toHaveLength(67);
  });

  it(`puts each region on its glyph's inner square, within ${TOLERANCE_PT}pt on every edge`, () => {
    expect(expected.length).toBeGreaterThan(0);
    const off = [];
    for (const square of expected) {
      const cx = (square.x0 + square.x1) / 2;
      const cy = (square.y0 + square.y1) / 2;
      const nearest = regions
        .filter((region) => region.pageIndex === square.pageIndex)
        .reduce((best, region) => {
          const distance = Math.hypot((region.x0 + region.x1) / 2 - cx, (region.y0 + region.y1) / 2 - cy);
          return distance < best.distance ? { region, distance } : best;
        }, { region: null, distance: Infinity }).region;
      const worst = Math.max(...['x0', 'y0', 'x1', 'y1'].map((edge) => Math.abs(nearest[edge] - square[edge])));
      if (worst > TOLERANCE_PT) off.push({ square, nearest, worst: worst.toFixed(2) });
    }
    expect(off).toEqual([]);
  });
});
