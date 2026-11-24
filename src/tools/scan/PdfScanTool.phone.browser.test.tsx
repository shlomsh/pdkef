import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import Sortable from 'sortablejs';
import PdfScanTool from './PdfScanTool.tsx';
import { loadViewfinder } from './lib/camera/loadCamera.ts';
import * as pipeline from './lib/scanPipeline.ts';
import * as flatten from './lib/flattenAnimation.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { until } from '../../test/support/until.js';
import { photoOfPage, useScanSuite } from '../../test/support/scanTool.browser.tsx';

vi.mock('./lib/scanPipeline.ts', { spy: true });
vi.mock('./lib/flattenAnimation.ts', { spy: true });
const realPipeline = await vi.importActual<typeof import('./lib/scanPipeline.ts')>('./lib/scanPipeline.ts');

answerNetwork();

describe('PdfScanTool', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const { s, mount, pick, pagesMade, openPage, openCorners, useCorners, tableTiles, viewer, startScanning, click } = suite;

  describe('the live camera', () => {
    it('is a plain native input when the camera is not usable', async () => {
      mount();
      const input = startScanning().querySelector('input');
      let opened = 0;
      input.addEventListener('click', (e) => { opened += 1; e.preventDefault(); });
      await click(startScanning(), 'Start scanning');
      expect(opened).toBe(1);
      await act(async () => { await loadViewfinder(); await drainPromises(); });
      expect(s.container.querySelector('dialog[aria-label="Start scanning"]')).toBeNull();
    });
  });

  describe('on a phone (SCAN-13)', () => {
    it('renders the phone table and none of the workspace', async () => {
      mount();
      await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
      await pagesMade(2);
      expect(tableTiles()).toHaveLength(2);
      expect(s.container.querySelector('[data-clear-all]')).not.toBeNull();
      expect(s.container.querySelector('[data-rail]')).toBeNull();
    });

    it('a tile opens the viewer over the table, and Done closes it', async () => {
      mount();
      await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
      await pagesMade(2);
      await openPage(2);
      expect(viewer().querySelector('[data-page-heading]').textContent).toContain('Page 2 of 2');
      expect(tableTiles()).toHaveLength(2);
      expect(s.container.querySelector('[data-rail]')).toBeNull();
      await click(viewer().querySelector('[data-page-done]'), 'Done');
      await until(() => viewer() === null);
      expect(viewer()).toBeNull();
    });

    it('Use these edges lands the flatten on the current page, not its neighbour', async () => {
      mount();
      await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
      await pagesMade(2);
      await openCorners(2);
      vi.mocked(flatten.playFlatten).mockClear();
      await useCorners();
      await until(() => s.container.querySelector('[data-flatten]') !== null);
      const target = vi.mocked(flatten.playFlatten).mock.calls.at(-1)?.[2];
      expect(target).toBeInstanceOf(HTMLElement);
      expect(target.closest('[data-current]')).not.toBeNull();
      await until(() => s.container.querySelector('[data-flatten]') === null);
    });

    it('binds hold and drag to the grid on screen', async () => {
      const create = vi.spyOn(Sortable, 'create');
      mount();
      await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
      await pagesMade(2);
      expect(create.mock.calls.at(-1)?.[0]).toBe(tableTiles()[0].closest('ul'));
    });
  });
});
