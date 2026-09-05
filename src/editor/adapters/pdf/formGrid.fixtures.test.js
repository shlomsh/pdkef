import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from '@cantoo/pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { detectPageRegions, findCombRuns } from './formGrid.js';
import { collectPageInk } from './pageInk.js';
import { getPageContentBytes } from './pdfObjects.js';
import { tokenize } from './contentStream.js';

/**
 * The detector's own walk with the graphics state removed, so the CTM's
 * contribution can be measured rather than asserted. This is what a regex or a
 * raw-operand reader sees, and it is the first thing MOBI-03 tried.
 */
function collectIgnoringTheMatrix(tokens) {
  const verticals = [];
  let operands = [];
  let current = null;
  for (const token of tokens) {
    if (token.type !== 'operator') {
      operands.push(token);
      continue;
    }
    const number = (index) => (operands[index]?.type === 'number' ? operands[index].value : 0);
    if (token.value === 'm') current = [number(0), number(1)];
    if (token.value === 'l') {
      const to = [number(0), number(1)];
      if (current && Math.abs(current[0] - to[0]) <= 0.6 && Math.abs(current[1] - to[1]) > 0.6) {
        verticals.push({
          x: (current[0] + to[0]) / 2,
          y0: Math.min(current[1], to[1]),
          y1: Math.max(current[1], to[1]),
        });
      }
      current = to;
    }
    operands = [];
  }
  return { verticals, horizontals: [], rects: [] };
}

/**
 * The two real Israeli government forms MOBI-03 was measured against, reduced
 * to their path geometry (see scripts/generate-form-grid-fixtures.mjs for why
 * they are reduced rather than committed whole). Detector output on these pages
 * is identical to output on the originals.
 *
 * ## Counts, and where they differ from the ticket
 *
 * MOBI-03 records targets taken with an independent probe. Two of them do not
 * survive a closer look, and both differences are *fewer false positives*
 * rather than weaker detection:
 *
 * **Health declaration, "127 checkbox-sized squares" -> 51.** 127 is only
 * reachable by counting `re` operators that clip text and never paint, with a
 * squareness tolerance loose enough to admit a 13.3x10.8 rectangle. 76 of the
 * 127 are exactly that. The 51 that remain are the ticket's own two dominant
 * sizes, 6.6pt and 7.6pt, and they are every checkbox on the page: 28 in the
 * examiner's table (14 rows of yes/no), 20 in the doctor's (10 rows), and 3 in
 * the declaration at the foot. Reporting 127 would mean offering a phone user
 * 76 targets that are not there.
 *
 * **Health declaration, "2 comb runs covering 42 cells" -> 4 runs, 33 cells.**
 * The page's phone strip is one ruled band carrying three separate numbers with
 * their labels sitting in cells of the same grid. Read as one run it is 33
 * cells that include the labels; read as fields it is three runs of 9, 7 and 8.
 * The lower cell count is the label and dash cells no longer being counted as
 * places to type.
 *
 * **Income tax 101, ">= 17 runs covering >= 184 cells" -> 37 runs, 321 cells.**
 * Comfortably past the target. The extra comes from the children's table, whose
 * thirteen rows each carry an identity comb and a date comb.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, '__fixtures__', name);

async function regionsOf(name) {
  const document = await PDFDocument.load(fs.readFileSync(fixture(name)), {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const page = document.getPage(0);
  return { page, ink: collectPageInk(page), ...detectPageRegions(page, 0) };
}

describe('income tax form 101, page 1', () => {
  let detected;
  beforeAll(async () => {
    detected = await regionsOf('income-tax-101-page1-geometry.pdf');
  });

  it('recovers well past the 17 comb runs and 184 cells MOBI-03 measured', () => {
    expect(detected.combs.length).toBe(37);
    expect(detected.combs.reduce((total, run) => total + run.cells, 0)).toBe(321);
  });

  it('reads the dominant pitch the ticket measured at 11.4pt', () => {
    const pitches = detected.combs.map((run) => run.pitchPoints);
    const dominant = pitches.filter((pitch) => Math.abs(pitch - 11.35) < 0.2);
    expect(dominant.length).toBeGreaterThanOrEqual(35);
  });

  it('finds nothing at all without the CTM walk, which is the whole difficulty', async () => {
    // The regression MOBI-03 asks for by name. This page issues 370 `cm`
    // operators, so raw operands share no baseline: the same detector fed ink
    // collected without composing the matrix goes from 37 runs to none.
    const document = await PDFDocument.load(
      fs.readFileSync(fixture('income-tax-101-page1-geometry.pdf')),
      { ignoreEncryption: true, updateMetadata: false },
    );
    const naive = collectIgnoringTheMatrix(tokenize(getPageContentBytes(document.getPage(0))));
    expect(naive.verticals.length).toBeGreaterThan(300);
    expect(findCombRuns(naive)).toEqual([]);
    expect(detected.combs.length).toBe(37);
  });

  describe('the identity-number field this exists for', () => {
    // "מספר זהות (9 ספרות)" in section ב, at 438.1..540.2pt on the y=605.3 rule.
    const identityField = (combs) => combs.find(
      (run) => Math.abs(run.left - 73.6) < 0.3 && Math.abs(run.top - 27.28) < 0.3,
    );

    it('is nine cells, not the eight its teeth alone would give', () => {
      // Eight teeth are drawn; the ninth cell is walled by the section box on
      // one side and the table rule on the other. An eight-cell comb is exactly
      // the off-by-one a person then fixes by dragging.
      expect(identityField(detected.combs)?.cells).toBe(9);
    });

    it('spans the printed field, in page percentages', () => {
      const field = identityField(detected.combs);
      // 438.1pt to 540.2pt across a 595.3pt page.
      expect(field.left).toBeCloseTo(73.6, 1);
      expect(field.left + field.width).toBeCloseTo(90.7, 1);
      expect(field.pitchPoints).toBeCloseTo(11.34, 1);
    });
  });

  it('finds no checkbox, because the form draws none in the checkbox band', () => {
    expect(detected.checkboxes).toEqual([]);
  });

  it('offers no region that is not a printed field', () => {
    // Audited against a render of the page with every detected region drawn
    // over it. All 37 runs land on a ruled field: 3 identity combs, 3 passport
    // combs, 4 dates, a deductions file number, a postal code, a start date,
    // and the children's table's 13 rows of identity and date.
    expect(detected.combs.length).toBe(37);
    const byCells = detected.combs.reduce((counts, run) => {
      counts[run.cells] = (counts[run.cells] || 0) + 1;
      return counts;
    }, {});
    expect(byCells).toEqual({ 7: 1, 8: 18, 9: 16, 13: 2 });
  });
});

describe('National Insurance health declaration, page 1', () => {
  let detected;
  beforeAll(async () => {
    detected = await regionsOf('health-declaration-page1-geometry.pdf');
  });

  it('finds combs drawn as filled rectangles, the other primitive', () => {
    // This page draws no line segments at all: a detector built for form 101's
    // stroked ticks finds literally nothing here.
    expect(detected.ink.verticals).toEqual([]);
    expect(detected.ink.rects.length).toBe(608);
    expect(detected.combs.length).toBe(4);
    expect(detected.combs.reduce((total, run) => total + run.cells, 0)).toBe(33);
  });

  it('finds the 51 checkboxes the page draws, and none of the 76 clip rectangles', () => {
    expect(detected.checkboxes.length).toBe(51);
  });

  it('reports checkboxes only at the two sizes the ticket measured', () => {
    const sizes = new Set(detected.checkboxes.map((box) => box.width.toFixed(2)));
    // 6.6pt and 7.6pt of a 595.3pt page.
    expect([...sizes].sort()).toEqual(['1.11', '1.27']);
  });

  it('offers no region that is not a printed field', () => {
    // Audited the same way: the identity comb in the header table, and the
    // three phone-number bodies in the contact strip.
    expect(detected.combs.map((run) => run.cells).sort((a, b) => a - b)).toEqual([7, 8, 9, 9]);
  });
});

describe('what the >= 5 cell rule leaves out, on purpose', () => {
  it('skips form 101 tax-year field, which is four cells', () => {
    // "שנת המס" at the head of the page is a four-cell comb at 16.2pt pitch.
    // MOBI-03 scopes a comb run at five cells or more, so it is a known miss
    // rather than a detector failure.
    const taxYearRow = async () => {
      const { combs } = await regionsOf('income-tax-101-page1-geometry.pdf');
      return combs.filter((run) => Math.abs(run.pitchPoints - 16.2) < 0.5);
    };
    return expect(taxYearRow()).resolves.toEqual([]);
  });

  it('skips the health declaration area codes, which are three cells each', async () => {
    const { combs } = await regionsOf('health-declaration-page1-geometry.pdf');
    expect(combs.every((run) => run.cells >= 5)).toBe(true);
  });
});
