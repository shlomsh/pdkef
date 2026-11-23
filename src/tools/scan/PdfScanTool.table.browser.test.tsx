// @ts-nocheck - island test with loose DOM helpers
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import Sortable from 'sortablejs';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './lib/scanPipeline.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';
import { brokenPhoto, photoOfPage, useScanSuite } from '../../test/support/scanTool.browser.tsx';

vi.mock('./lib/scanPipeline.ts', { spy: true });
const realPipeline = await vi.importActual('./lib/scanPipeline.ts');

answerNetwork();

const heic = (name) => new File(['x'], name, { type: 'image/heic' });

describe('PdfScanTool', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const {
    s, mount, pick, pagesMade, pdfReady, openPage, adjustCorners, openCorners, done, press, byText, inViewer, pressInViewer, all, one,
    tableTiles, onTable, handles, heading, checked, choose, radioGroup, currentPaper, startScanning, click, step, idle,
  } = suite;
  const tileLabels = () => tableTiles().map((el) => el.getAttribute('aria-label'));
  const text = () => s.container.textContent;

  it('offers Start scanning on the empty state as an equal of Choose photos, wired to the rear camera', () => {
    mount();
    const take = startScanning();
    const choose = all('label').find((l) => l.textContent.trim() === 'Choose photos');
    expect(take.className.split(' ')).toContain(choose.className);
    const input = one('input[capture]');
    expect(input.getAttribute('capture')).toBe('environment');
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png');
  });

  it('adds one page per JPEG and names the skipped HEIC', async () => {
    mount();
    await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg'), heic('c.heic')]);
    await pagesMade(2);
    expect(tileLabels().map((l) => l.split(',')[0])).toEqual(['Page 1 of 2', 'Page 2 of 2']);
    expect(text()).toContain('c.heic was skipped');
    expect(onTable()).toBe(true);
    expect(handles()).toHaveLength(0);
  });

  it('removes pages and returns to the empty state after the last', async () => {
    mount();
    await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
    await pagesMade(2);
    await openPage(1);
    await pressInViewer('Remove');
    await until(() => tableTiles().length === 1);
    expect(onTable()).toBe(false);
    expect(heading()).toContain('Page 1 of 1');
    await pressInViewer('Remove');
    await until(() => tableTiles().length === 0);
    expect(s.container.querySelector('[data-empty-state]')).not.toBeNull();
  });

  it('shows Look, Page size and Size limit with their defaults, and A4 can be chosen', async () => {
    mount();
    await pick([await photoOfPage('a.jpg')]);
    await pagesMade(1);
    await openPage(1);
    await press('Look');
    expect(checked('Look')).toBe('Document');
    expect(checked('Page size')).toBe('Fit');
    expect(checked('Size limit')).toBe('Full');
    await choose('Page size', 'A4');
    await until(() => checked('Page size') === 'A4');
    expect(checked('Page size')).toBe('A4');
  });

  it('offers Sign, Highlight, Redact, Compress in the rail once the PDF is ready, on the table and beside a page', async () => {
    mount();
    await pick([await photoOfPage('a.jpg')]);
    await pagesMade(1);
    await pdfReady();
    const pinned = () => all('[data-rail-pinned] button').map((b) => b.textContent.trim());
    expect(pinned()).toEqual(expect.arrayContaining(['Sign', 'Highlight', 'Redact', 'Compress']));
    await openPage(1);
    expect(pinned()).toEqual(expect.arrayContaining(['Sign', 'Highlight', 'Redact', 'Compress']));
  });

  it('says so when a size limit cannot be met', async () => {
    mount();
    await pick([await photoOfPage('a.jpg')]);
    await pagesMade(1);
    await pdfReady();
    // forced: a size limit that cannot be met, the real build runs and only metTarget is overridden
    step('buildScanPdf').mockImplementationOnce(async (...args) => {
      const built = await realPipeline.buildScanPdf(...args);
      return { ...built, metTarget: false };
    });
    await choose('Size limit', '1 MB');
    await until(() => text().includes('as small as these pages go'));
    expect(text()).toContain('as small as these pages go');
  });

  it('names a page that could not be read, and holds Download back until it is removed', async () => {
    // forced: processing fails, however often it is tried, for b.jpg whose photo was read well
    step('processPage').mockImplementation(async (file, ...rest) => {
      if (file.name === 'b.jpg') throw new Error('decode failed');
      return realPipeline.processPage(file, ...rest);
    });
    mount();
    await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
    await until(() => text().includes('Page 2 could not be read.'));
    await act(async () => { await idle(); });
    expect(step('buildScanPdf')).not.toHaveBeenCalled();
    expect(text()).toContain('Remove page 2 to make the PDF');
    expect(text()).not.toMatch(/Preparing \d+ pages/);
    await openPage(2);
    await pressInViewer('Remove');
    await pdfReady();
    expect(text()).not.toContain('could not be read');
    expect(step('buildScanPdf')).toHaveBeenCalled();
  });

  it('returns to the table with Done and with the back control, keeping the pages', async () => {
    mount();
    await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
    await pagesMade(2);
    await openPage(2);
    expect(onTable()).toBe(false);
    expect(heading()).toContain('Page 2 of 2');
    await done();
    await until(onTable);
    expect(tableTiles()).toHaveLength(2);
    await openPage(1);
    await click(one('[data-back]'), 'the back control');
    await until(onTable);
    expect(tableTiles()).toHaveLength(2);
  });

  it('retakes a page in place: the new photo takes its position, and the table comes back with Done', async () => {
    mount();
    await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
    await pagesMade(2);
    await openPage(1);
    await act(async () => { setInputFiles(one('[data-page-actions] input[type="file"]'), [await photoOfPage('again.jpg')]); });
    await pagesMade(2);
    expect(heading()).toContain('Page 1 of 2');
    expect(step('inspectPhoto').mock.calls.some(([file]) => file.name === 'again.jpg')).toBe(true);
    await done();
    await pagesMade(2);
    expect(tableTiles()).toHaveLength(2);
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

  it('shows the exact page again when a setting goes back to one already built (a cached PDF)', async () => {
    mount();
    await pick([await photoOfPage('a.jpg')]);
    await pagesMade(1);
    await openPage(1);
    const exact = () => currentPaper().hasAttribute('data-exact');
    await until(exact);
    await choose('Page size', 'A4');
    expect(exact()).toBe(false);
    await until(() => checked('Page size') === 'A4' && exact());
    const builds = step('buildScanPdf').mock.calls.length;
    await choose('Page size', 'Fit');
    await until(() => checked('Page size') === 'Fit' && exact());
    await act(async () => { await idle(); });
    expect(step('buildScanPdf').mock.calls.length).toBe(builds);
    expect(exact()).toBe(true);
  });

  it('says a photo could not be read, instead of finding edges forever, and offers no corners to use', async () => {
    mount();
    await pick([brokenPhoto('a.jpg')]);
    await until(() => text().includes('Could not read this photo'));
    await openPage(1);
    await adjustCorners();
    expect(text()).not.toContain('Finding the page edges');
    expect(text()).toContain('Could not read this photo');
    expect(byText('Use these edges')).toHaveLength(0);
    expect(byText('Auto-detect')).toHaveLength(0);
    await press('Remove this photo');
    await until(() => s.container.querySelector('[data-empty-state]') !== null);
    expect(s.container.querySelector('[data-empty-state]')).not.toBeNull();
  });

  it('moves focus to the page heading when a page opens, so a keyboard is not dropped on the body', async () => {
    mount();
    await pick([await photoOfPage('a.jpg')]);
    await pagesMade(1);
    tableTiles()[0].focus();
    await openPage(1);
    await until(() => document.activeElement?.hasAttribute('data-page-heading'));
    expect(document.activeElement?.hasAttribute('data-page-heading')).toBe(true);
  });

  it('goes back to the default name when the file name is emptied', async () => {
    mount();
    await pick([await photoOfPage('a.jpg')]);
    await pagesMade(1);
    const nameEl = () => s.container.querySelector('h2 [contenteditable]');
    const rename = async (value) => {
      await act(async () => { nameEl().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
      await act(async () => { nameEl().textContent = value; });
      await act(async () => { nameEl().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    };
    await rename('Contract');
    expect(nameEl().textContent).toBe('Contract');
    await rename('');
    expect(nameEl().textContent).toMatch(/^Scan \d{1,2} [A-Z][a-z]{2} \d{4}$/);
  });

  it('takes a tap on the held-back Download to the photo that could not be read', async () => {
    mount();
    await pick([await photoOfPage('a.jpg'), brokenPhoto('b.jpg')]);
    await until(() => all('a, button').some((el) => el.textContent.includes('Remove page 2 to make the PDF')));
    await click(all('a, button').find((el) => el.textContent.includes('Remove page 2 to make the PDF')), 'the held-back Download');
    await until(() => !onTable());
    expect(heading()).toContain('Page 2 of 2');
    expect(text()).toContain('Could not read this photo');
  });

  it('brings a newly added photo into view, also when photos were already there: on desktop the page top, where the card is the first screen', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const spacer = document.createElement('div');
    spacer.style.height = '3000px';
    try {
      mount();
      await pick([await photoOfPage('a.jpg')]);
      await pagesMade(1);
      document.body.append(spacer);
      window.scrollTo(0, 600);
      await until(() => window.scrollY > 0);
      scrollTo.mockClear();
      await pick([await photoOfPage('b.jpg')]);
      await pagesMade(2);
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
      await until(() => window.scrollY === 0);
    } finally {
      spacer.remove();
    }
  });

  it('binds hold and drag to the table on desktop, and keeps it there under a page', async () => {
    const create = vi.spyOn(Sortable, 'create');
    mount();
    await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
    await pagesMade(2);
    expect(create.mock.calls.at(-1)?.[0]).toBe(tableTiles()[0].closest('ul'));
    await openPage(1);
    expect(create.mock.calls.at(-1)?.[0]).toBe(tableTiles()[0].closest('ul'));
  });
});
