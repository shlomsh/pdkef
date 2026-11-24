import { act } from 'preact/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './lib/scanPipeline.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { until } from '../../test/support/until.js';
import { photoOfPage, useScanSuite } from '../../test/support/scanTool.browser.tsx';

vi.mock('./lib/scanPipeline.ts', { spy: true });
const realPipeline = await vi.importActual<typeof import('./lib/scanPipeline.ts')>('./lib/scanPipeline.ts');

answerNetwork();

describe('PdfScanTool', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const { s, mount, pick, pagesMade, pdfReady, openPage, tableTiles, byText, inViewer, onTable, one, step } = suite;

  describe('Remove and Undo (SCAN-51)', () => {
    const labelled = (label: string) => s.container.querySelector(`button[aria-label="${label}"]`);
    const clickLabel = (label: string) => act(async () => { labelled(label).click(); });
    const chip = () => s.container.querySelector('[data-undo-chip]');
    const undo = () => act(async () => { chip().querySelector('button').click(); });
    const thumbs = () => tableTiles().map((tile) => tile.querySelector('img')?.getAttribute('src'));
    const tileLabels = () => tableTiles().map((el) => el.getAttribute('aria-label'));
    const headingText = () => s.container.querySelector('[data-page-heading]')?.textContent;
    const keyOn = (el: EventTarget, key: string, more = {}) => act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key, ...more, bubbles: true, cancelable: true })); });
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    let revoked: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { revoked = vi.spyOn(URL, 'revokeObjectURL'); });
    const three = async () => {
      mount();
      await pick([await photoOfPage('a.jpg', 0.06), await photoOfPage('b.jpg', 0.04), await photoOfPage('c.jpg', 0.02)]);
      await pagesMade(3);
      await pdfReady();
    };
    const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    it('Undo on the grid puts the page back in its place with its result, without making it again', async () => {
      await three();
      const before = tileLabels();
      const pictures = thumbs();
      pictures.forEach((src) => expect(src).toMatch(/^blob:/));
      const runs = step('processPage').mock.calls.length;
      fakeTimers();
      await clickLabel('Remove page 2');
      expect(tableTiles()).toHaveLength(2);
      expect(chip().textContent).toContain('Page 2 removed');
      await undo();
      await advance(100);
      expect(tileLabels()).toEqual(before);
      expect(thumbs()).toEqual(pictures);
      expect(step('processPage').mock.calls.length).toBe(runs);
      expect(chip()).toBeNull();
      await advance(6000);
      expect(thumbs()).toEqual(pictures);
      for (const src of pictures) expect(revoked).not.toHaveBeenCalledWith(src);
    });

    it('Remove keeps the page\'s result URLs until the five seconds pass, then lets them go', async () => {
      await three();
      const gone = thumbs()[1];
      fakeTimers();
      await clickLabel('Remove page 2');
      await advance(4900);
      expect(revoked).not.toHaveBeenCalledWith(gone);
      expect(chip()).not.toBeNull();
      await advance(200);
      expect(revoked).toHaveBeenCalledWith(gone);
      expect(chip()).toBeNull();
      await expect(fetch(gone as string)).rejects.toThrow();
    });

    it('Undo in the viewer shows the restored page, and the chip lives inside the dialog', async () => {
      await three();
      await openPage(2);
      await act(async () => { inViewer('Remove')[0].click(); });
      await until(() => chip() !== null);
      expect(s.container.querySelector('[data-page-viewer] [data-undo-chip]')).not.toBeNull();
      expect(s.container.querySelectorAll('[data-undo-chip]')).toHaveLength(1);
      expect(headingText()).toBe('Page 2 of 2');
      await undo();
      await until(() => headingText() === 'Page 2 of 3');
      expect(onTable()).toBe(false);
      expect(tableTiles()).toHaveLength(3);
    });

    it('removing the open page stays in the viewer on the next page, and on the previous from the last', async () => {
      await three();
      await openPage(1);
      await act(async () => { inViewer('Remove')[0].click(); });
      await until(() => headingText() === 'Page 1 of 2');
      expect(onTable()).toBe(false);
      await act(async () => { one('button[aria-label="Next page"]').click(); });
      await until(() => headingText() === 'Page 2 of 2');
      await act(async () => { inViewer('Remove')[0].click(); });
      await until(() => headingText() === 'Page 1 of 1');
      expect(onTable()).toBe(false);
    });

    it('a second Remove lets the first page go for good and holds the new one', async () => {
      await three();
      const first = thumbs()[0];
      await clickLabel('Remove page 1');
      await clickLabel('Remove page 1');
      expect(revoked).toHaveBeenCalledWith(first);
      expect(tableTiles()).toHaveLength(1);
      expect(chip().textContent).toContain('Page 1 removed');
      await undo();
      await until(() => tableTiles().length === 2);
    });

    it('Clear all during the window lets the held page go with the rest', async () => {
      await three();
      const held = thumbs()[1];
      fakeTimers();
      await clickLabel('Remove page 2');
      await act(async () => { byText('Clear all files')[0].click(); });
      await act(async () => { byText('Clear all')[0].click(); });
      expect(revoked).toHaveBeenCalledWith(held);
      expect(chip()).toBeNull();
      expect(s.container.querySelector('[data-empty-state]')).not.toBeNull();
      const revokedByNow = revoked.mock.calls.length;
      await advance(6000);
      expect(revoked.mock.calls.length).toBe(revokedByNow);
      expect(chip()).toBeNull();
      expect(s.container.querySelector('[data-empty-state]')).not.toBeNull();
    });

    it('the only page goes at once, with no Undo', async () => {
      mount();
      await pick([await photoOfPage('a.jpg')]);
      await pagesMade(1);
      await pdfReady();
      await clickLabel('Remove page 1');
      await until(() => s.container.querySelector('[data-empty-state]') !== null);
      expect(chip()).toBeNull();
    });

    it('Delete on a tile removes that page, and R turns it', async () => {
      await three();
      await keyOn(tableTiles()[1], 'r', { code: 'KeyR' });
      await until(() => s.container.querySelector('[role="status"]')?.textContent === 'Page 2 turned a quarter to the right.');
      await keyOn(tableTiles()[1], 'Delete');
      expect(tableTiles()).toHaveLength(2);
      expect(chip().textContent).toContain('Page 2 removed');
      await keyOn(tableTiles()[0], 'Backspace');
      expect(tableTiles()).toHaveLength(1);
    });

    it('the R key is the same key on a Hebrew keyboard', async () => {
      await three();
      await keyOn(tableTiles()[0], 'ר', { code: 'KeyR' });
      await until(() => s.container.querySelector('[role="status"]')?.textContent === 'Page 1 turned a quarter to the right.');
    });

    it('holding Delete takes one page, so Undo can always bring it back', async () => {
      await three();
      await keyOn(tableTiles()[0], 'Delete');
      await keyOn(tableTiles()[0], 'Delete', { repeat: true });
      expect(tableTiles()).toHaveLength(2);
    });

    it('a click on a cluster button never opens the page', async () => {
      await three();
      await clickLabel('Rotate page 1');
      expect(onTable()).toBe(true);
      await clickLabel('Remove page 1');
      expect(onTable()).toBe(true);
      await clickLabel('Open page 1');
      expect(onTable()).toBe(false);
    });
  });
});
