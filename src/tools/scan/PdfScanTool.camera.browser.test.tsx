// @ts-nocheck - island test with loose DOM helpers
import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './lib/scanPipeline.ts';
import { useCamera } from './hooks/useCamera.ts';
import { takeArrival } from '#lib/handoff/fileArrival.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { setInputFiles } from '../../test/support/setInputFiles.js';
import { until } from '../../test/support/until.js';
import { photoOfPage, useScanSuite } from '../../test/support/scanTool.browser.tsx';

vi.mock('./lib/scanPipeline.ts', { spy: true });
vi.mock('./hooks/useCamera.ts', { spy: true });
const realPipeline = await vi.importActual('./lib/scanPipeline.ts');

answerNetwork();

describe('PdfScanTool', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const { s, step, mount, startScanning, tableTiles, click, pagesMade, pick, byText, openPage, viewer } = suite;
  const camera = () => s.container.querySelector('dialog[aria-label="Start scanning"]');
  const cameraButton = (label) => camera()?.querySelector(`button[aria-label="${label}"]`);
  const cameraLive = () => until(() => cameraButton('Take this page') != null);
  const doneButton = () => [...camera().querySelectorAll('button')].find((b) => b.textContent === 'Done');
  const stack = () => camera().querySelector('[data-stack]');
  const stackLabel = () => stack()?.getAttribute('aria-label');
  const autoOff = () => click(camera().querySelector('[role="switch"]'), 'Auto');
  const takePage = async () => {
    await cameraLive();
    await autoOff();
    await click(cameraButton('Take this page'), 'the shutter');
  };
  const cameraPaused = () => vi.mocked(useCamera).mock.calls.at(-1)[0].paused;
  const streamLive = () => {
    const video = camera().querySelector('video');
    return video.srcObject.getVideoTracks()[0].readyState === 'live' && !video.paused;
  };

  describe('the live camera', () => {
    it('opens the viewfinder from Start scanning, without opening the input', async () => {
      mount();
      const input = startScanning().querySelector('input');
      const opened = vi.fn();
      input.addEventListener('click', opened);
      await click(startScanning(), 'Start scanning');
      await cameraLive();
      expect(doneButton()).toBeDefined();
      expect(stack()).toBeNull();
      expect(opened).not.toHaveBeenCalled();
    });

    describe('SCAN-66: the arrival source', () => {
      const accepted = () => s.harness.usageEvents('tool_file_accepted').map((e) => e.properties.source);

      it('a first photo from the viewfinder is accepted as camera; a second sends no second acceptance and leaves no mark', async () => {
        mount();
        await click(startScanning(), 'Start scanning');
        await takePage();
        await until(() => stackLabel() === 'The last page taken, 1 so far');
        await s.harness.flush();
        expect(accepted()).toEqual(['camera']);
        await click(cameraButton('Take this page'), 'the shutter');
        await until(() => stackLabel() === 'The last page taken, 2 so far');
        await pagesMade(2);
        await s.harness.flush();
        expect(accepted()).toEqual(['camera']);
        expect(takeArrival()).toBeUndefined();
      });

      it('a photo through the Start scanning input is accepted as camera', async () => {
        mount();
        await act(async () => { setInputFiles(startScanning().querySelector('input'), [await photoOfPage('c.jpg')]); });
        await pagesMade(1);
        await s.harness.flush();
        expect(accepted()).toEqual(['camera']);
      });

      it('a photo picked through the shell picker still reads pick', async () => {
        mount();
        await pick([await photoOfPage('p.jpg')]);
        await pagesMade(1);
        await s.harness.flush();
        expect(accepted()).toEqual(['pick']);
      });
    });

    it('adds a page for each photo taken and closes on Done', async () => {
      mount();
      await click(startScanning(), 'Start scanning');
      await takePage();
      await until(() => stackLabel() === 'The last page taken, 1 so far');
      expect(stack().querySelector('span').textContent).toBe('1');
      await click(doneButton(), 'Done');
      expect(camera()).toBeNull();
      expect(tableTiles()).toHaveLength(1);
      await pagesMade(1);
    });

    it('adds the photos of the native input when the camera falls back', async () => {
      // forced: the device has no camera
      vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockRejectedValueOnce(new DOMException('no camera', 'NotFoundError'));
      mount();
      await click(startScanning(), 'Start scanning');
      await until(() => camera()?.querySelector('input[type="file"]') != null);
      await act(async () => { setInputFiles(camera().querySelector('input[type="file"]'), [await photoOfPage('f1.jpg'), await photoOfPage('f2.jpg')]); });
      await until(() => camera() === null);
      await pagesMade(2);
    });

    it('replaces the page in place from its page view, in mode one, and closes', async () => {
      mount();
      await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
      await pagesMade(2);
      await openPage(1);
      await click(byText('Retake')[0], 'Retake');
      await cameraLive();
      expect(doneButton()).toBeUndefined();
      expect(stack()).toBeNull();
      await autoOff();
      await click(cameraButton('Take this page'), 'the shutter');
      await until(() => camera() === null);
      await pagesMade(2);
      expect(s.container.querySelector('[data-page-heading]').textContent).toContain('Page 1 of 2');
      const names = step('inspectPhoto').mock.calls.map(([file]) => file.name);
      expect(names.filter((name) => !['a.jpg', 'b.jpg'].includes(name))).toHaveLength(1);
      expect(tableTiles()).toHaveLength(2);
    });
  });

  describe('on a phone (SCAN-13)', () => {
    it('the stack opens the viewer over the paused camera; Done goes back to the camera', async () => {
      mount();
      await click(startScanning(), 'Start scanning');
      await takePage();
      await until(() => stackLabel() === 'The last page taken, 1 so far');
      await click(stack(), 'the stack');
      await until(() => viewer() !== null);
      expect(camera().open).toBe(true);
      expect(streamLive()).toBe(true);
      expect(cameraPaused()).toBe(true);
      await click(viewer().querySelector('[data-page-done]'), 'Done');
      await until(() => viewer() === null);
      expect(doneButton()).toBeDefined();
      expect(stackLabel()).toBe('The last page taken, 1 so far');
      expect(streamLive()).toBe(true);
      expect(cameraPaused()).toBe(false);
    });

    it('Retake from the stack takes that page again and goes back to taking pages', async () => {
      mount();
      await click(startScanning(), 'Start scanning');
      await takePage();
      await until(() => stackLabel() === 'The last page taken, 1 so far');
      await pagesMade(1);
      const first = step('inspectPhoto').mock.calls.map(([file]) => file.name);
      await click(stack(), 'the stack');
      await until(() => viewer() !== null);
      await click(byText('Retake')[0], 'Retake');
      await until(() => viewer() === null && doneButton() === undefined);
      expect(stack()).toBeNull();
      await click(cameraButton('Take this page'), 'the shutter');
      await until(() => doneButton() !== undefined && stackLabel() === 'The last page taken, 1 so far');
      await pagesMade(1);
      const names = step('inspectPhoto').mock.calls.map(([file]) => file.name);
      expect(names.filter((name) => !first.includes(name))).toHaveLength(1);
      expect(tableTiles()).toHaveLength(1);
    });
  });
});
