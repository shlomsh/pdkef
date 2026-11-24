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

describe('PdfScanTool table', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const { s, mount, pick, pagesMade, pdfReady, tableTiles, byText, step } = suite;

  describe('Remove and Undo (SCAN-51)', () => {
    const labelled = (label: string) => s.container.querySelector(`button[aria-label="${label}"]`);
    const clickLabel = (label: string) => act(async () => { labelled(label).click(); });
    const chip = () => s.container.querySelector('[data-undo-chip]');
    const undo = () => act(async () => { chip().querySelector('button').click(); });
    const thumbs = () => tableTiles().map((tile) => tile.querySelector('img')?.getAttribute('src'));
    const tileLabels = () => tableTiles().map((el) => el.getAttribute('aria-label'));
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

    it('Undo on the grid puts the page back in its place with its result, without making it again; Remove keeps its result URLs until the five seconds pass, then lets them go', async () => {
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
      const gone = thumbs()[1];
      await clickLabel('Remove page 2');
      await advance(4900);
      expect(revoked).not.toHaveBeenCalledWith(gone);
      expect(chip()).not.toBeNull();
      await advance(200);
      expect(revoked).toHaveBeenCalledWith(gone);
      expect(chip()).toBeNull();
      await expect(fetch(gone as string)).rejects.toThrow();
    });

    it('a second Remove lets the first page go for good and holds the new one; Clear all during the window lets the held page go with the rest', async () => {
      await three();
      const first = thumbs()[0];
      await clickLabel('Remove page 1');
      await clickLabel('Remove page 1');
      expect(revoked).toHaveBeenCalledWith(first);
      expect(tableTiles()).toHaveLength(1);
      expect(chip().textContent).toContain('Page 1 removed');
      await undo();
      await until(() => tableTiles().length === 2);
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
});
