import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { setScreen } from '../../test/support/screen.ts';
import { HeldFile } from '../../test/support/heldFile.ts';
import { waitUntil as waitUntilWithClock } from '../../test/support/waitUntil.ts';
import { convertPdfToImages } from './lib/toImage.js';
import { BUILT, pdf, pdfBytes, SLOW_QUIET, useToImageTool, waitUntil } from './components/toImageTool.test-helper.tsx';

vi.mock('./lib/toImage.js', { spy: true });

const LONG_QUIET = { baseMs: 60000, stepMs: 0, maxMs: 60000, burstWindowMs: 1 };

describe('PdfToImageTool builds', () => {
  const s = useToImageTool();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const conversions = () => vi.mocked(convertPdfToImages).mock.calls.length;
  const lastOptions = () => vi.mocked(convertPdfToImages).mock.lastCall?.[1];
  const state = () => s.downloadElement().dataset.state;
  const linkNames = () => s.saveLinks().map((a) => a.getAttribute('download'));
  const linkLabels = () => s.saveLinks().map((a) => a.getAttribute('aria-label'));

  describe('timing', () => {
    it('does not convert before the quiet wait, shows no size until the images land, then converts once', async () => {
      // SLOW_QUIET waits 400 ms. The clock only moves when the test moves it; the waits below run
      // timers already due (pdf-lib's 0 ms yields) without moving it.
      const file = await pdf('report.pdf', 5);
      const before = conversions();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        s.mount({ quietPolicy: SLOW_QUIET });
        await s.pickOnly(file);
        await waitUntilWithClock(() => {
          expect(s.cells().length).toBeGreaterThan(0);
          expect(s.findDownload()).not.toBeNull();
        }, { timeout: 4000, dueFakeTimers: true });
        await act(async () => { await vi.advanceTimersByTimeAsync(399); });
        expect(conversions() - before).toBe(0);
        expect(state()).toBe('ready');
        expect(s.downloadElement().getAttribute('aria-busy')).toBeNull();
        expect(s.downloadText()).not.toMatch(/KB|MB|bytes/);
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        await waitUntilWithClock(() => expect(s.downloadText()).toMatch(BUILT), { timeout: 4000, dueFakeTimers: true });
        expect(s.downloadText()).toMatch(/\d(\.\d)? KB/);
        expect(conversions() - before).toBe(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(conversions() - before).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('the done strip names the pattern for several images and the real name for one', async () => {
    setScreen({ width: 390, height: 844 }); // a phone, where a tap on Download opens the done strip
      const stripName = () => s.container.querySelector('section[aria-label] p')?.textContent ?? '';
      await s.open(3);
      await s.saveAll(s.quietDownload(), 3);
      await waitUntil(() => expect(stripName()).toContain('report-page-N.png'));
      await s.click(s.radio('One tall image'));
      await waitUntil(() => {
        expect(lastOptions()?.layout).toBe('concatenated');
        expect(s.downloadText()).toMatch(BUILT);
      });
      await s.click(s.quietDownload());
      await waitUntil(() => expect(stripName()).toContain('report.png'));
      expect(stripName()).not.toContain('page-N');
    });
  });

  describe('the Download tap', () => {
    it('a tap that beats the build shows preparing and delivers when it lands', async () => {
      const file = new HeldFile(await pdfBytes(1), 'report.pdf', { held: false });
      s.mount({ quietPolicy: LONG_QUIET });
      await s.pick(file);
      await waitUntil(() => expect(s.findDownload()).not.toBeNull());
      file.hold();
      await s.press();
      await file.started;
      expect(conversions()).toBe(1);
      expect(state()).toBe('ready');
      await s.click(s.downloadElement());
      expect(state()).toBe('preparing');
      expect(await s.events('tool_operation_started')).toBe(1);
      file.release();
      await waitUntil(() => expect(state()).toBe('saved'));
      expect(await s.events('tool_result_ready')).toBe(1);
    });

    it('reports no start for the background build, only for the Download tap', async () => {
      await s.open();
      expect(await s.events('tool_operation_started')).toBe(0);
      await s.saveAll(s.downloadElement(), 5);
      await waitUntil(() => expect(state()).toBe('saved'));
      expect(await s.events('tool_result_ready')).toBe(1);
      expect(await s.events('tool_operation_started')).toBe(1);
    });

    it('a build that fails says so on the Download element, counts as a failed operation, and a tap tries again', async () => {
      const file = await pdf('report.pdf', 2);
      s.mount({ quietPolicy: LONG_QUIET });
      await s.pick(file);
      await waitUntil(() => expect(s.findDownload()).not.toBeNull());
      file.arrayBuffer = () => Promise.reject(new Error('boom'));
      await s.press();
      await waitUntil(() => expect(state()).toBe('error'));
      expect(s.downloadText()).toContain('Could not make the images. Tap to try again.');
      await s.harness.flush();
      expect(s.harness.reports()).toMatchObject([{ area: 'pdf_tool_run', step: 'convert', type: 'Error' }]);
      expect(await s.events('tool_operation_failed')).toBe(1);
      Reflect.deleteProperty(file, 'arrayBuffer');
      await s.press();
      await waitUntil(() => {
        expect(state()).toBe('ready');
        expect(s.downloadText()).toMatch(/KB/);
      });
    });
  });

  describe('saving one page', () => {
    it('appears on each included page only once the images are built, and is not there for a skipped page', async () => {
      s.mount({ quietPolicy: LONG_QUIET });
      await s.pick(await pdf('report.pdf', 3));
      expect(s.saveLinks()).toHaveLength(0);
      await s.press();
      await waitUntil(() => expect(s.saveLinks()).toHaveLength(3));
      expect(linkLabels()).toEqual(['Download page 1', 'Download page 2', 'Download page 3']);
      expect(linkNames()).toEqual(['report-page-1.png', 'report-page-2.png', 'report-page-3.png']);
      expect(s.saveLinks()[1].getAttribute('href')).toMatch(/^blob:/);
      await s.click(s.skipButton(2));
      expect(s.saveLinks()).toHaveLength(0);
      await s.press();
      await waitUntil(() => expect(s.saveLinks()).toHaveLength(2));
      expect(linkNames()).toEqual(['report-page-1.png', 'report-page-3.png']);
      expect(linkLabels()).toEqual(['Download page 1', 'Download page 2']);
    });

    it('counts as a Download tap without turning the Download element to Saved', async () => {
      await s.open(3);
      await s.click(s.saveLinks()[0]);
      expect(recentActions()).toContain('download');
      expect(await s.events('tool_operation_started')).toBe(1);
      expect(state()).toBe('ready');
    });

    it('is not offered for the tall image or for a single image', async () => {
      await s.open(3);
      await s.click(s.radio('One tall image'));
      await waitUntil(() => {
        expect(lastOptions()?.layout).toBe('concatenated');
        expect(s.downloadText()).toMatch(/KB/);
      });
      expect(s.saveLinks()).toHaveLength(0);
      s.unmount();
      await s.open(1);
      expect(s.saveLinks()).toHaveLength(0);
    });
  });

  it('drops a conversion whose file was replaced while it ran', async () => {
    const first = new HeldFile(await pdfBytes(2), 'first.pdf', { held: false });
    s.mount({ quietPolicy: LONG_QUIET });
    await s.pick(first);
    await waitUntil(() => expect(s.findDownload()).not.toBeNull());
    const index = conversions();
    first.hold();
    await s.press();
    await first.started;
    await s.replaceWith(await pdf('second.pdf', 2));
    await s.press();
    await waitUntil(() => expect(s.downloadText()).toMatch(/KB/));
    first.release();
    await act(async () => {
      await vi.mocked(convertPdfToImages).mock.results[index].value.catch(() => undefined);
    });
    await s.drain();
    expect(s.headingText()).toContain('second-page-N.png');
    expect(s.saveLinks()).toHaveLength(2);
    expect(s.saveLinks().every((a) => a.getAttribute('download')?.startsWith('second-page'))).toBe(true);
    expect(state()).toBe('ready');
  });

  it('revokes every image URL on unmount', async () => {
    const create = vi.spyOn(URL, 'createObjectURL');
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    await s.open(2);
    const created = create.mock.results.map((result) => String(result.value));
    expect(created.length).toBeGreaterThanOrEqual(2);
    revoke.mockClear();
    s.unmount();
    const revoked = revoke.mock.calls.map(([url]) => url);
    for (const url of created) expect(revoked).toContain(url);
  });
});
