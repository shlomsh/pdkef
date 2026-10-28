import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
import { DEFAULT_BLUR_STRENGTH } from '#editor/model/blurStrength.ts';
import { rememberAppStyle, getRecentWhiteoutColors, rememberRecentWhiteoutColor } from '#editor/workspace/preferenceStore.ts';
import { saveDraft } from '#lib/drafts/draftStore.ts';
import * as gestureController from '#lib/gestures/controller.ts';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { useRedactSuite, buildPdf, required, query, settleUntil, dragBlurSlider, setSelectedBoxColor, pageSampler } from '../../test/support/redactTool.tsx';

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

/** An earlier visit's saved work, written through the real saveDraft into the harness's IndexedDB. */
async function seedDraft(work: { elements: unknown[]; extra: Record<string, unknown> }): Promise<void> {
  const fileBytes = (await buildPdf(2)).slice().buffer;
  expect(await saveDraft('redact', { fileName: 'restored.pdf', fileType: 'application/pdf', fileBytes, ...work })).toBe(true);
}

describe('PdfRedactTool UI flow', () => {
  const { s, loadFileAndGetDrawArea, armTool, drawBox } = useRedactSuite({ Tool: PdfRedactTool, checking: CHECKING, gestureController, installToolHarness, waitUntil });

  it('RED-51: a newly drawn whiteout takes the page colour, not the remembered color', async () => {
    // RED-51: a new whiteout is auto (colorMode 'auto') and takes the page's colour, '#ffffff'
    // in jsdom where the canvas cannot be read. The remembered colour seeds the brush only.
    rememberAppStyle({ whiteoutColor: '#123456' });

    try {
      const drawArea = await loadFileAndGetDrawArea();
      await armTool('Whiteout');
      await drawBox(drawArea, 50, 200, 200, 500);

      const surface = s.container.querySelector('.redact-surface--whiteout');
      expect(surface).not.toBeNull();
      expect(surface.style.backgroundColor).toBe('rgb(255, 255, 255)');
    } finally {
      localStorage.clear();
    }
  });

  describe('RED-51: whiteout follows the page', () => {
    const CREAM = '#f7f1de';
    const BLUE = '#deebf7';
    const rgb = (hex: string) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
    // A drawn box sits at top 20%; the drag below moves it to 30%.
    const byGeometry = (_canvas: unknown, box: { top: number }) => (box.top < 20.5 ? CREAM : BLUE);

    beforeEach(() => {
      pageSampler.calls.length = 0;
      pageSampler.impl = byGeometry;
    });
    afterEach(() => {
      pageSampler.impl = () => null;
      pageSampler.calls.length = 0;
    });

    const surfaces = () => Array.from(s.container.querySelectorAll<HTMLElement>('.redact-surface--whiteout'));
    const surfaceColor = () => required(surfaces()[0], 'whiteout surface').style.backgroundColor;
    const autoPressed = () => query<HTMLElement>(s.container, '[data-editor-actions] [data-whiteout-color-auto]').getAttribute('aria-pressed');
    const announced = () => required(s.container.querySelector<HTMLElement>('.sr-only[aria-live="polite"]'), 'announcement region').textContent;

    async function selectBox(box: HTMLElement): Promise<void> {
      await act(async () => { box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true })); });
      await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });
    }
    async function drawWhiteoutAndSelect(): Promise<HTMLElement> {
      const drawArea = await loadFileAndGetDrawArea();
      await armTool('Whiteout');
      await drawBox(drawArea, 50, 200, 200, 500);
      await selectBox(query<HTMLElement>(s.container, '[data-redact-box-id]'));
      return drawArea;
    }
    // Drags the box body by (50, 100) px: 10% right, 10% down on the 500x1000 draw area.
    async function nudgeDown(): Promise<void> {
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      await act(async () => { box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true })); });
      await act(async () => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 100, bubbles: true })); });
      await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });
    }
    async function undo(): Promise<void> {
      await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); });
    }
    async function pressAuto(): Promise<void> {
      const auto = query<HTMLButtonElement>(s.container, '[data-editor-actions] [data-whiteout-color-auto]');
      await act(async () => { auto.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    }

    it('a drawn whiteout is auto and takes the colour sampled from its own page', async () => {
      await drawWhiteoutAndSelect();
      expect(surfaceColor()).toBe(rgb(CREAM));
      expect(autoPressed()).toBe('true');
      const pageCanvas = query<HTMLCanvasElement>(s.container, '[data-editor-page-card] canvas');
      const drawCall = required(pageSampler.calls[0], 'the draw-time sample');
      expect(drawCall.canvas).toBe(pageCanvas);
      expect(drawCall.box.left).toBeCloseTo(10);
      expect(drawCall.box.top).toBeCloseTo(20);
    });

    it('moving an auto whiteout re-samples it, and one Undo restores the position and the colour together', async () => {
      await drawWhiteoutAndSelect();
      const topBefore = parseFloat(query<HTMLElement>(s.container, '[data-redact-box-id]').style.top);
      await nudgeDown();
      expect(surfaceColor()).toBe(rgb(BLUE));
      expect(parseFloat(query<HTMLElement>(s.container, '[data-redact-box-id]').style.top)).toBeGreaterThan(topBefore);

      await undo();
      expect(surfaceColor()).toBe(rgb(CREAM));
      expect(parseFloat(query<HTMLElement>(s.container, '[data-redact-box-id]').style.top)).toBeCloseTo(topBefore);
      expect(announced()).toContain('Undid: Moved whiteout box');
      expect(announced()).not.toContain('color');
    });

    it('a picked colour makes the box custom: a later move keeps it and never asks the sampler', async () => {
      await drawWhiteoutAndSelect();
      await setSelectedBoxColor('#123456');
      expect(surfaceColor()).toBe(rgb('#123456'));
      expect(autoPressed()).toBe('false');

      pageSampler.calls.length = 0;
      await nudgeDown();
      expect(surfaceColor()).toBe(rgb('#123456'));
      expect(pageSampler.calls).toHaveLength(0);
    });

    it('Auto after a custom colour follows the page again, and one Undo brings the custom colour back', async () => {
      await drawWhiteoutAndSelect();
      await setSelectedBoxColor('#123456');
      // Style edits within half a second fold into one step (and a custom-then-Auto fold is no change at all).
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
      await pressAuto();
      expect(surfaceColor()).toBe(rgb(CREAM));
      expect(autoPressed()).toBe('true');

      await undo();
      expect(surfaceColor()).toBe(rgb('#123456'));
      expect(autoPressed()).toBe('false');
    });

    it('the eyedropper on a selected whiteout takes a page pixel as a custom colour, keeps the box selected and disarms', async () => {
      await drawWhiteoutAndSelect();
      const canvas = query<HTMLCanvasElement>(s.container, '[data-editor-page-card] canvas');
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150, x: 0, y: 0, toJSON: () => {} });
      canvas.getContext = (() => ({ getImageData: () => ({ data: new Uint8ClampedArray([10, 20, 30, 255]) }) })) as never;

      const eyedropper = query<HTMLButtonElement>(s.container, '[data-editor-actions] [data-whiteout-color-eyedropper]');
      await act(async () => { eyedropper.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(eyedropper.getAttribute('aria-pressed')).toBe('true');

      await act(async () => { canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, clientY: 40, bubbles: true, cancelable: true })); });
      // The click that follows a mouse pick must not deselect the box.
      await act(async () => { canvas.dispatchEvent(new MouseEvent('click', { clientX: 60, clientY: 40, bubbles: true, cancelable: true })); });

      expect(surfaceColor()).toBe(rgb('#0a141e'));
      expect(autoPressed()).toBe('false');
      expect(s.container.querySelector('[data-editor-actions]')).not.toBeNull();
      expect(query<HTMLElement>(s.container, '[data-editor-actions] [data-whiteout-color-eyedropper]').getAttribute('aria-pressed')).toBe('false');
    });

    describe('two pipettes', () => {
      const boxPipette = () => query<HTMLButtonElement>(s.container, '[data-editor-actions] [data-whiteout-color-eyedropper]');
      const brushPipette = () => query<HTMLButtonElement>(s.container, '[data-brush-controls] button[aria-label="Pick a colour from the page"]');
      const click = async (el: HTMLElement) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
      const brushSwatch = () => query<HTMLElement>(s.container, '[aria-label="Whiteout colour"] button[aria-pressed="true"]').style.getPropertyValue('--swatch');
      async function selectedBoxAndBrushArmed() {
        await drawWhiteoutAndSelect();
        const canvas = query<HTMLCanvasElement>(s.container, '[data-editor-page-card] canvas');
        canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150, x: 0, y: 0, toJSON: () => {} });
        canvas.getContext = (() => ({ getImageData: () => ({ data: new Uint8ClampedArray([10, 20, 30, 255]) }) })) as never;
        await armTool('Whiteout');
        const brushSegment = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[data-brush-controls] [role="radio"]')).find((b) => b.textContent === 'Brush'), 'Brush segment');
        await act(async () => { brushSegment.click(); });
        const before = brushSwatch();
        return { canvas, before };
      }
      async function pick(canvas: HTMLCanvasElement) {
        await act(async () => { canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: 60, clientY: 40, bubbles: true, cancelable: true })); });
        await act(async () => { canvas.dispatchEvent(new MouseEvent('click', { clientX: 60, clientY: 40, bubbles: true, cancelable: true })); });
      }

      it('with a box selected and the brush armed, the box pipette arms only itself and picks into the box', async () => {
        const { canvas, before } = await selectedBoxAndBrushArmed();
        await click(boxPipette());
        expect(boxPipette().getAttribute('aria-pressed')).toBe('true');
        expect(brushPipette().getAttribute('aria-pressed')).toBe('false');
        await pick(canvas);
        expect(surfaceColor()).toBe(rgb('#0a141e'));
        expect(autoPressed()).toBe('false');
        expect(brushPipette().getAttribute('aria-pressed')).toBe('false');
        // pickColor also remembers the colour as the default (existing behaviour), so the brush follows it.
        expect(before).toBe('#ffffff');
      });

      it('the brush pipette picks into the brush and leaves the box colour', async () => {
        const { canvas, before } = await selectedBoxAndBrushArmed();
        const boxColor = surfaceColor();
        await click(brushPipette());
        expect(brushPipette().getAttribute('aria-pressed')).toBe('true');
        expect(boxPipette().getAttribute('aria-pressed')).toBe('false');
        await pick(canvas);
        expect(surfaceColor()).toBe(boxColor);
        expect(brushSwatch()).not.toBe(before);
        // RED-53: the brush pick is remembered and offered as a recent tile on an auto whiteout.
        expect(getRecentWhiteoutColors()).toEqual(['#0a141e']);
        await click(boxPipette());
        await pressAuto();
        expect(autoPressed()).toBe('true');
        expect(query<HTMLElement>(s.container, '[data-editor-actions] [data-whiteout-color-recent="#0a141e"]')).not.toBeNull();
      });
    });

    it('the workspace carries data-pseudo-fullscreen only while pseudo full screen is on', async () => {
      await loadFileAndGetDrawArea();
      const workspace = () => query<HTMLElement>(s.container, '[data-redact-workspace-ready]');
      expect(workspace().hasAttribute('data-pseudo-fullscreen')).toBe(false);
      const toggle = (label: string) => required(s.container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"], button[title="${label}"]`), label);
      await act(async () => { toggle('Full screen').click(); });
      expect(workspace().hasAttribute('data-pseudo-fullscreen')).toBe(true);
      await act(async () => { toggle('Exit full screen').click(); });
      expect(workspace().hasAttribute('data-pseudo-fullscreen')).toBe(false);
    });

    it('a restored whiteout without a colour mode (an old draft) keeps its colour when moved, and is never sampled', async () => {
      await seedDraft({
        elements: [{ id: 'old-1', pageIndex: 0, type: 'whiteout', left: 10, top: 20, width: 30, height: 30, color: '#abcdef' }],
        extra: { actionHistory: [] },
      });
      s.container = document.createElement('div');
      document.body.appendChild(s.container);
      act(() => { render(<PdfRedactTool />, s.container); });
      await settleUntil('the restored whiteout', () => s.container.querySelector('[data-redact-box-id]') !== null);
      await selectBox(query<HTMLElement>(s.container, '[data-redact-box-id]'));
      expect(surfaceColor()).toBe(rgb('#abcdef'));

      pageSampler.calls.length = 0;
      await nudgeDown();
      expect(surfaceColor()).toBe(rgb('#abcdef'));
      expect(pageSampler.calls).toHaveLength(0);
    });

    it('a duplicate of an auto whiteout is sampled at its own position', async () => {
      await drawWhiteoutAndSelect();
      // Only the original's exact spot reads cream; anywhere else reads blue.
      pageSampler.impl = (_canvas, box) => (Math.abs(box.top - 20) < 0.01 && Math.abs(box.left - 10) < 0.01 ? CREAM : BLUE);
      const duplicate = query<HTMLButtonElement>(s.container, '[data-editor-actions] button[title="Duplicate"]');
      await act(async () => { duplicate.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

      const colors = surfaces().map((el) => el.style.backgroundColor);
      expect(colors).toEqual([rgb(CREAM), rgb(BLUE)]);
    });

    it('Every page on an auto whiteout samples each copy on its own page', async () => {
      s.harness.pdfjs.pageCountOfNextRead(3);
      await drawWhiteoutAndSelect();
      const pageColors = [CREAM, BLUE, '#e0f0e0'];
      const canvases = Array.from(s.container.querySelectorAll<HTMLCanvasElement>('[data-editor-page-card] canvas'));
      expect(canvases).toHaveLength(3);
      pageSampler.impl = (canvas) => pageColors[canvases.indexOf(canvas as HTMLCanvasElement)] ?? null;

      const repeat = query<HTMLButtonElement>(s.container, '[data-editor-actions] [data-editor-repeat-every-page]');
      await act(async () => { repeat.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

      const cards = Array.from(s.container.querySelectorAll('[data-editor-page-card]'));
      const copyColors = cards.slice(1).map((card) => query<HTMLElement>(card, '.redact-surface--whiteout').style.backgroundColor);
      expect(copyColors).toEqual([rgb(BLUE), rgb('#e0f0e0')]);
    });

    // RED-53: the toolbar offers the last custom colours, remembered across documents.
    it('RED-53: a custom pick is remembered; Auto and a move are not', async () => {
      await drawWhiteoutAndSelect();
      expect(getRecentWhiteoutColors()).toEqual([]);
      await pressAuto();
      await nudgeDown();
      expect(getRecentWhiteoutColors()).toEqual([]);
      await setSelectedBoxColor('#112233');
      expect(getRecentWhiteoutColors()).toEqual(['#112233']);
    });

    it('RED-53: a mount reads the stored list into an auto whiteout toolbar', async () => {
      rememberRecentWhiteoutColor('#abcdef', []);
      await drawWhiteoutAndSelect();
      expect(autoPressed()).toBe('true');
      expect(query<HTMLElement>(s.container, '[data-editor-actions] [data-whiteout-color-recent="#abcdef"]')).not.toBeNull();
    });

    it('RED-53: a pick merges another tab\'s stored colour and the toolbar shows both', async () => {
      await drawWhiteoutAndSelect();
      rememberRecentWhiteoutColor('#abcdef', []); // another tab writes after this one mounted
      await setSelectedBoxColor('#112233');
      const tiles = Array.from(s.container.querySelectorAll<HTMLElement>('[data-editor-actions] [data-whiteout-color-recent]'));
      expect(tiles.map((t) => t.getAttribute('data-whiteout-color-recent'))).toEqual(['#112233', '#abcdef']);
      expect(getRecentWhiteoutColors()).toEqual(['#112233', '#abcdef']);
    });

    it('RED-53: a pick on one box is offered as a recent colour on another auto box', async () => {
      const drawArea = await drawWhiteoutAndSelect();
      await setSelectedBoxColor('#112233');
      await armTool('Whiteout');
      await drawBox(drawArea, 50, 600, 200, 800);
      const boxes = Array.from(s.container.querySelectorAll<HTMLElement>('[data-redact-box-id]'));
      expect(boxes).toHaveLength(2);
      await selectBox(required(boxes[1], 'second box'));
      expect(autoPressed()).toBe('true');
      expect(query<HTMLElement>(s.container, '[data-editor-actions] [data-whiteout-color-recent="#112233"]')).not.toBeNull();
    });
  });

  describe('RED-40: whiteout colour and blur strength are per-document style', () => {
    // A restored document keeps what its owner chose; a fresh one starts from the app-wide style.
    async function mountRestored(carried: Record<string, unknown>): Promise<HTMLElement> {
      await seedDraft({ elements: [], extra: { actionHistory: [], carried } });
      s.container = document.createElement('div');
      document.body.appendChild(s.container);
      act(() => { render(<PdfRedactTool />, s.container); });
      await settleUntil('the restored draft to open', () => s.container.querySelector('.redact-draw-area') !== null);
      const drawArea = query<HTMLElement>(s.container, '.redact-draw-area');
      drawArea.getBoundingClientRect = () => ({
        left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON: () => {},
      });
      return drawArea;
    }

    it('a restored document still draws whiteout in the page colour (auto), not its remembered one', async () => {
      rememberAppStyle({ whiteoutColor: '#00ff00' });
      const drawArea = await mountRestored({ whiteoutColor: '#ff0000' });
      await armTool('Whiteout');
      await drawBox(drawArea, 50, 200, 200, 500);
      const surface = query<HTMLElement>(s.container, '.redact-surface--whiteout');
      expect(surface.style.backgroundColor).toBe('rgb(255, 255, 255)');
    });

    it('a fresh document draws whiteout in the page colour (auto), not the app-wide one', async () => {
      rememberAppStyle({ whiteoutColor: '#00ff00' });
      const drawArea = await loadFileAndGetDrawArea();
      await armTool('Whiteout');
      await drawBox(drawArea, 50, 200, 200, 500);
      const surface = query<HTMLElement>(s.container, '.redact-surface--whiteout');
      expect(surface.style.backgroundColor).toBe('rgb(255, 255, 255)');
    });

    it('a restored document draws blur at its own strength, not the app-wide one', async () => {
      rememberAppStyle({ blurStrength: 0.5 });
      const drawArea = await mountRestored({ blurStrength: 0.2 });
      await armTool('Blur');
      await drawBox(drawArea, 50, 200, 200, 500);
      const layer = query<HTMLElement>(s.container, '.redact-surface__blur');
      expect(layer.style.backdropFilter).toContain('blur(calc(0.2 * 100cqh))');
    });

    it('a fresh document draws blur at the app-wide strength', async () => {
      rememberAppStyle({ blurStrength: 0.5 });
      const drawArea = await loadFileAndGetDrawArea();
      await armTool('Blur');
      await drawBox(drawArea, 50, 200, 200, 500);
      const layer = query<HTMLElement>(s.container, '.redact-surface__blur');
      expect(layer.style.backdropFilter).toContain('blur(calc(0.5 * 100cqh))');
    });
  });

  // --- Regression: whiteout box resize flying off-page (handleBoxResizeStart) ---
  //
  // Root cause: handleBoxResizeStart's left/top/top-left/bottom-left/top-right
  // branches derived newLeft/newTop as `start.left - (newWidth - start.width)`
  // where newWidth/newHeight were only clamped against MIN/MAX_SHAPE_SIZE_PCT,
  // never against the box's own anchored (opposite) edge. A large outward drag
  // on e.g. the left handle drives newWidth up to MAX_SHAPE_SIZE_PCT (90) with
  // no regard for how much room is actually left between the anchored right
  // edge and the page edge, so newLeft goes negative and the box renders off
  // the left/top of the page (effectively "disappears").
  //
  // These tests use the SAME realistic, non-degenerate mocked wrapper rect
  // (500x1000, via loadFileAndGetDrawArea's drawArea.getBoundingClientRect
  // override — that draw area IS the resize handler's `wrapper`, since both
  // `sign-page-wrapper` and `redact-draw-area` are classes on one DOM node) as
  // the existing tests above, per CLAUDE.md Part II §5's "vacuous 0x0-rect
  // geometry tests" hazard: an unmocked jsdom rect is 0x0, which turns every
  // pixel delta into +/-Infinity and saturates the MIN/MAX clamp either way,
  // masking exactly this class of bug. With a real 500x1000 rect, the drag
  // distances below map to finite, checkable percentages and genuinely
  // exercise the anchor math.
  describe('whiteout box resize stays on-page (regression)', () => {
    async function setupSelectedWhiteoutBox() {
      const drawArea = await loadFileAndGetDrawArea();

      // Switch to whiteout mode — all redaction box styles now get the
      // 8-direction ElementResizers handles.
      const whiteoutBtn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((btn) => btn.textContent.includes('Whiteout')), 'Whiteout button');
      await act(async () => {
        whiteoutBtn.click();
      });

      // Draw a box at left=20%, top=30%, width=30%, height=20% on the 500x1000
      // wrapper (100,300) -> (250,500) in px. Mirrors the diagnosed repro
      // (left:20, width:30).
      await drawBox(drawArea, 100, 300, 250, 500);
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      expect(parseFloat(box.style.left)).toBeCloseTo(20);
      expect(parseFloat(box.style.top)).toBeCloseTo(30);
      expect(parseFloat(box.style.width)).toBeCloseTo(30);
      expect(parseFloat(box.style.height)).toBeCloseTo(20);

      // Select it (mousedown + immediate mouseup, zero delta) so ElementResizers
      // renders its handles — they're gated on isSelected/isActive.
      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      return box;
    }

    async function dragHandle(box: HTMLElement, handleClass: string, downX: number, downY: number, moveX: number, moveY: number): Promise<void> {
      const handle = query<HTMLElement>(box, `[data-editor-resizer="${handleClass}"]`);
      expect(handle).not.toBeNull();
      await act(async () => {
        handle.dispatchEvent(new MouseEvent('mousedown', { clientX: downX, clientY: downY, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: moveX, clientY: moveY, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
    }

    it('left-handle resize with a large outward drag keeps left >= 0 and preserves the anchored right edge', async () => {
      const box = await setupSelectedWhiteoutBox();

      // dx = -500px on a 500px-wide wrapper = -100% — a huge outward drag on
      // the left handle. Anchored right edge is at left+width = 20+30 = 50%.
      await dragHandle(box, 'left', 300, 0, -200, 0);

      const committedLeft = parseFloat(box.style.left);
      const committedWidth = parseFloat(box.style.width);

      expect(committedLeft).toBeGreaterThanOrEqual(0);
      expect(committedLeft + committedWidth).toBeCloseTo(50, 5);
    });

    it('top-handle resize with a large outward drag keeps top >= 0 and preserves the anchored bottom edge', async () => {
      const box = await setupSelectedWhiteoutBox();

      // dy = -900px on a 1000px-tall wrapper = -90% — a huge outward drag on
      // the top handle. Anchored bottom edge is at top+height = 30+20 = 50%.
      await dragHandle(box, 'top', 0, 300, 0, -600);

      const committedTop = parseFloat(box.style.top);
      const committedHeight = parseFloat(box.style.height);

      expect(committedTop).toBeGreaterThanOrEqual(0);
      expect(committedTop + committedHeight).toBeCloseTo(50, 5);
    });

    it('top-left corner resize with a large outward drag keeps both left >= 0 and top >= 0 (box stays on page)', async () => {
      const box = await setupSelectedWhiteoutBox();

      await dragHandle(box, 'top-left', 300, 300, -200, -600);

      const committedLeft = parseFloat(box.style.left);
      const committedTop = parseFloat(box.style.top);

      expect(committedLeft).toBeGreaterThanOrEqual(0);
      expect(committedTop).toBeGreaterThanOrEqual(0);
    });

    it('sanity: right-handle resize still grows the box normally and never moves left/top', async () => {
      const box = await setupSelectedWhiteoutBox();

      // Modest +50px (10%) growth, well within bounds — no clamp should
      // engage at all, on either the old or fixed code path.
      await dragHandle(box, 'right', 0, 0, 50, 0);

      expect(parseFloat(box.style.left)).toBeCloseTo(20);
      expect(parseFloat(box.style.top)).toBeCloseTo(30);
      expect(parseFloat(box.style.width)).toBeCloseTo(40);
      expect(parseFloat(box.style.height)).toBeCloseTo(20);
    });

    // Design review: blackout and blur used to carry their own inline red
    // "corner" delete button, positioned and styled differently from
    // whiteout's floating toolbar. All three types now share one selection
    // chrome (RedactBoxToolbar via RedactBox's `[data-editor-actions]`
    // wrapper), so these three tests assert the same thing per type instead
    // of a whiteout-only one and two blackout/blur-only ones with different
    // assertions.
    it('whiteout shows the shared floating toolbar, with a delete control, only once selected', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      const whiteoutBtn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((btn) => btn.textContent.includes('Whiteout')), 'Whiteout button');
      await act(async () => {
        whiteoutBtn.click();
      });
      await drawBox(drawArea, 100, 300, 250, 500);
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');

      expect(box.querySelector('[data-editor-actions]')).toBeNull();

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(box.hasAttribute('data-editor-shape')).toBe(true);
      expect(box.querySelector('[data-editor-resizer="top-right"]')).not.toBeNull();
      expect(box.querySelector('[data-editor-actions] button[title="Delete"]')).not.toBeNull();
    });

    it('a click anywhere outside the selected box drops the selection, a click on the box keeps it', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      const select = async () => {
        await act(async () => {
          box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
        });
        await act(async () => {
          window.dispatchEvent(new MouseEvent('mouseup'));
        });
      };

      await select();
      await act(async () => {
        box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(box.querySelector('[data-editor-actions]')).not.toBeNull();

      // Outside the pages entirely: the page's surroundings, not blank page area.
      await act(async () => {
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(box.querySelector('[data-editor-actions]')).toBeNull();

      await select();
      const header = query<HTMLElement>(s.container, '[data-editor-page-header]');
      await act(async () => {
        header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(box.querySelector('[data-editor-actions]')).toBeNull();
    });

    it('blackout shows the shared floating toolbar, with a delete control, only once selected', async () => {
      const drawArea = await loadFileAndGetDrawArea();

      // Default activeStyle is 'blackout'.
      await drawBox(drawArea, 50, 200, 200, 500);

      const box = s.container.querySelector('[data-redact-box-id]');
      expect(box).not.toBeNull();
      expect(box.querySelector('[data-editor-actions]')).toBeNull();

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(box.hasAttribute('data-editor-shape')).toBe(true);
      expect(box.querySelectorAll('[data-editor-resizer]').length).toBe(8);
      expect(box.querySelector('[data-editor-actions] button[title="Delete"]')).not.toBeNull();
      // No per-element colour control for blackout/blur - only whiteout gets
      // one, so the toolbar holds exactly its three shared buttons (duplicate,
      // repeat-on-every-page since this mock document has more than one page,
      // delete) and nothing else.
      expect(box.querySelectorAll('[data-editor-actions] button').length).toBe(3);
    });

    it('blur shows the shared floating toolbar, with a delete control, only once selected', async () => {
      const drawArea = await loadFileAndGetDrawArea();

      const blurBtn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((btn) => btn.textContent.includes('Blur')), 'Blur button');
      await act(async () => {
        blurBtn.click();
      });

      await drawBox(drawArea, 50, 200, 200, 500);

      const box = s.container.querySelector('[data-redact-box-id]');
      expect(box).not.toBeNull();
      expect(box.querySelector('[data-editor-actions]')).toBeNull();

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(box.hasAttribute('data-editor-shape')).toBe(true);
      expect(box.querySelectorAll('[data-editor-resizer]').length).toBe(8);
      expect(box.querySelector('[data-editor-actions] button[title="Delete"]')).not.toBeNull();
      // Blur additionally gets its strength slider (RED-30), which is a range
      // input, not a button: its buttons are blackout's duplicate/repeat/delete trio.
      expect(box.querySelector('[data-editor-actions] [data-editor-blur-strength-input]')).not.toBeNull();
      expect(box.querySelectorAll('[data-editor-actions] button').length).toBe(3);
    });

    it('SITE-41: picking a strength from a selected blur box\'s toolbar applies it and remembers it, and undo restores the previous strength and redo reapplies it', async () => {
      const drawArea = await loadFileAndGetDrawArea();

      const blurBtn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((btn) => btn.textContent.includes('Blur')), 'Blur button');
      await act(async () => {
        blurBtn.click();
      });

      await drawBox(drawArea, 50, 200, 200, 500);

      const box = required(s.container.querySelector('[data-redact-box-id]'), 'blur box');

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      await dragBlurSlider(0.22, [0.1, 0.2]);

      const blurLayer = required(box.querySelector<HTMLElement>('.redact-surface__blur'), 'blur layer');
      expect(blurLayer.style.backdropFilter).toContain('blur(calc(0.22 * 100cqh))');

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      // DEFAULT_BLUR_STRENGTH, so undo restores the box's original,
      // unpicked strength to that, not 0.22.
      expect(blurLayer.style.backdropFilter).toContain(`blur(calc(${DEFAULT_BLUR_STRENGTH} * 100cqh))`);

      // Redo brings the picked strength back.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
      });
      expect(blurLayer.style.backdropFilter).toContain('blur(calc(0.22 * 100cqh))');
    });

    it('SITE-41: a newly drawn blur box picks up the last-chosen strength', async () => {
      const drawArea = await loadFileAndGetDrawArea();

      const blurBtn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((btn) => btn.textContent.includes('Blur')), 'Blur button');
      await act(async () => { blurBtn.click(); });

      await drawBox(drawArea, 50, 200, 200, 500);
      const firstBox = required(s.container.querySelector('[data-redact-box-id]'), 'first blur box');

      await act(async () => {
        firstBox.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });

      await dragBlurSlider(0.22);

      await act(async () => { blurBtn.click(); });
      await drawBox(drawArea, 50, 550, 200, 700);
      const boxes = s.container.querySelectorAll('[data-redact-box-id]');
      const secondBox = boxes[boxes.length - 1] as HTMLElement;
      const secondBlurLayer = required(secondBox.querySelector<HTMLElement>('.redact-surface__blur'), 'second blur layer');

      expect(secondBlurLayer.style.backdropFilter).toContain('blur(calc(0.22 * 100cqh))');
    });

    // --- E1.5: generalize the whiteout-resize post-mortem's three gesture
    // invariants (TODO.md) to this second, independent implementation of the
    // same math (handleBoxResizeStart/handleBoxDragStart in PdfRedactTool.tsx
    // — see its own comment there noting it mirrors DraggableWrapper.tsx's
    // handleResizeMove; CLAUDE.md Part II's E4.3 backlog item is to converge
    // these two copies, which is exactly why this file needs its own
    // coverage rather than relying on the Sign tool's tests). Move already
    // has basic coverage above ("drags an existing box..."); these add the
    // move width/height-untouched invariant plus the zero-delta no-op. ---
    it('move: dragging the box body by a delta leaves width/height untouched (E1.5 move invariant)', async () => {
      const box = await setupSelectedWhiteoutBox();
      const startWidth = parseFloat(box.style.width);
      const startHeight = parseFloat(box.style.height);

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 100, bubbles: true })); // +10% / +10%
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      expect(parseFloat(box.style.left)).toBeCloseTo(30); // 20 + 10
      expect(parseFloat(box.style.top)).toBeCloseTo(40); // 30 + 10
      expect(parseFloat(box.style.width)).toBeCloseTo(startWidth);
      expect(parseFloat(box.style.height)).toBeCloseTo(startHeight);
    });

    it('a zero-delta resize commits exactly the start geometry, with no drift (E1.5 zero-delta invariant)', async () => {
      const box = await setupSelectedWhiteoutBox();
      const startLeft = parseFloat(box.style.left);
      const startTop = parseFloat(box.style.top);
      const startWidth = parseFloat(box.style.width);
      const startHeight = parseFloat(box.style.height);

      await dragHandle(box, 'bottom-right', 200, 200, 200, 200);

      expect(parseFloat(box.style.left)).toBeCloseTo(startLeft);
      expect(parseFloat(box.style.top)).toBeCloseTo(startTop);
      expect(parseFloat(box.style.width)).toBeCloseTo(startWidth);
      expect(parseFloat(box.style.height)).toBeCloseTo(startHeight);
    });
  });
});
