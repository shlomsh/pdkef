import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
import { applyPageEdits } from './lib/applyPageEdits.js';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { getAppStyle } from '#editor/workspace/preferenceStore.ts';
import { startGesture } from '#lib/gestures/controller.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { useRedactSuite, required, query, buildPdf, makePdfFile, clientPoint, centerOf, percentOn } from '../../test/support/redactTool.browser.tsx';
import { englishRedactMessages } from './messages.ts';
import numOneUrl from '../../lib/__fixtures__/num-1.pdf?url';

answerNetwork();

vi.mock('#lib/gestures/controller.ts', { spy: true });
vi.mock('./lib/applyPageEdits.js', { spy: true });
const { startGesture: realStartGesture } = await vi.importActual<typeof import('#lib/gestures/controller.ts')>('#lib/gestures/controller.ts');
const { applyPageEdits: realApplyPageEdits } = await vi.importActual<typeof import('./lib/applyPageEdits.js')>('./lib/applyPageEdits.js');

const downloads: Promise<Blob>[] = [];
const recordDownload = (event: Event) => {
  const link = (event.target as Element | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
  if (link) downloads.push(fetch(link.href).then((response) => response.blob()));
};

async function pixelAt(blob: Blob, fromLeft: number, fromTop: number) {
  const saved = await PDFDocument.load(await blob.arrayBuffer());
  const xObjects = required(saved.getPage(0).node.Resources(), 'page resources').lookup(PDFName.of('XObject'), PDFDict);
  const picture = xObjects.lookup(xObjects.keys()[0]);
  if (!(picture instanceof PDFRawStream)) throw new Error('Expected the page image as a raw stream');
  const bitmap = await createImageBitmap(new Blob([picture.contents as BlobPart], { type: 'image/jpeg' }));
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = required(canvas.getContext('2d'), '2d context');
  ctx.drawImage(bitmap, 0, 0);
  const [r, g, b] = ctx.getImageData(Math.floor(fromLeft * bitmap.width), Math.floor(fromTop * bitmap.height), 1, 1).data;
  return { r, g, b };
}

function frameStep(el: Element, x: number, y: number) {
  const origin = clientPoint(el, 0, 0);
  const end = clientPoint(el, x, y);
  return { dx: end.clientX - origin.clientX, dy: end.clientY - origin.clientY };
}

async function expectBoxOnPage(blob: Blob) {
  const inside = await pixelAt(blob, 0.25, 0.35);
  const outside = await pixelAt(blob, 0.8, 0.8);
  expect(Math.max(inside.r, inside.g, inside.b)).toBeLessThan(16);
  expect(Math.min(outside.r, outside.g, outside.b)).toBeGreaterThan(240);
}

describe('PdfRedactTool UI flow', () => {
  const { s, holdNextExport, failedOperations, loadFileAndGetDrawArea, hoverBrushTool, drawBox, expectLatestGestureToCommitOnce } = useRedactSuite({ Tool: PdfRedactTool, checking: CHECKING, gestureEntry: { spy: startGesture, real: realStartGesture }, installToolHarness: installBrowserToolHarness, waitUntil, exportEntry: { spy: applyPageEdits, real: realApplyPageEdits } });

  beforeEach(() => {
    downloads.length = 0;
    document.addEventListener('click', recordDownload, { capture: true });
  });

  afterEach(() => {
    document.removeEventListener('click', recordDownload, { capture: true });
  });

  describe('RED-59: the file\'s details', () => {
    const authored = async () => makePdfFile('authored.pdf', await buildPdf(2, { author: 'Ada Lovelace' }));

    it('shows no footer for a file without details', async () => {
      await loadFileAndGetDrawArea();
      expect(s.container.querySelector('[data-details-footer]')).toBeNull();
    });

    it('shows the footer once the details are read', async () => {
      await loadFileAndGetDrawArea(await authored());
      await waitUntil(() => s.container.querySelector('[data-details-footer]') !== null);
      expect(query(s.container, '[data-details-footer]').textContent).toContain('Ada Lovelace');
    });

    it('the export receives the details edited in the sheet, and none when untouched', async () => {
      const authorOf = async (blob: Blob) => (await PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false })).getAuthor();
      const drawArea = await loadFileAndGetDrawArea(await authored());
      await waitUntil(() => s.container.querySelector('[data-details-footer]') !== null);
      await drawBox(drawArea, 50, 200, 200, 500);
      const download = () => required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((button) => button.textContent.includes('Download')), 'Download button');
      await act(async () => { download().click(); });
      await waitUntil(() => downloads.length === 1);
      // Untouched: the saved file says what the original did.
      expect(await authorOf(await downloads[0])).toBe('Ada Lovelace');

      const review = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[data-details-footer] button'))
        .find((button) => button.textContent === 'Review'), 'Review button');
      await act(async () => { review.click(); });
      const row = query(document.body, '[data-detail-row="author"]');
      const del = required(Array.from(row.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === 'Delete'), 'Delete author');
      await act(async () => { del.click(); });
      expect(query(document.body, '[data-detail-row="author"]').getAttribute('data-detail-state')).toBe('deleted');
      const done = required(Array.from(document.body.querySelectorAll<HTMLButtonElement>('dialog button')).find((b) => b.textContent === 'Done'), 'Done');
      await act(async () => { done.click(); });

      await act(async () => { download().click(); });
      await waitUntil(() => downloads.length === 2);
      expect(await authorOf(await downloads[1])).toBeUndefined();
    });
  });

  it('RED-31: Space peeks under every box, the Peek button shows it, and an export taken while peeking is unchanged', async () => {
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500);
    const box = query(s.container, '[data-redact-box-id]');
    const peekButton = query(s.container, '[data-redact-peek]');
    expect(peekButton.getAttribute('aria-pressed')).toBe('false');
    expect(box.hasAttribute('data-peeking')).toBe(false);

    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })); });
    expect(box.hasAttribute('data-peeking')).toBe(true);
    expect(peekButton.getAttribute('aria-pressed')).toBe('true');

    const download = () => required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
      .find((button) => button.textContent.includes('Download')), 'Download button');
    await act(async () => { download().click(); });
    await waitUntil(() => downloads.length === 1);
    await expectBoxOnPage(await downloads[0]);

    await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })); });
    expect(box.hasAttribute('data-peeking')).toBe(false);
    await act(async () => { download().click(); });
    await waitUntil(() => downloads.length === 2);
    await expectBoxOnPage(await downloads[1]);
  });

  it('RED-31: a long press on the Peek button cannot start a text selection or a callout', async () => {
    await loadFileAndGetDrawArea();
    const peekButton = query(s.container, '[data-redact-peek]');
    for (const type of ['selectstart', 'touchstart', 'contextmenu']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      peekButton.querySelector('span')!.dispatchEvent(event);
      expect(event.defaultPrevented, type).toBe(true);
    }
  });

  it('RED-31: holding a box for 250ms peeks it, release covers it, and it never moves', async () => {
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500);
    const box = query(s.container, '[data-redact-box-id]');
    const style = box.getAttribute('style');
    const down = clientPoint(drawArea, 100, 300);
    vi.useFakeTimers();
    try {
      act(() => { box.dispatchEvent(new MouseEvent('mousedown', { ...down, bubbles: true })); });
      act(() => { vi.advanceTimersByTime(250); });
      expect(box.hasAttribute('data-peeking')).toBe(true);
      document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: down.clientX + 60, clientY: down.clientY + 80, bubbles: true }));
      expect(box.style.transform).not.toContain('translate(');
      act(() => { document.dispatchEvent(new MouseEvent('mouseup')); window.dispatchEvent(new MouseEvent('mouseup')); });
      expect(box.hasAttribute('data-peeking')).toBe(false);
      expect(box.getAttribute('style')).toContain(style!.split(';')[1] ?? '');
    } finally {
      vi.useRealTimers();
    }
  });

  it('RED-31: moving 5px before 250ms is a normal move, not a peek', async () => {
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500);
    const box = query(s.container, '[data-redact-box-id]');
    const down = clientPoint(drawArea, 100, 300);
    vi.useFakeTimers();
    try {
      act(() => { box.dispatchEvent(new MouseEvent('mousedown', { ...down, bubbles: true })); });
      act(() => { document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: down.clientX + 8, clientY: down.clientY, bubbles: true })); });
      expect(box.style.transform).toContain('translate(');
      act(() => { vi.advanceTimersByTime(400); });
      expect(box.hasAttribute('data-peeking')).toBe(false);
      act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the same PDF page mounted while redacting', async () => {
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500);
    const pageBefore = s.container.querySelector('.redact-draw-area');
    const downloadButton = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
      .find((button) => button.textContent.includes('Download')), 'Download button');

    const held = holdNextExport();
    await act(async () => {
      downloadButton.click();
    });
    await act(async () => { await held.started; });

    expect(s.container.querySelector('.redact-draw-area')).toBe(pageBefore);
    expect(s.container.querySelector('[data-workspace]').hasAttribute('data-processing')).toBe(true);
    expect(s.container.querySelector('[data-workspace]').getAttribute('aria-busy')).toBe('true');

    await act(async () => { held.release(); });
    await waitUntil(() => !s.container.querySelector('[data-workspace]')!.hasAttribute('data-processing'));
  });

  it('exports the bytes it already holds when the picked file can no longer be read (DEBT-51)', async () => {
    const picked = makePdfFile('gone.pdf');
    const drawArea = await loadFileAndGetDrawArea(picked);
    // Moved or deleted on disk after picking: Chromium rejects the re-read.
    picked.arrayBuffer = () => Promise.reject(new DOMException('gone', 'NotFoundError'));
    await drawBox(drawArea, 50, 200, 200, 500);
    const download = () => required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
      .find((button) => button.textContent.includes('Download')), 'Download button');

    // A re-read of the File would fail the export; both exports deliver a real two-page PDF instead.
    const delivered = async (count: number) => {
      await waitUntil(() => downloads.length === count || s.container.textContent.includes(englishRedactMessages.exportFailed));
      expect(s.container.textContent).not.toContain(englishRedactMessages.exportFailed);
    };
    await act(async () => { download().click(); });
    await delivered(1);
    await act(async () => { download().click(); });
    await delivered(2);

    for (const blob of await Promise.all(downloads)) {
      expect((await PDFDocument.load(await blob.arrayBuffer())).getPageCount()).toBe(2);
    }
    expect(await failedOperations()).toEqual([]);
    await s.harness.flush();
    expect(s.harness.usageEvents('tool_result_ready')).toHaveLength(2);
  });

  it('shares a valid PDF prepared from the real num-1.pdf fixture', async () => {
    const originalShare = navigator.share;
    const originalCanShare = navigator.canShare;
    // forced: the OS share sheet exists only on devices with one
    const share = vi.fn((_data?: ShareData) => Promise.resolve());
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    // forced: as above, canShare answers yes only where a share sheet exists
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });

    try {
      const drawArea = await loadFileAndGetDrawArea(
        new File([await (await fetch(numOneUrl)).arrayBuffer()], 'num-1.pdf', { type: 'application/pdf' })
      );
      await drawBox(drawArea, 50, 200, 200, 500);

      const prepareButton = s.container.querySelector('button[title="Apply redactions and prepare the PDF for sharing"]');
      expect(prepareButton).not.toBeNull();
      await act(async () => {
        prepareButton.click();
      });
      await waitUntil(() => s.container.querySelector('button[title="Share the redacted PDF"]') !== null);

      expect(s.container.querySelector('[data-workspace]')).not.toBeNull();
      // Label stays "Share" in both states (MOBI-07 follow-up), so the ready
      // state is found by its title, not its text.
      const shareButton = s.container.querySelector('button[title="Share the redacted PDF"]');
      expect(shareButton).not.toBeNull();
      await act(async () => {
        shareButton.click();
      });

      expect(share).toHaveBeenCalledOnce();
      const sharedFile = required(share.mock.calls[0]?.[0]?.files?.[0], 'shared PDF file');
      expect(sharedFile.name).toBe('redacted_num-1.pdf');

      const shared = await PDFDocument.load(await sharedFile.arrayBuffer());
      expect(shared.getPageCount()).toBe(1);
    } finally {
      if (originalShare === undefined) Reflect.deleteProperty(navigator, 'share');
      else Object.defineProperty(navigator, 'share', { configurable: true, value: originalShare });
      if (originalCanShare === undefined) Reflect.deleteProperty(navigator, 'canShare');
      else Object.defineProperty(navigator, 'canShare', { configurable: true, value: originalCanShare });
    }
  });

  it('commits Redact creation once after multiple pointer moves (E4.4)', async () => {
    const drawArea = await loadFileAndGetDrawArea();

    await act(async () => {
      drawArea.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(drawArea, 50, 200), bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { ...clientPoint(drawArea, 100, 300), bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { ...clientPoint(drawArea, 200, 500), bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expectLatestGestureToCommitOnce();
    expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);
  });

  describe('RED-32 brushes', () => {
    const brushSegment = (label: string) => required(
      Array.from(document.querySelectorAll<HTMLButtonElement>('[data-brush-controls] [role="radio"]')).find((b) => b.textContent === label),
      `${label} segment`,
    );
    async function armBrush(tool: string) {
      await hoverBrushTool(tool);
      await act(async () => { brushSegment('Brush').click(); });
    }
    async function paint(drawArea: HTMLElement, points: [number, number][]) {
      const layer = query(drawArea, '[data-brush-layer]');
      await act(async () => {
        layer.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(layer, points[0][0], points[0][1]), bubbles: true, cancelable: true }));
      });
      for (const [x, y] of points.slice(1)) {
        await act(async () => { window.dispatchEvent(new MouseEvent('mousemove', clientPoint(layer, x, y))); });
      }
      await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });
    }

    it('a stroke commits exactly one simplified element and the brush stays armed', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await armBrush('Whiteout');
      // 40 points 0.1 frame units apart: far closer than the simplifier's step. The brush reads MouseEvents,
      // whose clientX/clientY Chromium floors to whole pixels, so most moves land on the previous pixel.
      const points: [number, number][] = Array.from({ length: 40 }, (_, i) => [100 + i * 0.1, 200]);
      await paint(drawArea, points);

      expectLatestGestureToCommitOnce();
      const strokes = s.container.querySelectorAll('[data-redact-box-id]');
      expect(strokes).toHaveLength(1);
      // Still armed for the next stroke, with the brush layer on the page.
      expect(s.container.querySelector('[data-brush-layer]')).not.toBeNull();
      await paint(drawArea, [[100, 300], [160, 320]]);
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(2);
    });

    it('Escape disarms the brush', async () => {
      await loadFileAndGetDrawArea();
      await armBrush('Blur');
      expect(s.container.querySelector('[data-brush-layer]')).not.toBeNull();
      await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
      expect(s.container.querySelector('[data-brush-layer]')).toBeNull();
    });

    it('remembers the mode and size for the next document', async () => {
      await loadFileAndGetDrawArea();
      await armBrush('Whiteout');
      const size = query<HTMLInputElement>(document.body, '[data-brush-controls] input[type="range"]');
      size.value = '30';
      await act(async () => { size.dispatchEvent(new Event('input', { bubbles: true })); });
      expect(getAppStyle()).toMatchObject({ brushMode: 'brush', brushSize: 30 });
      expect(localStorage.getItem('pdf-toolkit:redact-brush:v1')).toBeNull();
    });
  });

  it('draws a box whose left/top/width/height are pxToPercent of the draw area, not raw px/rect.width math', async () => {
    const drawArea = await loadFileAndGetDrawArea();

    await drawBox(drawArea, 50, 200, 200, 500);

    const box = s.container.querySelector('[data-redact-box-id]');
    expect(box).not.toBeNull();

    const start = percentOn(drawArea, clientPoint(drawArea, 50, 200));
    const end = percentOn(drawArea, clientPoint(drawArea, 200, 500));

    expect(parseFloat(box.style.left)).toBeCloseTo(Math.min(start.x, end.x));
    expect(parseFloat(box.style.top)).toBeCloseTo(Math.min(start.y, end.y));
    expect(parseFloat(box.style.width)).toBeCloseTo(Math.abs(end.x - start.x));
    expect(parseFloat(box.style.height)).toBeCloseTo(Math.abs(end.y - start.y));
  });

  it('drags an existing box by a percent delta computed via pxDeltaToPercent against the wrapper', async () => {
    const drawArea = await loadFileAndGetDrawArea();

    // Draw a box first so there's something to drag.
    await drawBox(drawArea, 50, 200, 200, 500);

    const box = s.container.querySelector('[data-redact-box-id]');
    const startLeftPercent = parseFloat(box.style.left);
    const startTopPercent = parseFloat(box.style.top);

    await act(async () => {
      box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(drawArea, 100, 100), bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', clientPoint(drawArea, 150, 300))); // dx=50 dy=200
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', clientPoint(drawArea, 150, 300)));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const down = percentOn(drawArea, clientPoint(drawArea, 100, 100));
    const move = percentOn(drawArea, clientPoint(drawArea, 150, 300));
    const expectedLeft = startLeftPercent + (move.x - down.x);
    const expectedTop = startTopPercent + (move.y - down.y);

    expect(parseFloat(box.style.left)).toBeCloseTo(expectedLeft);
    expect(parseFloat(box.style.top)).toBeCloseTo(expectedTop);
    expectLatestGestureToCommitOnce();
  });

  // Blackout/blur now share whiteout's floating toolbar
  // (`[data-editor-actions]`, rendered on selection), whose wrapper already
  // stops mousedown/touchstart propagation, so a press on any of its buttons
  // never reaches RedactBox's own drag handler - one shared guarantee for
  // every type, not a Redact-only `.redact-element-btn` closest() check
  // against a lone inline button any more (that check went away with the
  // button it protected, see E7.5's toolbar-parity fix).
  it('does not start a drag when the floating toolbar delete button is pressed', async () => {
    const drawArea = await loadFileAndGetDrawArea();

    // Default activeStyle is 'blackout'.
    await drawBox(drawArea, 50, 200, 200, 500);

    const box = s.container.querySelector('[data-redact-box-id]');
    // Select the box so the shared floating toolbar renders.
    await act(async () => {
      box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(drawArea, 0, 0), bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const deleteBtn = query<HTMLButtonElement>(box, '[data-editor-actions] button[title="Delete"]');

    const startLeftPercent = parseFloat(box.style.left);
    const startTopPercent = parseFloat(box.style.top);
    const gestureCountBefore = s.gestureCommitSpies.length;

    await act(async () => {
      deleteBtn.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(drawArea, 100, 100), bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', clientPoint(drawArea, 150, 300)));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    expect(s.gestureCommitSpies.length).toBe(gestureCountBefore);
    expect(parseFloat(box.style.left)).toBeCloseTo(startLeftPercent);
    expect(parseFloat(box.style.top)).toBeCloseTo(startTopPercent);
  });

  it('resizes an existing box by a percent delta computed via pxDeltaToPercent against the wrapper', async () => {
    const drawArea = await loadFileAndGetDrawArea();

    await drawBox(drawArea, 50, 200, 200, 500);

    const box = s.container.querySelector('[data-redact-box-id]');
    const startWidthPercent = parseFloat(box.style.width);
    const startHeightPercent = parseFloat(box.style.height);

    await act(async () => {
      box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(drawArea, 0, 0), bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const resizer = box.querySelector('[data-editor-resizer="bottom-right"]');
    expect(resizer).not.toBeNull();

    const grab = centerOf(resizer);
    const { dx, dy } = frameStep(drawArea, 30, 80);
    await act(async () => {
      resizer.dispatchEvent(new MouseEvent('mousedown', { ...grab, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: grab.clientX + dx, clientY: grab.clientY + dy })); // dx=30 dy=80
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: grab.clientX + dx, clientY: grab.clientY + dy }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const pressed = percentOn(drawArea, grab);
    const released = percentOn(drawArea, { clientX: grab.clientX + dx, clientY: grab.clientY + dy });
    const expectedWidth = startWidthPercent + (released.x - pressed.x);
    const expectedHeight = startHeightPercent + (released.y - pressed.y);

    expect(parseFloat(box.style.width)).toBeCloseTo(expectedWidth);
    expect(parseFloat(box.style.height)).toBeCloseTo(expectedHeight);
    expectLatestGestureToCommitOnce();
  });

  it('DEBT-31: a resize release records resize_mark once, after the box was placed', async () => {
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500);
    const box = required(s.container.querySelector('[data-redact-box-id]'), 'box');
    await act(async () => {
      box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(drawArea, 0, 0), bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    const resizer = required(box.querySelector('[data-editor-resizer="bottom-right"]'), 'resizer');
    const grab = centerOf(resizer);
    const { dx, dy } = frameStep(drawArea, 30, 80);
    await act(async () => {
      resizer.dispatchEvent(new MouseEvent('mousedown', { ...grab, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: grab.clientX + dx, clientY: grab.clientY + dy }));
    });
    const before = recentActions();
    expect(before).not.toContain('resize_mark');
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    expect(recentActions().filter((a) => a === 'resize_mark')).toHaveLength(1);
    expect(recentActions().slice(0, 3)).toEqual(['add_files', 'arm_tool', 'place_mark']);
  });
});
