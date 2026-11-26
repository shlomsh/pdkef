import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './lib/scanPipeline.ts';
import { rotateQuad } from '#lib/pageEnhance/quad.ts';
import type { Quad } from '#lib/pageEnhance/quad.ts';
import { loadDraft, readRecentFiles } from '#lib/drafts/draftStore.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { until } from '../../test/support/until.js';
import { photoOfPage, useScanSuite } from '../../test/support/scanTool.browser.tsx';

vi.mock('./lib/scanPipeline.ts', { spy: true });
const realPipeline = await vi.importActual<typeof import('./lib/scanPipeline.ts')>('./lib/scanPipeline.ts');

answerNetwork();

describe('PdfScanTool result and remembered scan', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const {
    s, mount, unmount, pick, pagesMade, pdfReady, openPage, adjustCorners, useCorners, done, press, pressInViewer, handles, all,
    tableTiles, byText, checked, choose, radioGroup, currentPaper, holdNext, step, idle,
  } = suite;
  const exact = () => currentPaper().hasAttribute('data-exact');
  const caption = () => {
    const found = currentPaper().closest('figure')?.querySelector('figcaption');
    if (!found) throw new Error('Expected a caption');
    return found.textContent;
  };

  it('shows the page as it will download, corners again on request, the settings with their defaults, and the exact page again for a setting already built', async () => {
    mount();
    await pick([await photoOfPage('a.jpg')]);
    await pagesMade(1);
    await openPage(1);
    expect(handles()).toHaveLength(0);
    await until(exact);
    expect(s.container.textContent).toContain('Exactly as it will download');
    await adjustCorners();
    await until(() => handles().length === 4);
    await useCorners();
    expect(handles()).toHaveLength(0);
    await pdfReady();
    await until(exact);
    await press('Look');
    expect(checked('Look')).toBe('Document');
    expect(checked('Page size')).toBe('Fit');
    expect(checked('Size limit')).toBe('Full');
    const held = holdNext('buildScanPdf');
    act(() => { radioGroup('Page size').querySelectorAll('[role="radio"]')[1].click(); });
    expect(exact()).toBe(false);
    expect(currentPaper().hasAttribute('data-updating')).toBe(true);
    expect(caption()).toContain('Updating');
    await held.started;
    expect(exact()).toBe(false);
    expect(currentPaper().hasAttribute('data-updating')).toBe(true);
    expect(caption()).toContain('Updating');
    expect(currentPaper().querySelector('img')).not.toBeNull();
    await held.runToEnd();
    await until(exact);
    await until(() => checked('Page size') === 'A4');
    expect(checked('Page size')).toBe('A4');
    const builds = step('buildScanPdf').mock.calls.length;
    await choose('Page size', 'Fit');
    await until(() => checked('Page size') === 'Fit' && exact());
    await act(async () => { await idle(); });
    expect(step('buildScanPdf').mock.calls.length).toBe(builds);
    expect(exact()).toBe(true);
  });

  it('offers Sign, Highlight, Redact, Compress in the rail once the PDF is ready, on the table and beside a page, and says so when a size limit cannot be met', async () => {
    mount();
    await pick([await photoOfPage('a.jpg')]);
    await pagesMade(1);
    await pdfReady();
    const pinned = () => all('[data-rail-pinned] button').map((b) => b.textContent.trim());
    expect(pinned()).toEqual(expect.arrayContaining(['Sign', 'Highlight', 'Redact', 'Compress']));
    await openPage(1);
    expect(pinned()).toEqual(expect.arrayContaining(['Sign', 'Highlight', 'Redact', 'Compress']));
    // Forced: the real build runs and only metTarget is overridden; the search's floor (0.3 scale, 0.3 quality) keeps a page of pure noise near 0.26 bytes a pixel, so 1 MB takes over ten full-size noise pages, past the 8 s page wait.
    step('buildScanPdf').mockImplementationOnce(async (...args: Parameters<typeof realPipeline.buildScanPdf>) => {
      const built = await realPipeline.buildScanPdf(...args);
      return { ...built, metTarget: false };
    });
    await choose('Size limit', '1 MB');
    await until(() => s.container.textContent.includes('as small as these pages go'));
    expect(s.container.textContent).toContain('as small as these pages go');
  });

  it('gives each page its own look, and a new photo the look last chosen', async () => {
    mount();
    await pick([await photoOfPage('a.jpg')]);
    await pagesMade(1);
    await openPage(1);
    await press('Look');
    await choose('Look', 'Original');
    await until(() => checked('Look') === 'Original');
    await done();
    await pick([await photoOfPage('b.jpg')]);
    await pagesMade(2);
    await openPage(2);
    await press('Look');
    expect(checked('Look')).toBe('Original');
    await done();
    await openPage(1);
    await press('Look');
    expect(checked('Look')).toBe('Original');
    await done();
    await pdfReady();
    expect(step('processPage').mock.calls.some(([, , look]) => look === 'original')).toBe(true);
  });

  describe('remembering the scan (SCAN-18)', () => {
    const draftLine = () => s.container.querySelector('[data-draft-status]')?.textContent;
    const saved = () => until(() => draftLine() === 'Draft saved');
    const processedWith = (name: string) => step('processPage').mock.calls.findLast(([file]) => (file as File).name === name);

    it('saves the pages and settings, and brings them back on the next visit, each with its look, turns and corners', async () => {
      mount();
      await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg', 0.04)]);
      await pagesMade(2);
      await openPage(2);
      await act(async () => { byText('Look')[0].click(); });
      await choose('Look', 'Original');
      await choose('Page size', 'A4');
      await done();
      await openPage(1);
      await pressInViewer('Right');
      await adjustCorners();
      await until(() => handles().length === 4);
      await act(async () => { handles()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
      await useCorners();
      await done();
      await pdfReady();
      await saved();
      const record = await loadDraft('scan-to-pdf');
      if (!record?.files) throw new Error('Expected saved files');
      const pages = (record as typeof record & { pages: Array<Record<string, unknown>> }).pages;
      expect(record.files.map((f) => f.fileName)).toEqual(['a.jpg', 'b.jpg']);
      expect(pages.map((p) => p.filter)).toEqual(['document', 'original']);
      expect(pages[0].turns).toBe(1);
      expect(record.pageSize).toBe('a4');
      await until(() => readRecentFiles()[0]?.preview !== undefined);
      expect(readRecentFiles()[0].preview).toMatch(/^data:image\//);

      document.documentElement.setAttribute('data-draft-hint', '1');
      step('processPage').mockClear();
      unmount();
      mount();
      await pagesMade(2);
      await pdfReady();
      expect(tableTiles()).toHaveLength(2);
      expect(document.documentElement.hasAttribute('data-draft-hint')).toBe(false);
      expect(draftLine()).toBeUndefined();
      expect(processedWith('a.jpg')?.[1]).toEqual(rotateQuad(pages[0].quad as Quad, 1));
      expect(processedWith('a.jpg')?.[2]).toBe('document');
      expect(processedWith('b.jpg')?.[2]).toBe('original');
      await openPage(2);
      await act(async () => { byText('Look')[0].click(); });
      expect(checked('Look')).toBe('Original');
      expect(checked('Page size')).toBe('A4');
      await act(async () => { await drainPromises(); });
    });
  });
});
