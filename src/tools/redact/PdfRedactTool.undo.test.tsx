import { act } from 'preact/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
import * as gestureController from '#lib/gestures/controller.ts';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { useRedactSuite, required, query, setSelectedBoxColor } from '../../test/support/redactTool.tsx';

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
  const { s, loadFileAndGetDrawArea, armTool, drawBox } = useRedactSuite({ Tool: PdfRedactTool, checking: CHECKING, gestureController, installToolHarness, waitUntil });

  // Redo (UNDO-REDO): shares actionHistory.ts/historyStack.ts with the Sign
  // tool, wired through applyRevert's explicit push-or-clear redoBehavior.
  // RedactBox never puts an element's id on its own DOM node, so these use
  // each box's distinct `style.left` (set from drawBox's own down/move
  // coordinates) as a stand-in for identity and stacking order - the same
  // proxy the resize-invariant tests above already read box geometry through.
  describe('undo/redo history', () => {
    const boxLefts = () => Array.from(s.container.querySelectorAll<HTMLElement>('[data-redact-box-id]'))
      .map((box) => parseFloat(box.style.left));

    async function pressUndoShortcut(): Promise<void> {
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
    }

    async function pressRedoShortcut(): Promise<void> {
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
      });
    }

    function announcementRegion(): HTMLElement {
      return required(s.container.querySelector<HTMLElement>('.sr-only[aria-live="polite"]'), 'sr-only announcement region');
    }

    it('undo then redo restores a box at the same stacking position', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500); // box A: left ~10%
      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520); // box B: left ~12%

      expect(boxLefts().map((n) => Math.round(n))).toEqual([10, 12]);

      await pressUndoShortcut();
      expect(boxLefts().map((n) => Math.round(n))).toEqual([10]);
      expect(announcementRegion().textContent).toContain('Undid: Added blackout box');

      await pressRedoShortcut();
      // Box B comes back at the end of the stack, not spliced in ahead of A -
      // the same order applyHistoryEntries' restoreSnapshots reconstructs from
      // the entry's own captured index.
      expect(boxLefts().map((n) => Math.round(n))).toEqual([10, 12]);
      expect(announcementRegion().textContent).toContain('Redid: Added blackout box');
    });

    it('a new command after an undo clears the future, so redo then does nothing', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500); // box A: left ~10%
      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520); // box B: left ~12%

      await pressUndoShortcut(); // undoes box B; redoHistory now holds it
      expect(boxLefts().map((n) => Math.round(n))).toEqual([10]);

      await armTool('Blackout');
      await drawBox(drawArea, 70, 240, 240, 540); // box C: left ~14% - a new command

      expect(boxLefts().map((n) => Math.round(n))).toEqual([10, 14]);

      await pressRedoShortcut();
      // logAction cleared the future when box C was logged, so nothing comes back.
      expect(boxLefts().map((n) => Math.round(n))).toEqual([10, 14]);
    });

    // Undo and Redo are toolbar controls, one tap each, because a phone has
    // no keyboard. They used to be one button that opened a change-history
    // dialog, which meant there was no single-step undo on touch at all and
    // no way to reach Redo, since the dialog was the only place it lived.
    // That dialog is gone: these two controls are the whole history model,
    // and neither may go back to opening anything.
    it('Undo and Redo are one tap each on the toolbar, and open no dialog', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500); // box A: left ~10%
      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520); // box B: left ~12%
      expect(boxLefts().map((n) => Math.round(n))).toEqual([10, 12]);

      const toolbarButton = (title: string) => required(
        Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
          .find((b) => b.title === title),
        `${title} button`,
      );

      const undo = toolbarButton('Undo');
      const redo = toolbarButton('Redo');
      expect(undo.disabled).toBe(false);
      expect(redo.disabled).toBe(true);

      await act(async () => { undo.click(); });
      expect(boxLefts().map((n) => Math.round(n))).toEqual([10]);
      // No dialog opened: the tap itself undid something, and there is no
      // history dialog left in this tool to open.
      expect(s.container.querySelector('dialog[open]')).toBeNull();

      expect(toolbarButton('Redo').disabled).toBe(false);
      await act(async () => { toolbarButton('Redo').click(); });
      expect(boxLefts().map((n) => Math.round(n))).toEqual([10, 12]);
    });

    it('the undo chip keeps a redo when its command is still the newest', async () => {
      // This has to leave redoHistory genuinely non-empty *before* the chip is
      // clicked, and the chip's own target entry still live in actionHistory
      // at that moment (not stale), to actually distinguish 'clear' from
      // 'push' - a chip fired against an already-empty future proves nothing.
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500); // box A: left ~10%

      // Delete box A: a direct actionHistory push (deleteElement, not
      // logAction) that registers the 5s undo chip targeting this exact entry.
      const boxA = query<HTMLElement>(s.container, '[data-redact-box-id]');
      await act(async () => {
        boxA.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
      const deleteBtn = query<HTMLButtonElement>(s.container, '[data-editor-actions] button[title="Delete"]');
      await act(async () => {
        deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(boxLefts()).toHaveLength(0);

      // Draw box B and undo it. This is the one case applyRevert pushes onto
      // redoHistory (undoLast, a genuine most-recent-command step), so the
      // future is non-empty going into the chip click - the chip's own entry
      // (deleting box A) is still sitting in actionHistory underneath it,
      // untouched by this undo.
      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520); // box B: left ~12%
      await pressUndoShortcut();
      expect(boxLefts()).toHaveLength(0);

      // Click the still-live chip: it reverts the delete-box-A entry, restoring A.
      const undoButton = required(s.container.querySelector<HTMLButtonElement>('[role="status"] button'), 'chip Undo button');
      await act(async () => {
        undoButton.click();
      });
      expect(boxLefts().map((n) => Math.round(n))).toEqual([10]);

      // By the time the chip is clicked, undoing box B has left the
      // delete-box-A entry as the newest command on the stack, so reverting it
      // is a plain undo and redo mirrors it: A is deleted again. That is what
      // redo means, and the alternative - refusing on the grounds that the
      // chip targets by id - would leave the Redo control dead after every
      // chip undo, which on touch is most of them.
      await pressRedoShortcut();
      expect(boxLefts()).toHaveLength(0);

      // And the undo below it is still there to redo afterwards.
      await pressRedoShortcut();
      expect(boxLefts().map((n) => Math.round(n))).toEqual([12]);
    });

    it('the undo chip drops the future when another command landed above it', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500); // box A: left ~10%

      const boxA = query<HTMLElement>(s.container, '[data-redact-box-id]');
      await act(async () => {
        boxA.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
      const deleteBtn = query<HTMLButtonElement>(s.container, '[data-editor-actions] button[title="Delete"]');
      await act(async () => {
        deleteBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(boxLefts()).toHaveLength(0);

      // Box B is drawn and LEFT IN PLACE, so it sits above the chip's entry on
      // the stack. Reverting the chip is then a middle-of-the-stack revert: a
      // redo could re-insert something box B's own command never accounted
      // for, so the future must be dropped.
      await armTool('Blackout'); // one-shot: the tool disarmed after box A
      await drawBox(drawArea, 60, 220, 220, 520); // box B: left ~12%
      const afterB = boxLefts().map((n) => Math.round(n));
      expect(afterB).toHaveLength(1); // B really is on the stack above the chip's entry

      const undoButton = required(s.container.querySelector<HTMLButtonElement>('[role="status"] button'), 'chip Undo button');
      await act(async () => {
        undoButton.click();
      });
      const afterChip = boxLefts().map((n) => Math.round(n));
      expect(afterChip).not.toEqual(afterB);

      await pressRedoShortcut();
      expect(boxLefts().map((n) => Math.round(n))).toEqual(afterChip);
    });

    it('redo with an empty future is a safe no-op', async () => {
      await loadFileAndGetDrawArea();
      expect(boxLefts()).toHaveLength(0);

      await pressRedoShortcut();

      expect(boxLefts()).toHaveLength(0);
      expect(announcementRegion().textContent).not.toContain('Redid');
    });

    // Review finding: undoLast reads actionHistory[0]/elements from render
    // scope, and applyRevert's setElements call is a plain value rather than
    // a functional update. Two undo keydowns landing in the same task
    // (ordinary key auto-repeat, no re-render between them) therefore revert
    // the *same* top entry twice: idempotent for elements/actionHistory, but
    // the functional `setRedoHistory(prev => [...entries, ...prev])` push
    // runs twice against the same `entries`, leaving redoHistory holding the
    // same entry object twice. Redoing twice then unshifts that one entry
    // onto actionHistory twice too, so two rows end up sharing an id.
    it('two undo keydowns in one task are two distinct undos, not the same one twice', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500); // box A: left ~10%
      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520); // box B: left ~12%

      expect(boxLefts().map((n) => Math.round(n))).toEqual([10, 12]);

      // Both keydowns dispatched with no `await` between them, inside a
      // single act() call, so Preact gets no chance to re-render (and thus
      // no chance to give the second handler invocation an up-to-date
      // closure) between the two - the same gap ordinary key auto-repeat
      // exploits.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });

      // Two real undos remove both boxes. A stale-closure bug that reverts
      // the same (newest) entry twice would leave box A behind instead.
      expect(boxLefts()).toEqual([]);

      await pressRedoShortcut();
      await pressRedoShortcut();

      // Two real redos bring both boxes back, once each.
      expect(boxLefts().map((n) => Math.round(n))).toEqual([10, 12]);

      // And the stack really holds two distinct commands, not one entry
      // twice: undoing twice more (separately, so no closure is stale) has
      // to clear both boxes and leave nothing to undo. A duplicated entry
      // would spend one of those undos re-reverting the same command and
      // leave box A on the page with Undo already dead.
      await pressUndoShortcut();
      await pressUndoShortcut();
      expect(boxLefts()).toEqual([]);
      const undoControl = required(
        Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')).find((btn) => btn.title === 'Undo'),
        'toolbar Undo button',
      );
      expect(undoControl.disabled).toBe(true);
    });

    // UNDO-04: moves, resizes and colour changes are logged as 'update'
    // commands at updateElement's one choke point, so they undo/redo like
    // add/delete already did. Driven through a real drag on the box body
    // (mousedown/mousemove/mouseup), the same DOM path drawBox and
    // dragHandle above already exercise for creation and resize - not a
    // direct updateElement() call.
    it('moving a box is undoable: Undo restores its old position, Redo moves it again', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500); // box A: left ~10%, top ~20%
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      const originalLeft = Math.round(parseFloat(box.style.left));
      const originalTop = Math.round(parseFloat(box.style.top));

      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 100, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });

      const movedLeft = Math.round(parseFloat(box.style.left));
      const movedTop = Math.round(parseFloat(box.style.top));
      expect(movedLeft).not.toBe(originalLeft);
      expect(movedTop).not.toBe(originalTop);

      await pressUndoShortcut();
      expect(boxLefts()).toHaveLength(1); // the box still exists
      expect(Math.round(parseFloat(box.style.left))).toBe(originalLeft);
      expect(Math.round(parseFloat(box.style.top))).toBe(originalTop);
      expect(announcementRegion().textContent).toContain('Undid: Moved blackout box');

      await pressRedoShortcut();
      expect(Math.round(parseFloat(box.style.left))).toBe(movedLeft);
      expect(Math.round(parseFloat(box.style.top))).toBe(movedTop);
    });

    it('changing a whiteout box color is undoable: Undo restores its old color', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      const whiteoutBtn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((btn) => btn.textContent.includes('Whiteout')), 'Whiteout button');
      await act(async () => {
        whiteoutBtn.click();
      });
      await drawBox(drawArea, 50, 200, 200, 500);
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      // Fill color lives on the surface child (renderRedactionSurface via
      // createElementRenderers), not on the box's own geometry-only style -
      // same selector the "remembered whiteout color" test above uses.
      const surface = query<HTMLElement>(s.container, '.redact-surface--whiteout');
      const originalColor = surface.style.backgroundColor;

      // Select the box, then set a colour through its toolbar's colour input.
      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
      await setSelectedBoxColor('#000000');

      const changedColor = surface.style.backgroundColor;
      expect(changedColor).not.toBe(originalColor);

      await pressUndoShortcut();
      const restoredSurface = query<HTMLElement>(s.container, '.redact-surface--whiteout');
      expect(restoredSurface.style.backgroundColor).toBe(originalColor);
      expect(announcementRegion().textContent).toContain('Undid: Changed whiteout box color');
    });
  });
});
