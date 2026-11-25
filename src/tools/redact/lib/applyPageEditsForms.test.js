// @vitest-environment jsdom
//
// RED-29, end to end: Delete marks on text drawn inside a Form XObject
// (the iTextSharp shape) carry `formPath` from listDeletableObjects through
// the delete elements useDeleteTool.markObjects builds, into applyPageEdits.
// Runs the real deleteObjectsFromPdf and (for the cover path) redactPdf.
import path from 'path';
import { describe, expect, it, beforeAll } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pointAtLegacyWorker } from '../../../test/support/realPdfjs.ts';
import { applyPageEdits } from './applyPageEdits.js';
import { listDeletableObjects } from './deleteObjects.js';
import { withPreviews } from './objectPreviews.test-helper.js';
import { buildFormXObjectPdf } from '#editor/adapters/pdf/formXObjectFixture.test-helper.js';

beforeAll(() => { pointAtLegacyWorker(pdfjs); });

async function pageText(blob, pageIndex) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  const text = content.items.map((item) => item.str).join(' ');
  return text;
}

/** The delete element useDeleteTool.markObjects builds for one object. */
function deleteElementFor(object, n) {
  return {
    id: `d${n}`,
    pageIndex: object.pageIndex,
    type: 'delete',
    sourceObjectId: object.id,
    kind: object.kind,
    preview: object.preview,
    left: object.rect.left,
    top: object.rect.top,
    width: object.rect.width,
    height: object.rect.height,
    start: object.start,
    end: object.end,
    formPath: object.formPath ?? [],
  };
}

async function setup() {
  const bytes = await buildFormXObjectPdf({ pages: 3 });
  const file = new File([bytes], 'forms.pdf', { type: 'application/pdf' });
  const objects = await withPreviews(bytes, await listDeletableObjects(file));
  const secret = objects.find((o) => o.pageIndex === 0 && o.kind === 'text' && /Secret 0/.test(o.preview ?? ''));
  return { file, secret, elements: secret ? [deleteElementFor(secret, 1)] : [] };
}

describe('applyPageEdits with Form XObject deletions', () => {
  it('reports the run inside the form with a non-empty formPath', async () => {
    const { secret } = await setup();
    expect(secret).toBeDefined();
    expect(secret.formPath.length).toBeGreaterThan(0);
  });

  it('removes "Secret 0" from page 0, keeps "Keep 0", leaves the other pages alone', async () => {
    const { file, elements } = await setup();
    const { blob } = await applyPageEdits(file, elements);
    const page0 = await pageText(blob, 0);
    expect(page0).not.toContain('Secret 0');
    expect(page0).toContain('Keep 0');
    expect(await pageText(blob, 1)).toContain('Secret 1');
    expect(await pageText(blob, 1)).toContain('Keep 1');
    expect(await pageText(blob, 2)).toContain('Secret 2');
    expect(await pageText(blob, 2)).toContain('Keep 2');
  });

  it('still lacks "Secret 0" with a blackout box on page 2 (the cover path)', async () => {
    const { file, elements } = await setup();
    const box = { id: 'b1', pageIndex: 2, type: 'blackout', left: 10, top: 10, width: 20, height: 20, color: '#000000' };
    const { blob } = await applyPageEdits(file, [...elements, box]);
    const page0 = await pageText(blob, 0);
    expect(page0).not.toContain('Secret 0');
    expect(page0).toContain('Keep 0');
  });
});
