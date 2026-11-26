import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './lib/scanPipeline.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { brokenPhoto } from '../../test/support/scanPhotos.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';
import { photoOfPage, useScanSuite } from '../../test/support/scanTool.browser.tsx';

vi.mock('./lib/scanPipeline.ts', { spy: true });
const realPipeline = await vi.importActual<typeof import('./lib/scanPipeline.ts')>('./lib/scanPipeline.ts');

answerNetwork();

describe('PdfScanTool viewer', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const {
    s, mount, pick, pagesMade, pdfReady, openPage, adjustCorners, done, press, byText, pressInViewer, all, one,
    tableTiles, onTable, heading, click, viewer, inViewer, step, idle,
  } = suite;
  const text = () => s.container.textContent;
  const key = (name: string, target: EventTarget = document.body) => act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })); });
  const stepButton = (label: string) => viewer().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const chip = () => s.container.querySelector('[data-undo-chip]');
  const undo = () => act(async () => { chip().querySelector('button').click(); });
  const headingText = () => s.container.querySelector('[data-page-heading]')?.textContent;
  const removeOpen = () => act(async () => { inViewer('Remove')[0].click(); });

  it('a tile opens the page in the dialog over the grid, the arrows and Previous and Next browse and stop at the ends, Esc returns to the page last shown with its tile focused, and focus moves to the page heading on open', async () => {
    mount();
    await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg'), await photoOfPage('c.jpg')]);
    await pagesMade(3);
    await openPage(2);
    expect(heading()).toBe('Page 2 of 3');
    expect(viewer().tagName).toBe('DIALOG');
    expect(tableTiles()).toHaveLength(3);
    expect(s.container.querySelector('[data-fills-stage]')).toBeNull();
    expect(byText('Full screen')).toHaveLength(0);
    expect(s.container.querySelector('[data-selected]')).toBeNull();
    await key('ArrowRight');
    expect(heading()).toBe('Page 3 of 3');
    await key('ArrowRight');
    expect(heading()).toBe('Page 3 of 3');
    await key('ArrowLeft');
    await key('ArrowLeft');
    await key('ArrowLeft');
    expect(heading()).toBe('Page 1 of 3');
    expect(viewer()).not.toBeNull();
    await act(async () => { stepButton('Next page').click(); });
    expect(heading()).toBe('Page 2 of 3');
    await act(async () => { stepButton('Next page').click(); });
    expect(heading()).toBe('Page 3 of 3');
    expect(stepButton('Next page').getAttribute('aria-disabled')).toBe('true');
    expect(stepButton('Next page').disabled).toBe(false);
    await act(async () => { stepButton('Previous page').click(); });
    await act(async () => { stepButton('Previous page').click(); });
    expect(heading()).toBe('Page 1 of 3');
    expect(stepButton('Previous page').getAttribute('aria-disabled')).toBe('true');
    await key('ArrowRight');
    await key('ArrowRight');
    expect(heading()).toBe('Page 3 of 3');
    await userEvent.keyboard('{Escape}');
    await until(() => viewer() === null);
    await until(() => document.activeElement?.closest('[data-id]') != null);
    expect(tableTiles()).toHaveLength(3);
    expect(document.activeElement?.closest('[data-id]')).toBe(s.container.querySelectorAll('[data-id]')[2]);
    tableTiles()[0].focus();
    await openPage(1);
    await until(() => document.activeElement?.hasAttribute('data-page-heading'));
    expect(document.activeElement?.hasAttribute('data-page-heading')).toBe(true);
    await done();
    await until(onTable);
    await click(one('button[aria-label="Open page 1"]'), 'Open page 1');
    await until(() => !onTable());
    expect(onTable()).toBe(false);
  });

  it('Undo in the viewer shows the restored page with the chip inside the dialog; removing the open page stays in the viewer on its neighbour, down to the empty state', async () => {
    mount();
    await pick([await photoOfPage('a.jpg', 0.06), await photoOfPage('b.jpg', 0.04), await photoOfPage('c.jpg', 0.02)]);
    await pagesMade(3);
    await pdfReady();
    await openPage(2);
    await removeOpen();
    await until(() => chip() !== null);
    expect(s.container.querySelector('[data-page-viewer] [data-undo-chip]')).not.toBeNull();
    expect(s.container.querySelectorAll('[data-undo-chip]')).toHaveLength(1);
    expect(headingText()).toBe('Page 2 of 2');
    await undo();
    await until(() => headingText() === 'Page 2 of 3');
    expect(onTable()).toBe(false);
    expect(tableTiles()).toHaveLength(3);
    await act(async () => { stepButton('Previous page').click(); });
    await until(() => headingText() === 'Page 1 of 3');
    await removeOpen();
    await until(() => headingText() === 'Page 1 of 2');
    expect(onTable()).toBe(false);
    await act(async () => { one('button[aria-label="Next page"]').click(); });
    await until(() => headingText() === 'Page 2 of 2');
    await removeOpen();
    await until(() => headingText() === 'Page 1 of 1');
    expect(onTable()).toBe(false);
    await until(() => tableTiles().length === 1);
    expect(onTable()).toBe(false);
    expect(heading()).toContain('Page 1 of 1');
    await pressInViewer('Remove');
    await until(() => tableTiles().length === 0);
    expect(s.container.querySelector('[data-empty-state]')).not.toBeNull();
  });

  it('returns to the table with Done and with the back control, and retakes a page in place, the new photo taking its position', async () => {
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
    await openPage(1);
    await act(async () => { setInputFiles(one('[data-page-actions] input[type="file"]'), [await photoOfPage('again.jpg')]); });
    await pagesMade(2);
    expect(heading()).toContain('Page 1 of 2');
    expect(step('inspectPhoto').mock.calls.some(([file]) => file.name === 'again.jpg')).toBe(true);
    await done();
    await pagesMade(2);
    expect(tableTiles()).toHaveLength(2);
  });

  it('names a page that could not be read, and holds Download back until it is removed', async () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: processing fails, however often it is tried, for b.jpg whose photo was read well
    step('processPage').mockImplementation(async (...args: Parameters<typeof realPipeline.processPage>) => {
      if ((args[0] as File).name === 'b.jpg') throw new Error('decode failed');
      return realPipeline.processPage(...args);
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

  it('says a photo could not be read, instead of finding edges forever, and a tap on the held-back Download goes to that photo', async () => {
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
    await pick([await photoOfPage('a.jpg'), brokenPhoto('b.jpg')]);
    await until(() => all('a, button').some((el) => el.textContent.includes('Remove page 2 to make the PDF')));
    await click(all('a, button').find((el) => el.textContent.includes('Remove page 2 to make the PDF')), 'the held-back Download');
    await until(() => !onTable());
    expect(heading()).toContain('Page 2 of 2');
    expect(text()).toContain('Could not read this photo');
  });
});
