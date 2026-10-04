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
 * A Wingdings checkbox region is the square a person sees (FORM-31, measured 2026-10-04).
 *
 * BL/211 prints its checkboxes as Wingdings 0x71 and the Thai SSO form as Wingdings 2 0x2A, through a
 * two-byte font. The region used to be the glyph's advance by the font-wide ascent/descent: 12.6 x 9.7pt
 * for a 10.1pt square, 2.2pt too high and 1pt too far left, so every match scored an IoU of 0.50 to 0.51
 * against a 0.5 bar and a tick centred on it missed the printed box. It has to be the glyph's own square.
 *
 * As in zapfCheckboxSquare.test.js, every expected number comes from outside the detector: the square is
 * read from the font embedded in the file, and the glyph origins and sizes from pdf.js's text layer, not
 * from pdfObjects.js's own content-stream walk.
 *
 * Which contour is "the square" differs by glyph, and is the reason for the `contour` column. Wingdings
 * 0x71 is a box with a drop shadow, so its outer contour takes in the shadow and the hole is the box (as
 * with Zapf's). Wingdings 2 0x2A is a ring, so its hole is only the paper inside the stroke and the outer
 * edge is the box.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const FORMS_DIR = path.join(repoRoot, 'src/tools/sign/fields/corpus/scoring/forms');
const TOLERANCE_PT = 0.1;

const CASES = [
  { form: 'btl-bl211-2015.pdf', family: /^Wingdings$/, text: '', contour: 'hole', pages: 8 },
  { form: 'thai-sso-1-10.pdf', family: /^Wingdings 2$/, text: '', contour: 'outer', pages: 1 },
];

const areaOf = ([x0, y0, x1, y1]) => (x1 - x0) * (y1 - y0);

/** Glyph-space bounds of every contour of glyph `gid`, [x0, y0, x1, y1]. */
function contourBoxes(font, gid) {
  const contours = [];
  for (const command of font.getGlyph(gid).path.commands) {
    if (command.command === 'moveTo') contours.push([]);
    for (let i = 0; i < command.args.length; i += 2) contours.at(-1)?.push([command.args[i], command.args[i + 1]]);
  }
  return contours.map((points) => {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
}

/** The embedded Wingdings subset whose BaseFont matches, with the glyph its ToUnicode gives `text`. */
function embeddedWingdings(doc, family, text) {
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict) || object.get(PDFName.of('Subtype'))?.toString() !== '/Type0') continue;
    const baseFont = (object.get(PDFName.of('BaseFont'))?.decodeText?.() ?? object.get(PDFName.of('BaseFont'))?.toString() ?? '')
      .replace(/^\//, '').replace(/#20/g, ' ').replace(/^[A-Z]{6}\+/, '');
    if (!family.test(baseFont)) continue;
    const toUnicode = doc.context.lookup(object.get(PDFName.of('ToUnicode')));
    const cmap = Buffer.from(decodePDFRawStream(toUnicode).decode()).toString('latin1');
    const gid = [...cmap.matchAll(/<([0-9a-f]{4})>\s*<([0-9a-f]{4})>/gi)]
      .find((match) => String.fromCharCode(parseInt(match[2], 16)) === text)?.[1];
    const [descendantRef] = doc.context.lookup(object.get(PDFName.of('DescendantFonts'))).asArray();
    const descriptor = doc.context.lookup(doc.context.lookup(descendantRef).get(PDFName.of('FontDescriptor')));
    const file = doc.context.lookup(descriptor.get(PDFName.of('FontFile2')));
    if (gid !== undefined && file instanceof PDFStream) {
      return { font: fontkit.create(Buffer.from(decodePDFRawStream(file).decode())), gid: parseInt(gid, 16) };
    }
  }
  throw new Error('the form no longer embeds the Wingdings subset this guard reads');
}

async function measure({ form, family, text, contour }) {
  const bytes = fs.readFileSync(path.join(FORMS_DIR, form));
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const { font, gid } = embeddedWingdings(doc, family, text);
  const boxes = contourBoxes(font, gid);
  const square = (contour === 'hole'
    ? boxes.reduce((a, b) => (areaOf(b) < areaOf(a) ? b : a))
    : boxes.reduce((a, b) => (areaOf(b) > areaOf(a) ? b : a))).map((v) => (v * 1000) / font.unitsPerEm / 1000);

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
  const expected = [];
  const textRuns = [];
  try {
    const pdf = await loading.promise;
    for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
      const page = await pdf.getPage(pageIndex + 1);
      const { items, styles } = await page.getTextContent();
      // The operator list loads each font's object, and with it the PDF font name.
      await page.getOperatorList();
      textRuns.push(toPageTextRuns(items, pageGeometry(doc.getPage(pageIndex))));
      const fonts = new Set(Object.keys(styles).filter((name) => page.commonObjs.has(name)
        && family.test((page.commonObjs.get(name).name ?? '').replace(/^[A-Z]{6}\+/, ''))));
      for (const item of items) {
        if (!fonts.has(item.fontName) || item.str !== text) continue;
        const [a, b, c, d, e, f] = item.transform;
        expect(b === 0 && c === 0, `${form} draws its boxes unrotated`).toBe(true);
        const [x0, y0, x1, y1] = square;
        expected.push({ pageIndex, x0: e + a * x0, y0: f + d * y0, x1: e + a * x1, y1: f + d * y1 });
      }
    }
  } finally {
    await loading.destroy();
  }

  const found = await detectFormFields(doc, { textRuns });
  const regions = found.checkboxes.map((region) => {
    const page = doc.getPage(region.pageIndex);
    const crop = pageCropBox(page);
    const left = crop.x + (region.left / 100) * crop.width;
    const top = crop.y + crop.height - (region.top / 100) * crop.height;
    return {
      pageIndex: region.pageIndex,
      x0: left,
      x1: left + (region.width / 100) * crop.width,
      y1: top,
      y0: top - (region.height / 100) * crop.height,
    };
  });
  return { expected, regions };
}

describe.each(CASES)('$form: a Wingdings checkbox region is the square a person sees', (spec) => {
  let result;
  beforeAll(async () => {
    result = await measure(spec);
  }, 30000);

  it('reads every printed box from the text layer', () => {
    expect(result.expected.length).toBeGreaterThanOrEqual(spec.pages);
  });

  it(`puts a region on each glyph's square, within ${TOLERANCE_PT}pt on every edge`, () => {
    const off = [];
    for (const square of result.expected) {
      const cx = (square.x0 + square.x1) / 2;
      const cy = (square.y0 + square.y1) / 2;
      const nearest = result.regions
        .filter((region) => region.pageIndex === square.pageIndex)
        .reduce((best, region) => {
          const distance = Math.hypot((region.x0 + region.x1) / 2 - cx, (region.y0 + region.y1) / 2 - cy);
          return distance < best.distance ? { region, distance } : best;
        }, { region: null, distance: Infinity }).region;
      const worst = nearest
        ? Math.max(...['x0', 'y0', 'x1', 'y1'].map((edge) => Math.abs(nearest[edge] - square[edge])))
        : Infinity;
      if (worst > TOLERANCE_PT) off.push({ square, nearest, worst: worst.toFixed(2) });
    }
    expect(off).toEqual([]);
  });
});
