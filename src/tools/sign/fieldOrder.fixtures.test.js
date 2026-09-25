import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { detectPageRegions } from './fields/formGrid.js';
import { orderTypableFields } from '../../editor/text/fieldOrder.ts';

/**
 * MOBI-06's acceptance on the committed form 101 fixture: every comb run on
 * the page is reachable by repeated Next from the first, in the order a
 * person reading the (Hebrew, right-to-left) form would fill them. The
 * detector's own output is the input here, not hand-typed regions, so this
 * fails if either the detector or the ordering drifts.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(here, './fields/__fixtures__/income-tax-101-page1-geometry.pdf');

// Same reason this file is .js and not .ts as formGrid.fixtures.test.js:
// astro check has no node types for fs/path, and the test needs both.
const overlapVertically = (a, b) => (
  a.region.top < b.region.top + b.region.height && b.region.top < a.region.top + a.region.height
);
const rightEdge = (field) => field.region.left + field.region.width;

describe('income tax form 101, page 1, in fill order', () => {
  let order;
  beforeAll(async () => {
    const document = await PDFDocument.load(fs.readFileSync(FIXTURE), { ignoreEncryption: true, updateMetadata: false });
    const { combs } = detectPageRegions(document.getPage(0), 0);
    order = orderTypableFields(combs, [], () => 'rtl');
  });

  it('reaches all 38 comb runs, each exactly once', () => {
    expect(order).toHaveLength(38);
    expect(new Set(order.map((field) => field.region)).size).toBe(38);
  });

  it('never goes back up the page: each row starts at or below the one before', () => {
    for (let i = 1; i < order.length; i += 1) {
      const previous = order[i - 1];
      const current = order[i];
      if (!overlapVertically(previous, current)) {
        expect(current.region.top).toBeGreaterThan(previous.region.top);
      }
    }
  });

  it('walks each row right to left, the way the Hebrew form reads', () => {
    let rowsWithTwoOrMore = 0;
    for (let i = 1; i < order.length; i += 1) {
      const previous = order[i - 1];
      const current = order[i];
      if (overlapVertically(previous, current)) {
        rowsWithTwoOrMore += 1;
        expect(rightEdge(current)).toBeLessThan(rightEdge(previous));
      }
    }
    // The children's table alone has thirteen rows of two runs, so this
    // assertion has real work to do; a page read as 38 single-field rows
    // would pass the loop vacuously.
    expect(rowsWithTwoOrMore).toBeGreaterThanOrEqual(13);
  });

  it('reads the identity row right to left: identity number, then the two dates beside it', () => {
    // The row at top ~27.3%: MOBI-04's IDENTITY_RUN (9 cells, right), a
    // date (8 cells, middle) and another date (8 cells, left). Two runs sit
    // above it on the form (the tax year and the employer's file number), so
    // the identity number is field 3, not field 1.
    const identityRow = order.filter((field) => Math.abs(field.region.top - 27.28) < 0.1);
    expect(identityRow.map((field) => [Math.round(field.region.left), field.kind === 'comb' ? field.region.cells : 0]))
      .toEqual([[74, 9], [20, 8], [5, 8]]);
    expect(order.indexOf(identityRow[0])).toBe(2);
  });
});
