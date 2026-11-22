import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
import { DEFAULT_BLUR_STRENGTH } from '#editor/model/blurStrength.ts';
import { rememberAppStyle, getRecentWhiteoutColors, rememberRecentWhiteoutColor } from '#editor/workspace/preferenceStore.ts';
import { saveDraft } from '#lib/drafts/draftStore.ts';
import { startGesture } from '#lib/gestures/controller.ts';
import { sampleRingColor } from '#editor-ui/whiteout/pageSampling.ts';
import { getPdfLib } from '#lib/pdf/pdfLib.js';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { useRedactSuite, buildPdf, makePdfFile, required, query, settleUntil, dragBlurSlider, setSelectedBoxColor, clientPoint, centerOf, percentOn, FRAME } from '../../test/support/redactTool.browser.tsx';

answerNetwork();

vi.mock('#lib/gestures/controller.ts', { spy: true });
vi.mock('#editor-ui/whiteout/pageSampling.ts', { spy: true });
const { startGesture: realStartGesture } = await vi.importActual<typeof import('#lib/gestures/controller.ts')>('#lib/gestures/controller.ts');

/** An earlier visit's saved work, written through the real saveDraft into the browser's IndexedDB. */
async function seedDraft(work: { elements: unknown[]; extra: Record<string, unknown> }): Promise<void> {
  const fileBytes = (await buildPdf(2)).slice().buffer;
  expect(await saveDraft('redact', { fileName: 'restored.pdf', fileType: 'application/pdf', fileBytes, ...work })).toBe(true);
}

type Band = { from: number; to: number; hex: string };

/** A real PDF whose page i is painted in full-width bands (`from`..`to` are fractions of the page height, from the top). */
async function paintedPdf(pages: Band[][]): Promise<File> {
  const { PDFDocument, rgb } = await getPdfLib();
  const doc = await PDFDocument.create({ updateMetadata: false });
  for (const bands of pages) {
    const sheet = doc.addPage([612, 792]);
    for (const { from, to, hex } of bands) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      sheet.drawRectangle({ x: 0, y: 792 * (1 - to), width: 612, height: 792 * (to - from), color: rgb(r, g, b) });
    }
  }
  return makePdfFile('painted.pdf', await doc.save());
}

const paintedCanvases = new Set<EventTarget | null>();
let paintWaiters: { count: number; resolve: () => void }[] = [];
const notePainted = (event: Event) => {
  paintedCanvases.add(event.target);
  paintWaiters.filter((w) => paintedCanvases.size >= w.count).forEach((w) => w.resolve());
  paintWaiters = paintWaiters.filter((w) => paintedCanvases.size < w.count);
};

/** Resolves once `count` page canvases have finished a real pdf.js paint, so a colour read off one is the page's own. */
const pagesPainted = (count: number) => new Promise<void>((resolve) => {
  if (paintedCanvases.size >= count) resolve();
  else paintWaiters.push({ count, resolve });
});

describe('PdfRedactTool UI flow', () => {
  const { s, loadFileAndGetDrawArea, armTool, hoverBrushTool, drawBox } = useRedactSuite({ Tool: PdfRedactTool, checking: CHECKING, gestureEntry: { spy: startGesture, real: realStartGesture }, installToolHarness: installBrowserToolHarness, waitUntil });
  beforeEach(() => {
    paintedCanvases.clear();
    paintWaiters = [];
    document.addEventListener('page-painted', notePainted);
  });
  afterEach(() => {
    document.removeEventListener('page-painted', notePainted);
  });
  const loadPainted = async (file?: File, pages = 2) => {
    const drawArea = await loadFileAndGetDrawArea(file);
    await pagesPainted(pages);
    return drawArea;
  };
  const areaOf = () => query<HTMLElement>(s.container, '.redact-draw-area');

  it('RED-51: a newly drawn whiteout takes the page colour, not the remembered color', async () => {
    rememberAppStyle({ whiteoutColor: '#123456' });

    try {
      const drawArea = await loadPainted();
      await armTool('Whiteout');
      await drawBox(drawArea, 50, 200, 200, 500);

      const surface = query<HTMLElement>(s.container, '.redact-surface--whiteout');
      expect(surface.style.backgroundColor).toBe('rgb(255, 255, 255)');
    } finally {
      localStorage.clear();
    }
  });

  describe('RED-51: whiteout follows the page', () => {
    const CREAM = '#f7f1de';
    const BLUE = '#deebf7';
    const rgb = (hex: string) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
    const TWO_TONE = [[{ from: 0, to: 0.55, hex: CREAM }, { from: 0.55, to: 1, hex: BLUE }]];

    const surfaces = () => Array.from(s.container.querySelectorAll<HTMLElement>('.redact-surface--whiteout'));
    const surfaceColor = () => required(surfaces()[0], 'whiteout surface').style.backgroundColor;
    const autoPressed = () => query<HTMLElement>(s.container, '[data-editor-actions] [data-whiteout-color-auto]').getAttribute('aria-pressed');
    const announced = () => required(s.container.querySelector<HTMLElement>('.sr-only[aria-live="polite"]'), 'announcement region').textContent;

    async function selectBox(box: HTMLElement): Promise<void> {
      await act(async () => { box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(areaOf(), 0, 0), bubbles: true })); });
      await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });
    }
    async function drawWhiteoutAndSelect(pages: Band[][] = TWO_TONE, box: [number, number, number, number] = [50, 200, 200, 500]): Promise<HTMLElement> {
      const drawArea = await loadPainted(await paintedPdf(pages), pages.length);
      await armTool('Whiteout');
      await drawBox(drawArea, ...box);
      await selectBox(query<HTMLElement>(s.container, '[data-redact-box-id]'));
      return drawArea;
    }
    // Drags the box body by (50, 400) of the 500x1000 frame: 10% right, 40% down, from the cream half to the blue half.
    async function nudgeDown(): Promise<void> {
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      await act(async () => { box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(areaOf(), 0, 0), bubbles: true })); });
      await act(async () => { window.dispatchEvent(new MouseEvent('mousemove', { ...clientPoint(areaOf(), 50, 400), bubbles: true })); });
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

      vi.mocked(sampleRingColor).mockClear();
      await nudgeDown();
      expect(surfaceColor()).toBe(rgb('#123456'));
      expect(sampleRingColor).not.toHaveBeenCalled();
    });

    it('Auto after a custom colour follows the page again, and one Undo brings the custom colour back', async () => {
      await drawWhiteoutAndSelect();
      await setSelectedBoxColor('#123456');
      // Style edits within half a second fold into one step (and a custom-then-Auto fold is no change at all).
      // COALESCE_WINDOW_MS is 500, stamped with Date.now() in actionHistory.ts: move the clock past it.
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(Date.now() + 550);
        await pressAuto();
        expect(surfaceColor()).toBe(rgb(CREAM));
        expect(autoPressed()).toBe('true');

        await undo();
        expect(surfaceColor()).toBe(rgb('#123456'));
        expect(autoPressed()).toBe('false');
      } finally {
        vi.useRealTimers();
      }
    });

    it('the eyedropper on a selected whiteout takes a page pixel as a custom colour, keeps the box selected and disarms', async () => {
      await drawWhiteoutAndSelect();
      const canvas = query<HTMLCanvasElement>(s.container, '[data-editor-page-card] canvas');

      const eyedropper = query<HTMLButtonElement>(s.container, '[data-editor-actions] [data-whiteout-color-eyedropper]');
      await act(async () => { eyedropper.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(eyedropper.getAttribute('aria-pressed')).toBe('true');

      await act(async () => { canvas.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(canvas, 250, 800), bubbles: true, cancelable: true })); });
      // The click that follows a mouse pick must not deselect the box.
      await act(async () => { canvas.dispatchEvent(new MouseEvent('click', { ...clientPoint(canvas, 250, 800), bubbles: true, cancelable: true })); });

      expect(surfaceColor()).toBe(rgb(BLUE));
      expect(autoPressed()).toBe('false');
      expect(s.container.querySelector('[data-editor-actions]')).not.toBeNull();
      expect(query<HTMLElement>(s.container, '[data-editor-actions] [data-whiteout-color-eyedropper]').getAttribute('aria-pressed')).toBe('false');
    });

    describe('two pipettes', () => {
      const boxPipette = () => query<HTMLButtonElement>(s.container, '[data-editor-actions] [data-whiteout-color-eyedropper]');
      const brushPipette = () => query<HTMLButtonElement>(document.body, '[data-brush-controls] button[aria-label="Pick a colour from the page"]');
      const click = async (el: HTMLElement) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
      const brushSwatch = () => query<HTMLElement>(document.body, '[data-brush-controls] [aria-label="Whiteout colour"] button[aria-pressed="true"]').style.getPropertyValue('--swatch');
      async function selectedBoxAndBrushArmed() {
        await drawWhiteoutAndSelect();
        const canvas = query<HTMLCanvasElement>(s.container, '[data-editor-page-card] canvas');
        await hoverBrushTool('Whiteout');
        const brushSegment = required(Array.from(document.querySelectorAll<HTMLButtonElement>('[data-brush-controls] [role="radio"]')).find((b) => b.textContent === 'Brush'), 'Brush segment');
        await act(async () => { brushSegment.click(); });
        const before = brushSwatch();
        return { canvas, before };
      }
      async function pick(canvas: HTMLCanvasElement) {
        await act(async () => { canvas.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(canvas, 250, 800), bubbles: true, cancelable: true })); });
        await act(async () => { canvas.dispatchEvent(new MouseEvent('click', { ...clientPoint(canvas, 250, 800), bubbles: true, cancelable: true })); });
      }

      it('with a box selected and the brush armed, the box pipette arms only itself and picks into the box', async () => {
        const { canvas, before } = await selectedBoxAndBrushArmed();
        await click(boxPipette());
        expect(boxPipette().getAttribute('aria-pressed')).toBe('true');
        expect(brushPipette().getAttribute('aria-pressed')).toBe('false');
        await pick(canvas);
        expect(surfaceColor()).toBe(rgb(BLUE));
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
        expect(getRecentWhiteoutColors()).toEqual([BLUE]);
        await click(boxPipette());
        await pressAuto();
        expect(autoPressed()).toBe('true');
        expect(query<HTMLElement>(s.container, `[data-editor-actions] [data-whiteout-color-recent="${BLUE}"]`)).not.toBeNull();
      });
    });

    it('the workspace carries data-pseudo-fullscreen only while pseudo full screen is on', async () => {
      // forced: a browser with no element full screen (iPhone Safari), where the tool draws its own; read once, by the first press (workspaceFullscreen.ts:36)
      vi.spyOn(Document.prototype, 'fullscreenEnabled', 'get').mockReturnValueOnce(false);
      await loadPainted();
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
      await pagesPainted(2);
      await selectBox(query<HTMLElement>(s.container, '[data-redact-box-id]'));
      expect(surfaceColor()).toBe(rgb('#abcdef'));

      vi.mocked(sampleRingColor).mockClear();
      await nudgeDown();
      expect(surfaceColor()).toBe(rgb('#abcdef'));
      expect(sampleRingColor).not.toHaveBeenCalled();
    });

    it('a duplicate of an auto whiteout is sampled at its own position', async () => {
      // A short, wide box at top 20%: its ring sits in the cream band, and the copy's, nudged 4% down, in the blue one.
      await drawWhiteoutAndSelect([[{ from: 0, to: 0.23, hex: CREAM }, { from: 0.23, to: 1, hex: BLUE }]], [50, 200, 250, 220]);
      const duplicate = query<HTMLButtonElement>(s.container, '[data-editor-actions] button[title="Duplicate"]');
      await act(async () => { duplicate.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

      const colors = surfaces().map((el) => el.style.backgroundColor);
      expect(colors).toEqual([rgb(CREAM), rgb(BLUE)]);
    });

    it('Every page on an auto whiteout samples each copy on its own page', async () => {
      await drawWhiteoutAndSelect([CREAM, BLUE, '#e0f0e0'].map((hex) => [{ from: 0, to: 1, hex }]));

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
      await pagesPainted(2);
      return areaOf();
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
      const drawArea = await loadPainted();
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
      expect(layer.style.backdropFilter).toContain('blur(calc(20cqh))');
    });

    it('a fresh document draws blur at the app-wide strength', async () => {
      rememberAppStyle({ blurStrength: 0.5 });
      const drawArea = await loadPainted();
      await armTool('Blur');
      await drawBox(drawArea, 50, 200, 200, 500);
      const layer = query<HTMLElement>(s.container, '.redact-surface__blur');
      expect(layer.style.backdropFilter).toContain('blur(calc(50cqh))');
    });
  });

  // --- Regression: whiteout box resize flying off-page (handleBoxResizeStart) ---
  //
  // Root cause: handleBoxResizeStart's left/top/top-left/bottom-left/top-right branches derived
  // newLeft/newTop from newWidth/newHeight clamped only against MIN/MAX_SHAPE_SIZE_PCT, never against the
  // anchored (opposite) edge, so a large outward drag put the box off the page.
  //
  // These tests run on the draw area's real box, so every pixel delta maps to a finite percentage.
  describe('whiteout box resize stays on-page (regression)', () => {
    // Where the drawn box must sit, from the two whole-pixel points the drag dispatched.
    let drawn = { left: 0, top: 0, width: 0, height: 0 };

    async function setupSelectedWhiteoutBox() {
      const drawArea = await loadPainted();

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
      const from = percentOn(drawArea, clientPoint(drawArea, 100, 300));
      const to = percentOn(drawArea, clientPoint(drawArea, 250, 500));
      drawn = { left: from.x, top: from.y, width: to.x - from.x, height: to.y - from.y };
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      expect(parseFloat(box.style.left)).toBeCloseTo(drawn.left);
      expect(parseFloat(box.style.top)).toBeCloseTo(drawn.top);
      expect(parseFloat(box.style.width)).toBeCloseTo(drawn.width);
      expect(parseFloat(box.style.height)).toBeCloseTo(drawn.height);

      // Select it (mousedown + immediate mouseup, zero delta) so ElementResizers
      // renders its handles — they're gated on isSelected/isActive.
      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(areaOf(), 0, 0), bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      return box;
    }

    const exactPercent = (el: HTMLElement, property: string) => (el.attributeStyleMap.get(property) as CSSUnitValue).value;

    async function dragHandle(box: HTMLElement, handleClass: string, downX: number, downY: number, moveX: number, moveY: number) {
      const handle = query<HTMLElement>(box, `[data-editor-resizer="${handleClass}"]`);
      expect(handle).not.toBeNull();
      // The press lands on the handle itself (the tool picks the nearest handle to the pointer); the drag is (moveX - downX, moveY - downY) of the frame.
      const area = areaOf().getBoundingClientRect();
      const down = centerOf(handle);
      const move = { clientX: down.clientX + Math.round(((moveX - downX) / FRAME.width) * area.width), clientY: down.clientY + Math.round(((moveY - downY) / FRAME.height) * area.height) };
      await act(async () => {
        handle.dispatchEvent(new MouseEvent('mousedown', { ...down, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mousemove', { ...move, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
      return { dx: ((move.clientX - down.clientX) / area.width) * 100, dy: ((move.clientY - down.clientY) / area.height) * 100 };
    }

    it('left-handle resize with a large outward drag keeps left >= 0 and preserves the anchored right edge', async () => {
      const box = await setupSelectedWhiteoutBox();

      // dx = -500px on a 500px-wide wrapper = -100% — a huge outward drag on
      // the left handle. Anchored right edge is at left+width = 20+30 = 50%.
      await dragHandle(box, 'left', 300, 0, -200, 0);

      const committedLeft = exactPercent(box, 'left');
      const committedWidth = exactPercent(box, 'width');

      expect(committedLeft).toBeGreaterThanOrEqual(0);
      expect(committedLeft + committedWidth).toBeCloseTo(drawn.left + drawn.width, 5);
    });

    it('top-handle resize with a large outward drag keeps top >= 0 and preserves the anchored bottom edge', async () => {
      const box = await setupSelectedWhiteoutBox();

      // dy = -900px on a 1000px-tall wrapper = -90% — a huge outward drag on
      // the top handle. Anchored bottom edge is at top+height = 30+20 = 50%.
      await dragHandle(box, 'top', 0, 300, 0, -600);

      const committedTop = exactPercent(box, 'top');
      const committedHeight = exactPercent(box, 'height');

      expect(committedTop).toBeGreaterThanOrEqual(0);
      expect(committedTop + committedHeight).toBeCloseTo(drawn.top + drawn.height, 5);
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
      const { dx } = await dragHandle(box, 'right', 0, 0, 50, 0);

      expect(parseFloat(box.style.left)).toBeCloseTo(drawn.left);
      expect(parseFloat(box.style.top)).toBeCloseTo(drawn.top);
      expect(parseFloat(box.style.width)).toBeCloseTo(drawn.width + dx);
      expect(parseFloat(box.style.height)).toBeCloseTo(drawn.height);
    });

    // Design review: blackout and blur used to carry their own inline red
    // "corner" delete button, positioned and styled differently from
    // whiteout's floating toolbar. All three types now share one selection
    // chrome (RedactBoxToolbar via RedactBox's `[data-editor-actions]`
    // wrapper), so these three tests assert the same thing per type instead
    // of a whiteout-only one and two blackout/blur-only ones with different
    // assertions.
    it('whiteout shows the shared floating toolbar, with a delete control, only once selected', async () => {
      const drawArea = await loadPainted();
      const whiteoutBtn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((btn) => btn.textContent.includes('Whiteout')), 'Whiteout button');
      await act(async () => {
        whiteoutBtn.click();
      });
      await drawBox(drawArea, 100, 300, 250, 500);
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');

      expect(box.querySelector('[data-editor-actions]')).toBeNull();

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(areaOf(), 0, 0), bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(box.hasAttribute('data-editor-shape')).toBe(true);
      expect(box.querySelector('[data-editor-resizer="top-right"]')).not.toBeNull();
      expect(box.querySelector('[data-editor-actions] button[title="Delete"]')).not.toBeNull();
    });

    it('a click anywhere outside the selected box drops the selection, a click on the box keeps it', async () => {
      const drawArea = await loadPainted();
      await drawBox(drawArea, 50, 200, 200, 500);
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      const select = async () => {
        await act(async () => {
          box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(areaOf(), 0, 0), bubbles: true }));
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
      const drawArea = await loadPainted();

      // Default activeStyle is 'blackout'.
      await drawBox(drawArea, 50, 200, 200, 500);

      const box = s.container.querySelector('[data-redact-box-id]');
      expect(box).not.toBeNull();
      expect(box.querySelector('[data-editor-actions]')).toBeNull();

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(areaOf(), 0, 0), bubbles: true }));
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
      const drawArea = await loadPainted();

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
        box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(areaOf(), 0, 0), bubbles: true }));
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
      const drawArea = await loadPainted();

      const blurBtn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((btn) => btn.textContent.includes('Blur')), 'Blur button');
      await act(async () => {
        blurBtn.click();
      });

      await drawBox(drawArea, 50, 200, 200, 500);

      const box = required(s.container.querySelector('[data-redact-box-id]'), 'blur box');

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(areaOf(), 0, 0), bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      await dragBlurSlider(0.22, [0.1, 0.2]);

      const blurLayer = required(box.querySelector<HTMLElement>('.redact-surface__blur'), 'blur layer');
      expect(blurLayer.style.backdropFilter).toContain('blur(calc(22cqh))');

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      // DEFAULT_BLUR_STRENGTH, so undo restores the box's original,
      // unpicked strength to that, not 0.22.
      expect(blurLayer.style.backdropFilter).toContain(`blur(calc(${Math.round(DEFAULT_BLUR_STRENGTH * 100)}cqh))`);

      // Redo brings the picked strength back.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
      });
      expect(blurLayer.style.backdropFilter).toContain('blur(calc(22cqh))');
    });

    it('SITE-41: a newly drawn blur box picks up the last-chosen strength', async () => {
      const drawArea = await loadPainted();

      const blurBtn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((btn) => btn.textContent.includes('Blur')), 'Blur button');
      await act(async () => { blurBtn.click(); });

      await drawBox(drawArea, 50, 200, 200, 500);
      const firstBox = required(s.container.querySelector('[data-redact-box-id]'), 'first blur box');

      await act(async () => {
        firstBox.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(areaOf(), 0, 0), bubbles: true }));
      });
      await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });

      await dragBlurSlider(0.22);

      await act(async () => { blurBtn.click(); });
      await drawBox(drawArea, 50, 550, 200, 700);
      const boxes = s.container.querySelectorAll('[data-redact-box-id]');
      const secondBox = boxes[boxes.length - 1] as HTMLElement;
      const secondBlurLayer = required(secondBox.querySelector<HTMLElement>('.redact-surface__blur'), 'second blur layer');

      expect(secondBlurLayer.style.backdropFilter).toContain('blur(calc(22cqh))');
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

      const pressed = clientPoint(areaOf(), 0, 0);
      const dragged = clientPoint(areaOf(), 50, 100);
      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { ...pressed, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mousemove', { ...dragged, bubbles: true })); // about +10% / +10%
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      const moved = percentOn(areaOf(), dragged);
      const origin = percentOn(areaOf(), pressed);
      expect(parseFloat(box.style.left)).toBeCloseTo(drawn.left + moved.x - origin.x);
      expect(parseFloat(box.style.top)).toBeCloseTo(drawn.top + moved.y - origin.y);
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
