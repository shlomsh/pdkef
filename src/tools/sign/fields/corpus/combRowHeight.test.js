import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { detectFormFields, pageGeometry, toPageTextRuns } from '../detectFormFields.ts';
import { baselineDropEm, placeCombOnRegion, placeTextOnCell } from '../../../../editor/text/combPlacement.ts';

/**
 * An open comb's field is its printed row (FORM-27, Shlomi 2026-09-26), on the
 * real form 101 with its real text layer.
 *
 * The children table rules one 21.9pt row per child; the identity number and
 * the birth date are 7.2pt teeth on the row's floor. The detector has to hand
 * both combs the row as `writable`, so the fill frame covers the printed cell
 * and the digits line up with the name typed in the same row - not sit on the
 * rule, 6pt below it (the bug FORM-26 brought back). The tax year has no cell:
 * its `writable` is the title "שנת המס" printed beside it, and the year sits on
 * the title's baseline.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const FORM = path.join(repoRoot, 'src/tools/sign/fields/corpus/scoring/forms/income-tax-101-2024.pdf');
const W = 595.275;
const H = 841.89;
const TOLERANCE_PT = 0.1;
const FONT = 'Arimo';
const SIZE = 10;

const ptX = (percent) => (percent / 100) * W;
const ptY = (percent) => (percent / 100) * H;
const near = (percentX, pointsX) => Math.abs(ptX(percentX) - pointsX) < 1;

let found;
let runs;

beforeAll(async () => {
  const bytes = fs.readFileSync(FORM);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
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
  try {
    const pdf = await loading.promise;
    const { items } = await (await pdf.getPage(1)).getTextContent();
    runs = toPageTextRuns(items, pageGeometry(doc.getPage(0)));
  } finally {
    await loading.destroy();
  }
  const textRuns = Array.from({ length: doc.getPageCount() }, (_, index) => (index === 0 ? runs : []));
  const all = await detectFormFields(doc, { textRuns });
  const onPage = (region) => region.pageIndex === 0;
  found = { combs: all.combs.filter(onPage), cells: all.cells.filter(onPage) };
});

const options = { carriedFontSize: SIZE, fontFamily: FONT, pageWidthPoints: W, pageHeightPoints: H };

describe('form 101, children table', () => {
  // The table's rows, read off its rules: 13 rows of 21.9pt from y 380.3.
  const ROW_TOP = 380.3;
  const ROW_HEIGHT = 21.9;

  it.each([['identity number', 346.9, 9], ['birth date', 255.6, 8]])('every %s comb takes its row as writable, and its digits share the name\'s line', (_, left, cells) => {
    const combs = found.combs
      .filter((c) => near(c.left, left) && c.cells === cells && ptY(c.top) > ROW_TOP)
      .sort((a, b) => a.top - b.top);
    expect(combs).toHaveLength(13);
    let aligned = 0;
    combs.forEach((comb, row) => {
      expect(ptY(comb.height)).toBeLessThan(8);
      expect(comb.writable, `row ${row + 1} has its cell as writable`).toBeDefined();
      expect(Math.abs(ptY(comb.writable.top) - (ROW_TOP + row * ROW_HEIGHT))).toBeLessThan(0.2);
      expect(Math.abs(ptY(comb.writable.height) - ROW_HEIGHT)).toBeLessThan(0.2);
      // The name cell of the same row, where the detector finds one (10 of 13 today).
      const name = found.cells.find((cell) => near(cell.left, 448.8)
        && Math.abs(ptY(cell.top) - ptY(comb.writable.top)) < TOLERANCE_PT);
      if (!name) return;
      aligned += 1;
      const digits = placeCombOnRegion(comb, options);
      const text = placeTextOnCell(name, options);
      expect(Math.abs(ptY(digits.top) - ptY(text.top)), `row ${row + 1}: digits on the name's line`).toBeLessThan(TOLERANCE_PT);
    });
    expect(aligned).toBeGreaterThanOrEqual(10);
  });
});

describe('form 101, tax year', () => {
  it('takes the title beside it as writable, and the year sits on the title\'s baseline', () => {
    const comb = found.combs.find((c) => c.cells === 4 && near(c.left, 220.4));
    const title = runs.find((run) => run.str.replace(/\s/g, '') === 'שנתהמס');
    expect(comb).toBeDefined();
    expect(title).toBeDefined();
    expect(comb.writable).toBeDefined();
    expect(Math.abs(ptY(comb.writable.top) - ptY(title.top))).toBeLessThan(TOLERANCE_PT);
    expect(Math.abs(ptY(comb.writable.top + comb.writable.height) - ptY(comb.top + comb.height))).toBeLessThan(TOLERANCE_PT);
    const placed = placeCombOnRegion(comb, options);
    const baseline = ptY(placed.top) + SIZE * baselineDropEm(FONT);
    // pdf.js puts a run's box bottom on its baseline.
    expect(Math.abs(baseline - ptY(title.top + title.height))).toBeLessThan(1);
  });
});
