// @ts-nocheck - island test with loose DOM helpers
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './lib/scanPipeline.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { until } from '../../test/support/until.js';
import { photoOfPage, useScanSuite } from '../../test/support/scanTool.browser.tsx';

vi.mock('./lib/scanPipeline.ts', { spy: true });
const realPipeline = await vi.importActual('./lib/scanPipeline.ts');

answerNetwork();

describe('PdfScanTool', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const { s, mount, pick, pagesMade, openPage, adjustCorners, useCorners, tableTiles, viewer, heading, byText, inViewer, radioGroup } = suite;

  describe('the page in the viewer on desktop (SCAN-51)', () => {
    const key = (name, target = document.body) => act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })); });
    const step = (label) => viewer().querySelector(`button[aria-label="${label}"]`);
    const openThree = async () => {
      mount();
      await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg'), await photoOfPage('c.jpg')]);
      await pagesMade(3);
      await openPage(2);
    };

    it('a tile opens the page in the dialog over the grid, with no card and no strip', async () => {
      await openThree();
      expect(heading()).toBe('Page 2 of 3');
      expect(viewer().tagName).toBe('DIALOG');
      expect(tableTiles()).toHaveLength(3);
      expect(s.container.querySelector('[data-fills-stage]')).toBeNull();
      expect(byText('Full screen')).toHaveLength(0);
      expect(s.container.querySelector('[data-selected]')).toBeNull();
    });

    it('the arrow keys browse the pages and stop at the ends', async () => {
      await openThree();
      await key('ArrowRight');
      expect(heading()).toBe('Page 3 of 3');
      await key('ArrowRight');
      expect(heading()).toBe('Page 3 of 3');
      await key('ArrowLeft');
      await key('ArrowLeft');
      await key('ArrowLeft');
      expect(heading()).toBe('Page 1 of 3');
      expect(viewer()).not.toBeNull();
    });

    it('the arrows leave the browser\'s own shortcuts, a key already handled and the Look row alone', async () => {
      await openThree();
      await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })); });
      await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', metaKey: true, bubbles: true })); });
      expect(heading()).toBe('Page 2 of 3');
      const handled = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      handled.preventDefault();
      await act(async () => { document.dispatchEvent(handled); });
      expect(heading()).toBe('Page 2 of 3');
      await act(async () => { byText('Look')[0].click(); });
      await key('ArrowRight', radioGroup('Look').querySelector('button'));
      expect(heading()).toBe('Page 2 of 3');
    });

    it('Previous and Next browse the pages and rest at the ends', async () => {
      await openThree();
      await act(async () => { step('Next page').click(); });
      expect(heading()).toBe('Page 3 of 3');
      expect(step('Next page').getAttribute('aria-disabled')).toBe('true');
      expect(step('Next page').disabled).toBe(false);
      await act(async () => { step('Previous page').click(); });
      await act(async () => { step('Previous page').click(); });
      expect(heading()).toBe('Page 1 of 3');
      expect(step('Previous page').getAttribute('aria-disabled')).toBe('true');
    });

    it('Esc returns to the grid on the page last shown, with its tile focused', async () => {
      await openThree();
      await key('ArrowRight');
      await userEvent.keyboard('{Escape}');
      await until(() => viewer() === null);
      await until(() => document.activeElement?.closest('[data-id]') != null);
      expect(tableTiles()).toHaveLength(3);
      expect(document.activeElement?.closest('[data-id]')).toBe(s.container.querySelectorAll('[data-id]')[2]);
    });

    it('corners keep Rotate, and approving them returns to the page', async () => {
      await openThree();
      await adjustCorners();
      await until(() => inViewer('Rotate').length === 1);
      expect(inViewer('Rotate')).toHaveLength(1);
      await useCorners();
      await until(() => viewer()?.querySelector('[data-paper]') != null && s.container.querySelector('[data-flatten]') === null);
      expect(heading()).toBe('Page 2 of 3');
      expect(viewer().querySelector('[data-paper]')).not.toBeNull();
    });
  });
});
