import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PdfScanTool from './PdfScanTool.tsx';
import * as pipeline from './lib/scanPipeline.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { until } from '../../test/support/until.js';
import { cssPercent, drawnCorners, photoOfNothing, photoOfPage, useScanSuite } from '../../test/support/scanTool.browser.tsx';
import type { Point } from '#lib/pageEnhance/quad.ts';
import { rotateQuad } from '#lib/pageEnhance/quad.ts';
import { turnedQuad } from './lib/quad.ts';

vi.mock('./lib/scanPipeline.ts', { spy: true });
const realPipeline = await vi.importActual<typeof import('./lib/scanPipeline.ts')>('./lib/scanPipeline.ts');

answerNetwork();

describe('PdfScanTool corners', () => {
  const suite = useScanSuite({ Tool: PdfScanTool, installToolHarness: installBrowserToolHarness, pipeline: { spy: pipeline, real: realPipeline } });
  const { s, mount, pick, pagesMade, openPage, adjustCorners, openCorners, useCorners, handles, answered, holdNext, step, idle, inViewer, pressInViewer, done, onTable, press, viewer, heading } = suite;

  const largePhoto = async (name: string) => {
    const canvas = document.createElement('canvas');
    canvas.width = 2400;
    canvas.height = 3200;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Expected a 2d context');
    ctx.fillStyle = '#2b2118';
    ctx.fillRect(0, 0, 2400, 3200);
    ctx.fillStyle = '#f2efe6';
    ctx.fillRect(250, 300, 1900, 2600);
    ctx.fillStyle = '#222222';
    for (let i = 0; i < 22; i += 1) ctx.fillRect(400, 500 + i * 100, 1500 - (i % 5) * 120, 30);
    const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, 'image/jpeg', 0.95); });
    if (!blob) throw new Error('Expected a blob');
    return new File([blob], name, { type: 'image/jpeg' });
  };
  const sameBytes = async (a: Blob, b: Blob) => {
    const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
    return x.byteLength === y.byteLength && new Uint8Array(x).every((v, i) => v === new Uint8Array(y)[i]);
  };

  const nudge = () => act(async () => { handles()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
  const expectOnDrawn = (quad: Point[]) => handles().forEach((h, i) => {
    expect(h.style.left).toBe(cssPercent(quad[i].x));
    expect(h.style.top).toBe(cssPercent(quad[i].y));
    expect(Math.hypot(quad[i].x - drawnCorners()[i].x, quad[i].y - drawnCorners()[i].y)).toBeLessThan(0.02);
  });

  it('holds the photo\'s place while its preview is made, with no corners to drag yet, then puts the handles on the guessed quad', async () => {
    const held = holdNext('inspectPhoto');
    mount();
    await pick([await photoOfPage('a.jpg')]);
    await held.started;
    await openPage(1);
    await adjustCorners();
    expect(handles()).toHaveLength(0);
    expect(s.container.textContent).toContain('Finding the page edges');
    await held.runToEnd();
    await until(() => handles().length === 4);
    const { quad } = await answered('inspectPhoto', 'a.jpg');
    expectOnDrawn(quad);
  });

  it('opens a new photo in the corners view, on its small preview sized to the photo, never the full photo', async () => {
    const photo = await largePhoto('a.jpg');
    mount();
    await pick([photo]);
    await pagesMade(1);
    await openCorners(1);
    const img = s.container.querySelector<HTMLImageElement>('[data-corner-frame] img');
    const { preview, quad } = await answered('inspectPhoto', 'a.jpg');
    const shown = await s.harness.blobForUrl(img.src);
    if (!shown) throw new Error('Expected the shown photo');
    expect(await sameBytes(shown, preview)).toBe(true);
    expect(await sameBytes(shown, photo)).toBe(false);
    const seen = new Image();
    seen.src = img.src;
    await seen.decode();
    expect(seen.naturalWidth).toBeLessThan(2400);
    expect(seen.naturalHeight).toBeLessThan(3200);
    expect(s.container.querySelector('[data-corner-frame]').style.aspectRatio).toMatch(/^0\.75/);
    expect(handles()[0].style.left).toBe(cssPercent(quad[0].x));
  });

  it('keeps Rotate in the corners view and the corners as photographed, returns to the page on approving, and turns a page a quarter with Rotate by handing the warp its corners one place on', async () => {
    mount();
    await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg'), await photoOfPage('c.jpg')]);
    await pagesMade(3);
    await openCorners(2);
    await until(() => inViewer('Rotate').length === 1);
    expect(inViewer('Rotate')).toHaveLength(1);
    const { quad } = await answered('inspectPhoto', 'b.jpg');
    await pressInViewer('Rotate');
    const shown = turnedQuad(quad, 1);
    await until(() => handles().length === 4 && handles()[0].style.left === cssPercent(shown[0].x));
    expect(step('turnImage').mock.calls[0]).toEqual([expect.any(Blob), 1]);
    expect(handles()[0].style.top).toBe(cssPercent(shown[0].y));
    const held = holdNext('processPage');
    await nudge();
    await useCorners();
    await held.started;
    const moved = quad.map((p: Point, i: number) => (i === 3 ? { x: p.x, y: p.y - 0.005 } : p));
    const sent = step('processPage').mock.calls.at(-1)[1];
    rotateQuad(moved, 1).forEach((p, i) => {
      expect(sent[i].x).toBeCloseTo(p.x, 10);
      expect(sent[i].y).toBeCloseTo(p.y, 10);
    });
    await held.runToEnd();
    await until(() => viewer()?.querySelector('[data-paper]') != null && s.container.querySelector('[data-flatten]') === null);
    expect(heading()).toBe('Page 2 of 3');
    expect(viewer().querySelector('[data-paper]')).not.toBeNull();

    await done();
    await until(onTable);
    await openPage(1);
    const first = await answered('inspectPhoto', 'a.jpg');
    const lastQuad = () => step('processPage').mock.calls.at(-1)[1];
    const turnOnce = holdNext('processPage');
    await pressInViewer('Right');
    await turnOnce.started;
    expect(lastQuad()).toEqual([first.quad[3], first.quad[0], first.quad[1], first.quad[2]]);
    await turnOnce.runToEnd();
    const turnTwice = holdNext('processPage');
    await pressInViewer('Right');
    await turnTwice.started;
    expect(lastQuad()).toEqual([first.quad[2], first.quad[3], first.quad[0], first.quad[1]]);
    await turnTwice.runToEnd();
    await adjustCorners();
    await until(() => handles().length === 4);
    expect(handles()[0].style.left).toBe(cssPercent(turnedQuad(first.quad, 2)[0].x));
  });

  it('says so when no page edges were found, on the corners and then on the result, and when Auto-detect finds nothing either', async () => {
    mount();
    await pick([await photoOfNothing('g1.jpg'), await photoOfNothing('g2.jpg')]);
    await pagesMade(2);
    await openCorners(1);
    expect(s.container.textContent).toContain('No page edges were found in this photo');
    await useCorners();
    await until(() => suite.currentPaper().hasAttribute('data-exact'));
    expect(s.container.textContent).toContain('so the whole photo is used');
    await done();
    await until(onTable);
    await openCorners(2);
    const held = holdNext('guessPage');
    await press('Auto-detect');
    await held.started;
    await held.runToEnd();
    expect(s.container.textContent).toContain('No page edges were found here either');
    expect(step('guessPage')).toHaveBeenCalledTimes(1);
    expect(await step('guessPage').mock.results[0].value).toBeNull();
    expect(s.container.textContent).toContain('Drag the corners onto the corners of the page');
  });

  it('finds the page on request from the corners view, and drops an Auto-detect result for a page removed while it waited', async () => {
    // oxlint-disable-next-line landmines/no-test-doubles -- Forced: the first look and Auto-detect read the same preview bytes by design (inspectWith calls guessWith on them), so no real photo gets none from the first and a page from the second.
    step('inspectPhoto').mockImplementationOnce(async (...args: Parameters<typeof realPipeline.inspectPhoto>) => ({ ...(await realPipeline.inspectPhoto(...args)), quad: null }));
    mount();
    await pick([await photoOfPage('a.jpg'), await photoOfPage('b.jpg')]);
    await pagesMade(2);
    await openCorners(1);
    expect(handles()[0].style.left).toBe('0%');
    const found = holdNext('guessPage');
    await press('Auto-detect');
    await found.started;
    await found.runToEnd();
    const guessed = await step('guessPage').mock.results[0].value;
    expectOnDrawn(guessed);
    expect(s.container.textContent).not.toContain('No page edges were found');
    expect(s.container.textContent).toContain('Page edges found');
    await useCorners();
    await done();
    await until(onTable);
    await openCorners(2);
    const lost = holdNext('guessPage');
    await press('Auto-detect');
    await lost.started;
    await useCorners();
    await pressInViewer('Remove');
    await lost.runToEnd();
    await act(async () => { await idle(); });
    expect(s.container.textContent).not.toContain('Page edges found');
  });
});
