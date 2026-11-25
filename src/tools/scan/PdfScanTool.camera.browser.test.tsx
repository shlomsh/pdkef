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
const realPipeline = await vi.importActual<typeof import('./lib/scanPipeline.ts')>('./lib/scanPipeline.ts');

answerNetwork();

describe('PdfScanTool camera', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const { s, step, mount, startScanning, tableTiles, click, pagesMade, byText, openPage, viewer } = suite;
  const camera = () => s.container.querySelector<HTMLDialogElement>('dialog[aria-label="Start scanning"]');
  const cameraButton = (label: string) => camera()?.querySelector<HTMLElement>(`button[aria-label="${label}"]`);
  const video = () => camera().querySelector<HTMLVideoElement>('video');
  const videoTrack = () => (video().srcObject as MediaStream).getVideoTracks()[0];
  // Chromium's fake camera runs at 3840x2160, and page work on such a photo takes seconds on CI; nothing here is about its size.
  const cameraLive = async () => {
    await until(() => cameraButton('Take this page') != null);
    await act(() => videoTrack().applyConstraints({ width: 640, height: 480 }));
  };
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
  const streamLive = () => videoTrack().readyState === 'live' && !video().paused;
  const accepted = () => s.harness.usageEvents('tool_file_accepted').map((e) => e.properties.source);

  it('opens the viewfinder from Start scanning without opening the input; a first photo is accepted as camera, a second sends none and leaves no mark', async () => {
    mount();
    const input = startScanning().querySelector('input');
    const opened = vi.fn();
    input.addEventListener('click', opened);
    await click(startScanning(), 'Start scanning');
    await cameraLive();
    expect(doneButton()).toBeDefined();
    expect(stack()).toBeNull();
    expect(opened).not.toHaveBeenCalled();
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

  it('adds a page for each photo taken, opens the stack over the paused camera, retakes from it and closes on Done', async () => {
    mount();
    await click(startScanning(), 'Start scanning');
    await takePage();
    await until(() => stackLabel() === 'The last page taken, 1 so far');
    expect(stack().querySelector('span').textContent).toBe('1');
    await pagesMade(1);
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
    await click(doneButton(), 'Done');
    expect(camera()).toBeNull();
    expect(tableTiles()).toHaveLength(1);
    await pagesMade(1);
  });

  it('adds the photos of the native input when the camera falls back, and replaces a page in place from its page view, in mode one', async () => {
    // forced: the device has no camera
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockRejectedValueOnce(new DOMException('no camera', 'NotFoundError'));
    mount();
    await click(startScanning(), 'Start scanning');
    await until(() => camera()?.querySelector('input[type="file"]') != null);
    await act(async () => { setInputFiles(camera().querySelector('input[type="file"]'), [await photoOfPage('f1.jpg'), await photoOfPage('f2.jpg')]); });
    await until(() => camera() === null);
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
    expect(names.filter((name) => !['f1.jpg', 'f2.jpg'].includes(name))).toHaveLength(1);
    expect(tableTiles()).toHaveLength(2);
  });
});
