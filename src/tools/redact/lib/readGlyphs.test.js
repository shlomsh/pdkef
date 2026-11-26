import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFJS_WASM_URL } from '#lib/pdf/pdfjsWasm.js';
import { buildPdf, openOriginal } from '../../../test/support/redactCheckPdfs.test-helper.ts';
import { reportError } from '#lib/telemetry/errorReport.ts';
import { readGlyphs } from './readGlyphs.js';

vi.mock('#lib/telemetry/errorReport.ts', { spy: true });

/** A page of a real file whose document was destroyed after the page was fetched: pdf.js throws its own TypeError from getOperatorList. */
async function destroyedPage() {
  const { doc, close } = await openOriginal(await buildPdf([{ lines: ['Hello world'] }]), PDFJS_WASM_URL);
  const page = await doc.getPage(1);
  await close();
  return page;
}

describe('readGlyphs on a page of a destroyed document', () => {
  beforeEach(() => {
    vi.mocked(reportError).mockClear();
    vi.spyOn(console, 'error');
  });
  afterEach(() => vi.restoreAllMocks());

  it('reports nothing and reads no glyphs for the destroyed document (getOperatorList throws)', async () => {
    const page = await destroyedPage();
    expect(() => page.getOperatorList()).toThrow(TypeError);

    expect(await readGlyphs(pdfjs, page, undefined, () => true)).toBeNull();
    expect(reportError).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('still reports the same failure when the caller has not moved on', async () => {
    const page = await destroyedPage();

    expect(await readGlyphs(pdfjs, page, undefined, () => false)).toBeNull();
    expect(reportError).toHaveBeenCalledWith('redact', expect.any(TypeError), 'read_glyphs');
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
