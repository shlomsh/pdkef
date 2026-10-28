import { act } from 'preact/test-utils';
import { describe, expect, it, vi, type Mock } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
import { pxToPercent, pxDeltaToPercent } from '#editor/geometry/coords.ts';
import { recentActions } from '#lib/telemetry/actionTrail.ts';
import { PDFDocument } from '@cantoo/pdf-lib';
import { getAppStyle } from '#editor/workspace/preferenceStore.ts';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import fs from 'node:fs';
import * as gestureController from '#lib/gestures/controller.ts';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { useRedactSuite, required, query, settleUntil, installCanvasEdge, buildPdf, makePdfFile, canvasEdge } from '../../test/support/redactTool.tsx';

declare const __dirname: string;

// pdf.js and the canvas are faked by the shared suite (src/test/support/redactTool.tsx); only the ring
// sampler is steered per test, through `pageSampler`.
vi.mock('#editor-ui/whiteout/pageSampling.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#editor-ui/whiteout/pageSampling.ts')>();
  const { pageSampler } = await import('../../test/support/redactTool.tsx');
  return {
    ...actual,
    sampleRingColor: (canvas: HTMLCanvasElement | null | undefined, box: { left: number; top: number; width: number; height: number }) => {
      pageSampler.calls.push({ canvas, box });
      return pageSampler.impl(canvas, box);
    },
  };
});

describe('PdfRedactTool UI flow', () => {
  const { s, holdNextDocumentRead, failedOperations, loadFileAndGetDrawArea, armTool, drawBox, expectLatestGestureToCommitOnce } = useRedactSuite({ Tool: PdfRedactTool, checking: CHECKING, gestureController, installToolHarness, waitUntil });

  describe('RED-59: the file\'s details', () => {
    const authored = async () => makePdfFile('authored.pdf', await buildPdf(2, { author: 'Ada Lovelace' }));

    it('shows no footer for a file without details', async () => {
      await loadFileAndGetDrawArea();
      expect(s.container.querySelector('[data-details-footer]')).toBeNull();
    });

    it('shows the footer once the details are read', async () => {
      await loadFileAndGetDrawArea(await authored());
      await settleUntil('the details footer', () => s.container.querySelector('[data-details-footer]') !== null);
      expect(query(s.container, '[data-details-footer]').textContent).toContain('Ada Lovelace');
    });

    it('the export receives the details edited in the sheet, and none when untouched', async () => {
      s.restoreCanvas = installCanvasEdge();
      const originalCreateObjectURL = window.URL.createObjectURL;
      const originalRevokeObjectURL = window.URL.revokeObjectURL;
      const downloads: Blob[] = [];
      window.URL.createObjectURL = vi.fn((blob: Blob) => { downloads.push(blob); return 'blob:redacted-pdf'; });
      window.URL.revokeObjectURL = vi.fn();
      const authorOf = async (blob: Blob) => (await PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false })).getAuthor();
      try {
        const drawArea = await loadFileAndGetDrawArea(await authored());
        await settleUntil('the details footer', () => s.container.querySelector('[data-details-footer]') !== null);
        await drawBox(drawArea, 50, 200, 200, 500);
        const download = () => required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
          .find((button) => button.textContent.includes('Download')), 'Download button');
        await act(async () => { download().click(); });
        await settleUntil('the untouched export', () => downloads.length === 1);
        // Untouched: the saved file says what the original did.
        expect(await authorOf(downloads[0])).toBe('Ada Lovelace');

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
        await settleUntil('the export with the edit', () => downloads.length === 2);
        expect(await authorOf(downloads[1])).toBeUndefined();
      } finally {
        window.URL.createObjectURL = originalCreateObjectURL;
        window.URL.revokeObjectURL = originalRevokeObjectURL;
      }
    });
  });

  it('RED-31: Space peeks under every box, the Peek button shows it, and an export taken while peeking is unchanged', async () => {
    s.restoreCanvas = installCanvasEdge();
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:redacted-pdf');
    window.URL.revokeObjectURL = vi.fn();
    try {
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
      const revokedBefore = (window.URL.revokeObjectURL as Mock).mock.calls.length;
      canvasEdge.fills = [];
      await act(async () => { download().click(); });
      await settleUntil('the export while peeking', () => (window.URL.revokeObjectURL as Mock).mock.calls.length > revokedBefore);
      // What the export painted onto the page picture, box by box: the peek is not in it.
      const whilePeeking = [...canvasEdge.fills];
      expect(whilePeeking.some((fill) => fill.startsWith('#000000 '))).toBe(true);

      await act(async () => { document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true })); });
      expect(box.hasAttribute('data-peeking')).toBe(false);
      const revokedMid = (window.URL.revokeObjectURL as Mock).mock.calls.length;
      canvasEdge.fills = [];
      await act(async () => { download().click(); });
      await settleUntil('the export after peeking', () => (window.URL.revokeObjectURL as Mock).mock.calls.length > revokedMid);
      expect(canvasEdge.fills).toEqual(whilePeeking);
    } finally {
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    }
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
    vi.useFakeTimers();
    try {
      act(() => { box.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 300, bubbles: true })); });
      act(() => { vi.advanceTimersByTime(250); });
      expect(box.hasAttribute('data-peeking')).toBe(true);
      document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, clientY: 380, bubbles: true }));
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
    vi.useFakeTimers();
    try {
      act(() => { box.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 300, bubbles: true })); });
      act(() => { document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: 108, clientY: 300, bubbles: true })); });
      expect(box.style.transform).toContain('translate(');
      act(() => { vi.advanceTimersByTime(400); });
      expect(box.hasAttribute('data-peeking')).toBe(false);
      act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the same PDF page mounted while redacting', async () => {
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    window.URL.createObjectURL = vi.fn(() => 'blob:redacted-pdf');
    window.URL.revokeObjectURL = vi.fn();

    try {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      const pageBefore = s.container.querySelector('.redact-draw-area');
      const downloadButton = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((button) => button.textContent.includes('Download')), 'Download button');

      // The export's own pdf.js read is held open, so the export is in flight.
      const exportRead = holdNextDocumentRead();
      await act(async () => {
        downloadButton.click();
      });
      await settleUntil('the export to reach its pdf.js read', exportRead.reached);

      expect(s.container.querySelector('.redact-draw-area')).toBe(pageBefore);
      expect(s.container.querySelector('[data-workspace]').hasAttribute('data-processing')).toBe(true);
      expect(s.container.querySelector('[data-workspace]').getAttribute('aria-busy')).toBe('true');

      await act(async () => { exportRead.release(); });
      await settleUntil('the export to finish', () => !s.container.querySelector('[data-workspace]')!.hasAttribute('data-processing'));
    } finally {
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('exports the bytes it already holds when the picked file can no longer be read (DEBT-51)', async () => {
    s.restoreCanvas = installCanvasEdge();
    const originalCreateObjectURL = window.URL.createObjectURL;
    const originalRevokeObjectURL = window.URL.revokeObjectURL;
    const downloads: Blob[] = [];
    window.URL.createObjectURL = vi.fn((blob: Blob) => { downloads.push(blob); return 'blob:redacted-pdf'; });
    window.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      const picked = makePdfFile('gone.pdf');
      const drawArea = await loadFileAndGetDrawArea(picked);
      // Moved or deleted on disk after picking: Chromium rejects the re-read.
      picked.arrayBuffer = () => Promise.reject(new DOMException('gone', 'NotFoundError'));
      await drawBox(drawArea, 50, 200, 200, 500);
      const download = () => required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((button) => button.textContent.includes('Download')), 'Download button');

      // A re-read of the File would fail the export; both exports deliver a real two-page PDF instead.
      await act(async () => { download().click(); });
      await settleUntil('the first export to deliver', () => downloads.length === 1);
      await act(async () => { download().click(); });
      await settleUntil('the second export to deliver', () => downloads.length === 2);

      for (const blob of downloads) {
        expect((await PDFDocument.load(await blob.arrayBuffer())).getPageCount()).toBe(2);
      }
      expect(await failedOperations()).toEqual([]);
      expect(s.harness.usageEvents('tool_result_ready')).toHaveLength(2);
    } finally {
      window.URL.createObjectURL = originalCreateObjectURL;
      window.URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('shares a valid PDF prepared from the real num-1.pdf fixture', async () => {
    s.restoreCanvas = installCanvasEdge();
    const originalShare = navigator.share;
    const originalCanShare = navigator.canShare;
    const share = vi.fn((_data?: ShareData) => Promise.resolve());
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });

    try {
      const fixturePath = `${__dirname}/../../lib/__fixtures__/num-1.pdf`;
      const fixtureBytes = fs.readFileSync(fixturePath);
      const drawArea = await loadFileAndGetDrawArea(
        new File([fixtureBytes], 'num-1.pdf', { type: 'application/pdf' })
      );
      await drawBox(drawArea, 50, 200, 200, 500);

      const prepareButton = s.container.querySelector('button[title="Apply redactions and prepare the PDF for sharing"]');
      expect(prepareButton).not.toBeNull();
      await act(async () => {
        prepareButton.click();
      });
      await settleUntil(
        'the prepared share file',
        () => s.container.querySelector('button[title="Share the redacted PDF"]') !== null,
      );

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

      // pdf-lib, not pdf.js, to prove the shared bytes are a one-page PDF: the
      // real pdf.js legacy build is 3.4MB to import and evaluate plus a fake
      // worker to spin up, all inside jsdom. Measured 2026-09-20: ~300ms with a
      // core to itself, 5.2-5.5s when a saturated 4-core host runs ~32 forks,
      // which is past Vitest's 5s default and was this file's one flake. The
      // Delete tool's still-valid-PDF test below already checks the same way.
      const { PDFDocument } = await import('@cantoo/pdf-lib');
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
      drawArea.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 200, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 300, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 500, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    expectLatestGestureToCommitOnce();
    expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);
  });

  describe('RED-32 brushes', () => {
    const brushSegment = (label: string) => required(
      Array.from(s.container.querySelectorAll<HTMLButtonElement>('[data-brush-controls] [role="radio"]')).find((b) => b.textContent === label),
      `${label} segment`,
    );
    async function armBrush(tool: string) {
      await armTool(tool);
      await act(async () => { brushSegment('Brush').click(); });
    }
    async function paint(drawArea: HTMLElement, points: [number, number][]) {
      const layer = query(drawArea, '[data-brush-layer]');
      layer.getBoundingClientRect = drawArea.getBoundingClientRect;
      await act(async () => {
        layer.dispatchEvent(new MouseEvent('mousedown', { clientX: points[0][0], clientY: points[0][1], bubbles: true, cancelable: true }));
      });
      for (const [x, y] of points.slice(1)) {
        await act(async () => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y })); });
      }
      await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });
    }

    it('a stroke commits exactly one simplified element and the brush stays armed', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await armBrush('Whiteout');
      // 40 points 0.1px apart: far closer than the simplifier's step.
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
      const size = query<HTMLInputElement>(s.container, '[data-brush-controls] input[type="range"]');
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

    const startLeft = pxToPercent(50, 500);
    const startTop = pxToPercent(200, 1000);
    const endLeft = pxToPercent(200, 500);
    const endTop = pxToPercent(500, 1000);

    expect(parseFloat(box.style.left)).toBeCloseTo(Math.min(startLeft, endLeft));
    expect(parseFloat(box.style.top)).toBeCloseTo(Math.min(startTop, endTop));
    expect(parseFloat(box.style.width)).toBeCloseTo(Math.abs(endLeft - startLeft));
    expect(parseFloat(box.style.height)).toBeCloseTo(Math.abs(endTop - startTop));
  });

  it('drags an existing box by a percent delta computed via pxDeltaToPercent against the wrapper', async () => {
    const drawArea = await loadFileAndGetDrawArea();

    // Draw a box first so there's something to drag.
    await drawBox(drawArea, 50, 200, 200, 500);

    const box = s.container.querySelector('[data-redact-box-id]');
    const startLeftPercent = parseFloat(box.style.left);
    const startTopPercent = parseFloat(box.style.top);

    await act(async () => {
      box.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 300 })); // dx=50 dy=200
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 300 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const expectedLeft = startLeftPercent + pxDeltaToPercent(50, 500);
    const expectedTop = startTopPercent + pxDeltaToPercent(200, 1000);

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
      box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const deleteBtn = query<HTMLButtonElement>(box, '[data-editor-actions] button[title="Delete"]');

    const startLeftPercent = parseFloat(box.style.left);
    const startTopPercent = parseFloat(box.style.top);
    const gestureCountBefore = s.gestureCommitSpies.length;

    await act(async () => {
      deleteBtn.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 300 }));
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
      box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const resizer = box.querySelector('[data-editor-resizer="bottom-right"]');
    expect(resizer).not.toBeNull();

    await act(async () => {
      resizer.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 130, clientY: 180 })); // dx=30 dy=80
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 130, clientY: 180 }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });

    const expectedWidth = startWidthPercent + pxDeltaToPercent(30, 500);
    const expectedHeight = startHeightPercent + pxDeltaToPercent(80, 1000);

    expect(parseFloat(box.style.width)).toBeCloseTo(expectedWidth);
    expect(parseFloat(box.style.height)).toBeCloseTo(expectedHeight);
    expectLatestGestureToCommitOnce();
  });

  it('DEBT-31: a resize release records resize_mark once, after the box was placed', async () => {
    const drawArea = await loadFileAndGetDrawArea();
    await drawBox(drawArea, 50, 200, 200, 500);
    const box = required(s.container.querySelector('[data-redact-box-id]'), 'box');
    await act(async () => {
      box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mouseup'));
    });
    const resizer = required(box.querySelector('[data-editor-resizer="bottom-right"]'), 'resizer');
    await act(async () => {
      resizer.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }));
    });
    await act(async () => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 130, clientY: 180 }));
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
