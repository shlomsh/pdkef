import { describe, expect, it } from 'vitest';
import { PDFDocument } from '@cantoo/pdf-lib';
import { buildSplit, rotationsOf } from './splitOutput.ts';
import { planForFile, rotateEntry, withIncludedPages } from '../../lib/pagePlan.ts';

async function pdf(pages: number, name = 'doc.pdf') {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([100 + i, 200]);
  return new File([(await doc.save()) as BlobPart], name, { type: 'application/pdf' });
}

describe('rotationsOf', () => {
  it('maps the kept pages with a rotation to their 1-based number', () => {
    let plan = planForFile(0, 4);
    plan = rotateEntry(plan, '0:1', 90);
    plan = rotateEntry(plan, '0:3', -90);
    plan = withIncludedPages(plan, [2, 3]);
    expect(rotationsOf(plan)).toEqual({ 2: 90 });
  });

  it('is empty when nothing is rotated', () => {
    expect(rotationsOf(planForFile(0, 3))).toEqual({});
  });
});

describe('buildSplit', () => {
  it('combined builds one blob with the kept pages, rotated', async () => {
    const plan = rotateEntry(withIncludedPages(planForFile(0, 3), [1, 3]), '0:2', 90);
    const built = await buildSplit(await pdf(3), plan, 'combined');
    expect('blob' in built).toBe(true);
    expect(built.pageCount).toBe(2);
    const out = await PDFDocument.load(await (built as { blob: Blob }).blob.arrayBuffer());
    expect(out.getPageCount()).toBe(2);
    expect(out.getPage(1).getRotation().angle).toBe(90);
  });

  it('separate builds a part per kept page named after its source page', async () => {
    const plan = withIncludedPages(planForFile(0, 4), [2, 4]);
    const built = await buildSplit(await pdf(4, 'report.pdf'), plan, 'separate');
    expect('parts' in built).toBe(true);
    expect(built.pageCount).toBe(2);
    expect((built as { parts: { filename: string }[] }).parts.map((p) => p.filename)).toEqual(['report-page-2.pdf', 'report-page-4.pdf']);
  });
});
