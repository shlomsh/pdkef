import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
import { applyPageEdits } from './lib/applyPageEdits.js';
import { PDFDict, PDFName } from '@cantoo/pdf-lib';
import { getPdfjs } from '#lib/pdf/loadPdfjs.js';
import { startGesture } from '#lib/gestures/controller.ts';
import { waitUntil } from '../../test/support/waitUntil.ts';
import { drainPromises } from '../../test/support/drainPromises.ts';
import { installBrowserToolHarness } from '../../test/harness/browserToolHarness.ts';
import { answerNetwork } from '../../test/support/network.browser.ts';
import { useRedactSuite, required, query, clientPoint, centerOf, percentOn } from '../../test/support/redactTool.browser.tsx';
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

describe('PdfRedactTool UI flow', () => {
  const { s, loadFileAndGetDrawArea, armTool, drawBox, loadFileWithoutArming } = useRedactSuite({ Tool: PdfRedactTool, checking: CHECKING, gestureEntry: { spy: startGesture, real: realStartGesture }, installToolHarness: installBrowserToolHarness, waitUntil, exportEntry: { spy: applyPageEdits, real: realApplyPageEdits } });

  beforeEach(() => {
    downloads.length = 0;
    document.addEventListener('click', recordDownload, { capture: true });
  });

  afterEach(() => {
    document.removeEventListener('click', recordDownload, { capture: true });
  });

  describe('Delete tool', () => {
    async function loadRealPdfAndSwitchToDelete() {
      const drawArea = await loadFileAndGetDrawArea(
        new File([await (await fetch(numOneUrl)).arrayBuffer()], 'num-1.pdf', { type: 'application/pdf' })
      );

      await armTool('Delete');
      // useDeletableObjects loads pdf-lib on demand and parses the real file,
      // so wait for the fixture's one object rather than a fixed 50ms.
      await waitUntil(() => s.container.querySelector('[data-delete-id]') !== null);

      return drawArea;
    }

    it('highlights the one object the fixture contains', async () => {
      await loadRealPdfAndSwitchToDelete();
      const candidates = s.container.querySelectorAll('[data-delete-id]');
      expect(candidates).toHaveLength(1);
    });

    // RED-13: a marked object has no mark of its own. The page is drawn
    // without it, and the toolbar's Undo is how it comes back.
    it('marks an object for deletion on click, and the toolbar Undo brings it back', async () => {
      await loadRealPdfAndSwitchToDelete();

      const candidate = query<HTMLElement>(s.container, '[data-delete-id]');
      await act(async () => {
        candidate.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // Marking spent the tool's one arming, so the highlights are gone with it:
      // the same one-shot contract every other tool in both editors follows.
      expect(s.container.querySelectorAll('[data-delete-id]')).toHaveLength(0);
      await armTool('Delete');
      expect(s.container.querySelectorAll('[data-delete-id]')).toHaveLength(0);

      const undo = required(
        Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')).find((btn) => btn.title === 'Undo'),
        'Undo button',
      );
      await act(async () => {
        undo.click();
      });
      expect(s.container.querySelectorAll('[data-delete-id]')).toHaveLength(1);
    });

    function pointer(target: EventTarget, type: string, point: { clientX: number; clientY: number }) {
      target.dispatchEvent(new PointerEvent(type, { ...point, pointerId: 1, pointerType: 'mouse', button: 0, bubbles: true }));
    }
    async function dragBox(drawArea: HTMLElement, from: [number, number], to: [number, number]) {
      await act(async () => { pointer(drawArea, 'pointerdown', clientPoint(drawArea, ...from)); });
      await act(async () => { pointer(window, 'pointermove', clientPoint(drawArea, ...to)); });
      await act(async () => { pointer(window, 'pointerup', clientPoint(drawArea, ...to)); });
      await act(async () => { await drainPromises(); });
    }
    const candidates = () => s.container.querySelectorAll('[data-delete-id]');
    const toolbarBtn = (title: string) => required(
      Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')).find((btn) => btn.title === title),
      `${title} button`,
    );

    it('deletes everything a dragged box covers as one undo step (RED-33)', async () => {
      // Ten separate text runs: nine in a row near the top, one lower down.
      const { PDFDocument, StandardFonts } = await import('@cantoo/pdf-lib');
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([500, 1000]);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      for (let n = 0; n < 9; n++) page.drawText(String(n), { x: 40 + n * 40, y: 900, size: 20, font });
      page.drawText('word', { x: 40, y: 300, size: 20, font });
      const drawArea = await loadFileAndGetDrawArea(new File([new Uint8Array(await pdf.save())], 'ten.pdf', { type: 'application/pdf' }));
      await armTool('Delete');
      await waitUntil(() => candidates().length === 10);
      expect(candidates()).toHaveLength(10);

      // A drag that covers nothing does nothing, and the tool stays armed.
      await dragBox(drawArea, [480, 500], [495, 520]);
      expect(candidates()).toHaveLength(10);

      // Drag across the row of nine.
      await dragBox(drawArea, [10, 40], [490, 140]);
      await waitUntil(() => expect(s.container.querySelector('[role="status"] button')?.parentElement?.textContent).toContain('Deleted 9 pieces of text'));
      expect(candidates()).toHaveLength(0); // deleting spent the arming
      const chip = required(s.container.querySelector('[role="status"] button')?.parentElement, 'undo chip');
      expect(chip.textContent).toContain('Deleted 9 pieces of text');
      const chipUndo = () => required(s.container.querySelector<HTMLButtonElement>('[role="status"] button'), 'chip Undo');

      // The chip restores all nine together.
      await act(async () => { chipUndo().click(); });
      await armTool('Delete');
      expect(candidates()).toHaveLength(10);

      // Delete them again, then hover-delete the word as its own step.
      await dragBox(drawArea, [10, 40], [490, 140]);
      await waitUntil(() => expect(s.container.querySelector('[role="status"] button')?.parentElement?.textContent).toContain('Deleted 9 pieces of text'));
      expect(candidates()).toHaveLength(0);
      await armTool('Delete');
      expect(candidates()).toHaveLength(1);
      await waitUntil(() => expect(candidates()[0].title).toContain('word'));
      await act(async () => { candidates()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await waitUntil(() => {
        const text = s.container.querySelector('.sr-only[aria-live="polite"]')?.textContent;
        expect(text).toContain('Deleted');
        expect(text).not.toContain('9 pieces');
      });

      // Undo steps back one entry at a time: the word first, then all nine at once.
      await act(async () => { toolbarBtn('Undo').click(); });
      await armTool('Delete');
      await waitUntil(() => expect(candidates()).toHaveLength(1));
      await act(async () => { toolbarBtn('Undo').click(); });
      await waitUntil(() => expect(candidates()).toHaveLength(10));

      // Redo deletes the nine together again.
      await act(async () => { toolbarBtn('Redo').click(); });
      await waitUntil(() => expect(candidates()).toHaveLength(1));
    });

    it('does not start a redaction-box drag gesture while the Delete tool is active', async () => {
      const drawArea = await loadRealPdfAndSwitchToDelete();

      await act(async () => {
        drawArea.dispatchEvent(new MouseEvent('mousedown', { ...clientPoint(drawArea, 50, 200), bubbles: true }));
      });
      await act(async () => {
        drawArea.dispatchEvent(new MouseEvent('mousemove', { ...clientPoint(drawArea, 200, 400), bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      expect(s.container.querySelector('[data-redact-box-id]')).toBeNull();
    });

    it('produces a smaller, still-valid PDF with the marked object actually removed', async () => {
      await loadRealPdfAndSwitchToDelete();

      const candidate = query<HTMLElement>(s.container, '[data-delete-id]');
      await act(async () => {
        candidate.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const downloadButton = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((button) => button.textContent.includes('Download')), 'Download button');
      await act(async () => {
        downloadButton.click();
      });
      await waitUntil(() => downloads.length === 1);
      const exportedBlob = await downloads[0];

      const { PDFDocument } = await import('@cantoo/pdf-lib');
      const outBytes = new Uint8Array(await exportedBlob.arrayBuffer());
      const sourceBytes = new Uint8Array(await (await fetch(numOneUrl)).arrayBuffer());
      expect(exportedBlob.size).toBeLessThan(sourceBytes.byteLength * 3);

      const saved = await PDFDocument.load(outBytes);
      const pictures = saved.getPage(0).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
      expect(pictures?.keys().length ?? 0).toBe(0);

      const textOf = async (bytes: Uint8Array) => {
        const pdfjs = await getPdfjs();
        const task = pdfjs.getDocument({ data: bytes.slice() });
        try {
          const content = await (await (await task.promise).getPage(1)).getTextContent();
          return content.items.map((item) => ('str' in item ? item.str : ''));
        } finally {
          await task.destroy();
        }
      };
      expect(await textOf(sourceBytes)).toContain('1');
      expect(await textOf(outBytes)).not.toContain('1');
    });
  });

  // E1.5: blackout and blur became resizable in commit 274b293 — previously a
  // single corner dot, now the full 8-handle ElementResizers on the same
  // handleBoxResizeStart path as whiteout. The regression block above exercises
  // that math through whiteout, but E1.5 mandates the three gesture invariants
  // for EVERY resizable type. handleBoxResizeStart does not branch on el.style,
  // so a failure here would mean the render layer forked the resize path per
  // style. Same realistic 500x1000 mocked wrapper (via loadFileAndGetDrawArea).
  describe('blackout/blur resize invariants (E1.5)', () => {
    let area: HTMLElement;
    async function setupSelectedBox(styleLabel: string | null): Promise<HTMLElement> {
      const drawArea = await loadFileAndGetDrawArea();
      area = drawArea;
      if (styleLabel) {
        const btn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
          .find((b) => b.textContent.includes(styleLabel)), `${styleLabel} button`);
        await act(async () => {
          btn.click();
        });
      }
      await drawBox(drawArea, 100, 300, 250, 500);
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      expect(box).not.toBeNull();
      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { ...centerOf(box), bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
      return box;
    }

    async function dragHandle(box: HTMLElement, handleClass: string, move: (press: { clientX: number; clientY: number }) => { clientX: number; clientY: number }): Promise<void> {
      const handle = query<HTMLElement>(box, `[data-editor-resizer="${handleClass}"]`);
      const press = centerOf(handle);
      await act(async () => {
        handle.dispatchEvent(new MouseEvent('mousedown', { ...press, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mousemove', { ...move(press), bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
    }

    const geometry = (box: HTMLElement) => ({ left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: parseFloat(box.style.width), height: parseFloat(box.style.height) });

    // blackout is the default mode (no button click); blur is selected via its toolbar button.
    for (const { label, styleLabel } of [
      { label: 'blackout', styleLabel: null },
      { label: 'blur', styleLabel: 'Blur' },
    ]) {
      describe(label, () => {
        it('anchor: left-handle outward drag keeps left >= 0 and preserves the anchored right edge', async () => {
          const box = await setupSelectedBox(styleLabel);
          const start = geometry(box);
          await dragHandle(box, 'left', (press) => ({ clientX: clientPoint(area, -200, 0).clientX, clientY: press.clientY }));
          const { left, width } = geometry(box);
          expect(left).toBeGreaterThanOrEqual(0);
          expect(left + width).toBeCloseTo(start.left + start.width, 5);
        });

        it('anchor: top-handle outward drag keeps top >= 0 and preserves the anchored bottom edge', async () => {
          const box = await setupSelectedBox(styleLabel);
          const start = geometry(box);
          await dragHandle(box, 'top', (press) => ({ clientX: press.clientX, clientY: clientPoint(area, 0, -600).clientY }));
          const { top, height } = geometry(box);
          expect(top).toBeGreaterThanOrEqual(0);
          expect(top + height).toBeCloseTo(start.top + start.height, 5);
        });

        it('move: dragging the box body leaves width/height untouched', async () => {
          const box = await setupSelectedBox(styleLabel);
          const start = geometry(box);
          const down = clientPoint(area, 0, 0);
          const to = clientPoint(area, 50, 100);
          await act(async () => {
            box.dispatchEvent(new MouseEvent('mousedown', { ...down, bubbles: true }));
          });
          await act(async () => {
            window.dispatchEvent(new MouseEvent('mousemove', { ...to, bubbles: true }));
          });
          await act(async () => {
            window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          });
          const moved = percentOn(area, to);
          const from = percentOn(area, down);
          expect(parseFloat(box.style.left)).toBeCloseTo(start.left + moved.x - from.x);
          expect(parseFloat(box.style.top)).toBeCloseTo(start.top + moved.y - from.y);
          expect(parseFloat(box.style.width)).toBeCloseTo(start.width);
          expect(parseFloat(box.style.height)).toBeCloseTo(start.height);
        });

        it('zero-delta resize commits exactly the start geometry', async () => {
          const box = await setupSelectedBox(styleLabel);
          const start = geometry(box);
          await dragHandle(box, 'bottom-right', (press) => press);
          const end = geometry(box);
          expect(end.left).toBeCloseTo(start.left);
          expect(end.top).toBeCloseTo(start.top);
          expect(end.width).toBeCloseTo(start.width);
          expect(end.height).toBeCloseTo(start.height);
        });
      });
    }
  });

  // RED-52: RED-43's keyboard move needs the page size in points, which the
  // island only read when a blur box, a blur stroke or a brush was around. Arm
  // neither Blur nor a brush here: the bug only shows when neither is around.
  describe('RED-52: arrow keys move a whiteout or blackout box on a document with no blur', () => {
    for (const label of ['Whiteout', 'Blackout']) {
      it(`${label}: one ArrowDown press moves it one point and one undo puts it back`, async () => {
        const task = (await getPdfjs()).getDocument({ data: new Uint8Array(await (await fetch(numOneUrl)).arrayBuffer()) });
        const getPage = vi.spyOn(Object.getPrototypeOf(await task.promise), 'getPage');
        await task.destroy();
        const drawArea = await loadFileWithoutArming();
        await armTool(label);
        const drawnTop = percentOn(drawArea, clientPoint(drawArea, 50, 200)).y;
        await drawBox(drawArea, 50, 200, 200, 500);

        const findBox = () => required(
          s.container.querySelector<HTMLElement>(`[role="group"][aria-label="${label} box"]`),
          `${label} box`
        );
        // Reach it the way a keyboard user does: focus, then Enter selects.
        await act(async () => {
          findBox().focus();
          findBox().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        });
        expect(findBox().hasAttribute('data-selected')).toBe(true);

        await act(async () => {
          for (let read = 0; read < getPage.mock.results.length; read += 1) await getPage.mock.results[read].value;
          await drainPromises();
        });
        const before = parseFloat(findBox().style.top);
        await act(async () => {
          findBox().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });
        // One point on the 792-point page.
        expect(parseFloat(findBox().style.top)).toBeCloseTo(drawnTop + (1 / 792) * 100, 4);

        await act(async () => {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
        });
        expect(parseFloat(findBox().style.top)).toBeCloseTo(before, 4);
      });
    }
  });

  // Design-review finding #3: deleteElement (a box's own X) and clearPage
  // ("Clear all redactions on this page") used to change `elements` with no
  // live-region announcement and no way back short of Cmd/Ctrl+Z. Both now
  // announce and surface a short-lived Undo
  // chip in the toolbar's status slot (RedactToolbar.tsx swaps EditorToolStatus
  // for it while one is pending), mirroring Merge's own undo chip.
  describe('delete and clear-page announce and offer an undo chip (finding #3)', () => {
    const announcementRegion = () => required(
      s.container.querySelector<HTMLElement>('.sr-only[aria-live="polite"]'),
      'sr-only announcement region',
    );
    // The chip rides in EditorToolStatus's own stack (RedactToolbar.tsx hands
    // it over as `override`), so it is the shown `role="status"` row inside
    // `.help`, over the same hidden reservations the armed rows use. That is
    // what keeps the slot's height put while the chip comes and goes.
    const statusSlot = () => query<HTMLElement>(s.container, '[data-tool-status] [role="status"]');

    it('announces and offers Undo when a single box is deleted, and Undo restores it', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);

      // The delete control only exists in the shared floating toolbar once
      // the box is selected.
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { ...centerOf(box), bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      const deleteBtn = query<HTMLButtonElement>(s.container, '[data-editor-actions] button[title="Delete"]');
      await act(async () => {
        deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(0);
      expect(announcementRegion().textContent).toContain('Removed the blackout box');

      const chip = statusSlot();
      expect(chip.querySelector('[role="status"] > span')).not.toBeNull();
      expect(chip.textContent).toContain('Removed the blackout box');
      // The chip did not replace the stack: every tool's hidden reservation is
      // still there under it, holding the row's height, and the shell is told
      // the slot is live (that attribute is what hides the filename on a phone).
      const help = required(chip.closest<HTMLElement>('[data-tool-status]'), 'help stack around the chip');
      expect(help.hasAttribute('data-status-active')).toBe(true);
      expect(help.querySelectorAll('[data-help-row]:not([data-shown])').length).toBeGreaterThanOrEqual(4);

      const undoButton = required(chip.querySelector<HTMLButtonElement>('[role="status"] button'), 'chip Undo button');
      await act(async () => {
        undoButton.click();
      });

      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);
      expect(announcementRegion().textContent).toContain('Undid: Removed the blackout box');
    });

    it('announces and offers Undo when a page is cleared, and Undo restores every box', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520);
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(2);

      const clearBtn = required(
        s.container.querySelector<HTMLButtonElement>('button[title="Clear every box on this page"]'),
        'Clear page button',
      );
      await act(async () => {
        clearBtn.click();
      });

      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(0);
      expect(announcementRegion().textContent).toContain('Cleared 2 boxes on page 1');

      const chip = statusSlot();
      expect(chip.textContent).toContain('Cleared 2 boxes on page 1');

      const undoButton = required(chip.querySelector<HTMLButtonElement>('[role="status"] button'), 'chip Undo button');
      await act(async () => {
        undoButton.click();
      });

      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(2);
    });

    it('a second delete before the first chip clears replaces it rather than stacking', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520);
      const boxes = () => Array.from(s.container.querySelectorAll<HTMLElement>('[data-redact-box-id]'));
      expect(boxes()).toHaveLength(2);

      // The shared toolbar only ever renders on the selected box, so each
      // delete needs its own select step before its button exists to press.
      const selectAndDeleteFirstBox = async () => {
        await act(async () => {
          boxes()[0].dispatchEvent(new MouseEvent('mousedown', { ...centerOf(boxes()[0]), bubbles: true }));
        });
        await act(async () => {
          window.dispatchEvent(new MouseEvent('mouseup'));
        });
        const deleteBtn = query<HTMLButtonElement>(s.container, '[data-editor-actions] button[title="Delete"]');
        await act(async () => {
          deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
      };

      await selectAndDeleteFirstBox();
      expect(s.container.querySelectorAll('[role="status"] > span')).toHaveLength(1);
      expect(boxes()).toHaveLength(1);

      // Select and delete the one remaining box before the first chip's
      // window clears.
      await selectAndDeleteFirstBox();

      // Still exactly one chip in the one status slot - the second delete's
      // chip replaced the first's, it did not join it.
      expect(s.container.querySelectorAll('[role="status"] > span')).toHaveLength(1);
      expect(boxes()).toHaveLength(0);
    });
  });
});
