import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
// @ts-expect-error -- this browser-first project intentionally omits Node ambient types; Vitest provides the runtime.
import fs from 'node:fs';
import * as gestureController from '#lib/gestures/controller.ts';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { useRedactSuite, required, query, settleUntil, canvasEdge } from '../../test/support/redactTool.tsx';

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
  const { s, loadFileAndGetDrawArea, armTool, drawBox, loadFileWithoutArming } = useRedactSuite({ Tool: PdfRedactTool, checking: CHECKING, gestureController, installToolHarness, waitUntil });

  describe('Delete tool', () => {
    // The Delete tool needs an object to actually click on, which the fake
    // makePdfFile() stub can't provide (it has no content stream to parse).
    // num-1.pdf is a real, minimal PDF with one text run - the same fixture
    // the share test above already uses for the same reason.
    async function loadRealPdfAndSwitchToDelete() {
      const fixturePath = `${__dirname}/../../lib/__fixtures__/num-1.pdf`;
      const fixtureBytes = fs.readFileSync(fixturePath);
      const drawArea = await loadFileAndGetDrawArea(
        new File([fixtureBytes], 'num-1.pdf', { type: 'application/pdf' })
      );

      await armTool('Delete');
      // useDeletableObjects loads pdf-lib on demand and parses the real file,
      // so wait for the fixture's one object rather than a fixed 50ms.
      await settleUntil('the fixture\'s deletable object', () => s.container.querySelector('[data-delete-id]') !== null);

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

    // RED-33: a pointer event by name, since jsdom has no PointerEvent.
    function pointer(target: EventTarget, type: string, x: number, y: number) {
      const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      Object.defineProperty(event, 'pointerType', { value: 'mouse' });
      target.dispatchEvent(event);
    }
    async function dragBox(drawArea: HTMLElement, from: [number, number], to: [number, number]) {
      await act(async () => { pointer(drawArea, 'pointerdown', ...from); });
      await act(async () => { pointer(window, 'pointermove', ...to); });
      await act(async () => { pointer(window, 'pointerup', ...to); });
      // The release's own click is swallowed until the next task.
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
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
      await settleUntil('the ten text runs', () => candidates().length === 10);
      expect(candidates()).toHaveLength(10);

      // A drag that covers nothing does nothing, and the tool stays armed.
      await dragBox(drawArea, [480, 500], [495, 520]);
      expect(candidates()).toHaveLength(10);

      // Drag across the row of nine.
      await dragBox(drawArea, [10, 40], [490, 140]);
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
      expect(candidates()).toHaveLength(0);
      await armTool('Delete');
      expect(candidates()).toHaveLength(1);
      await act(async () => { candidates()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })); });

      // Undo steps back one entry at a time: the word first, then all nine at once.
      await act(async () => { toolbarBtn('Undo').click(); });
      await armTool('Delete');
      expect(candidates()).toHaveLength(1);
      await act(async () => { toolbarBtn('Undo').click(); });
      expect(candidates()).toHaveLength(10);

      // Redo deletes the nine together again.
      await act(async () => { toolbarBtn('Redo').click(); });
      expect(candidates()).toHaveLength(1);
    });

    it('does not start a redaction-box drag gesture while the Delete tool is active', async () => {
      const drawArea = await loadRealPdfAndSwitchToDelete();

      await act(async () => {
        drawArea.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 200, bubbles: true }));
      });
      await act(async () => {
        drawArea.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 400, bubbles: true }));
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

      let capturedBlob: Blob | undefined;
      const originalCreateObjectURL = window.URL.createObjectURL;
      const originalRevokeObjectURL = window.URL.revokeObjectURL;
      window.URL.createObjectURL = vi.fn((blob) => {
        capturedBlob = blob;
        return 'blob:deleted-pdf';
      });
      window.URL.revokeObjectURL = vi.fn();

      try {
        const downloadButton = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
          .find((button) => button.textContent.includes('Download')), 'Download button');
        await act(async () => {
          downloadButton.click();
        });
        // Same dynamic import as the other export tests (DEBT-20), so the same
        // bounded poll rather than a counted tick. This one was not observed
        // failing, which is not a reason to leave a counted tick on a path that
        // now waits on a module load.
        await settleUntil('the deleted-objects export', () => capturedBlob !== undefined);

        // This path never flattens a page: a delete-only session has no box element, so
        // applyPageEdits returns deleteObjectsFromPdf's output directly. No page picture was encoded.
        expect(canvasEdge.encoded).toBe(0);
        expect(capturedBlob).toBeDefined();
        const exportedBlob = required(capturedBlob, 'exported PDF blob');

        const fixturePath = `${__dirname}/../../lib/__fixtures__/num-1.pdf`;
        const originalSize = fs.statSync(fixturePath).size;
        expect(exportedBlob.size).toBeLessThan(originalSize * 3);

        const { extractPageObjects } = await import('#editor/adapters/pdf/pdfObjects.js');
        const { PDFDocument } = await import('@cantoo/pdf-lib');
        const outBytes = new Uint8Array(await exportedBlob.arrayBuffer());
        // RED-16: previews come from the glyph read, not the parser, so read
        // them the way the island does. The source has the "1" (the control
        // that keeps this from passing vacuously); the export does not.
        const { withPreviews } = await import('./lib/objectPreviews.test-helper.js');
        const previewsOf = async (bytes: Uint8Array) => {
          const doc = await PDFDocument.load(bytes);
          const { objects } = extractPageObjects(doc.getPage(0), 0);
          return (await withPreviews(bytes, objects)).map((o: { preview?: string }) => o.preview);
        };
        expect(await previewsOf(new Uint8Array(fs.readFileSync(fixturePath)))).toContain('1');
        expect(await previewsOf(outBytes)).not.toContain('1');
      } finally {
        window.URL.createObjectURL = originalCreateObjectURL;
        window.URL.revokeObjectURL = originalRevokeObjectURL;
      }
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
    async function setupSelectedBox(styleLabel: string | null): Promise<HTMLElement> {
      const drawArea = await loadFileAndGetDrawArea();
      if (styleLabel) {
        const btn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
          .find((b) => b.textContent.includes(styleLabel)), `${styleLabel} button`);
        await act(async () => {
          btn.click();
        });
      }
      // left=20%, top=30%, width=30%, height=20% on the 500x1000 wrapper.
      await drawBox(drawArea, 100, 300, 250, 500);
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      expect(box).not.toBeNull();
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

    // blackout is the default mode (no button click); blur is selected via its toolbar button.
    for (const { label, styleLabel } of [
      { label: 'blackout', styleLabel: null },
      { label: 'blur', styleLabel: 'Blur' },
    ]) {
      describe(label, () => {
        it('anchor: left-handle outward drag keeps left >= 0 and preserves the anchored right edge', async () => {
          const box = await setupSelectedBox(styleLabel);
          // -200px on the left handle from clientX 300 = a large outward drag.
          await dragHandle(box, 'left', 300, 0, -200, 0);
          const left = parseFloat(box.style.left);
          const width = parseFloat(box.style.width);
          expect(left).toBeGreaterThanOrEqual(0);
          expect(left + width).toBeCloseTo(50, 5); // startLeft(20) + startWidth(30)
        });

        it('anchor: top-handle outward drag keeps top >= 0 and preserves the anchored bottom edge', async () => {
          const box = await setupSelectedBox(styleLabel);
          await dragHandle(box, 'top', 0, 300, 0, -600);
          const top = parseFloat(box.style.top);
          const height = parseFloat(box.style.height);
          expect(top).toBeGreaterThanOrEqual(0);
          expect(top + height).toBeCloseTo(50, 5); // startTop(30) + startHeight(20)
        });

        it('move: dragging the box body leaves width/height untouched', async () => {
          const box = await setupSelectedBox(styleLabel);
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

        it('zero-delta resize commits exactly the start geometry', async () => {
          const box = await setupSelectedBox(styleLabel);
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
    }
  });

  // RED-52: RED-43's keyboard move needs the page size in points, which the
  // island only read when a blur box, a blur stroke or a brush was around. Arm
  // neither Blur nor a brush here: the bug only shows when neither is around.
  describe('RED-52: arrow keys move a whiteout or blackout box on a document with no blur', () => {
    for (const label of ['Whiteout', 'Blackout']) {
      it(`${label}: one ArrowDown press moves it one point and one undo puts it back`, async () => {
        const drawArea = await loadFileWithoutArming();
        await armTool(label);
        await drawBox(drawArea, 50, 200, 200, 500);

        const findBox = () => required(
          s.container.querySelector<HTMLElement>(`[role="group"][aria-label="${label} box"]`),
          `${label} box`
        );
        // The island starts reading page sizes when the first box appears, and
        // the mocked pdf.js answers with settled promises: one task later the
        // read has landed, as it has long before a person reaches for a key.
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        // Reach it the way a keyboard user does: focus, then Enter selects.
        await act(async () => {
          findBox().focus();
          findBox().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        });
        expect(findBox().hasAttribute('data-selected')).toBe(true);

        const before = parseFloat(findBox().style.top);
        await act(async () => {
          findBox().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        });
        // One point on the mocked 792-point page.
        expect(parseFloat(findBox().style.top)).toBeCloseTo(before + (1 / 792) * 100, 4);

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
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
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
          boxes()[0].dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
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
