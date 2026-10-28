import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PdfRedactTool from './PdfRedactTool.tsx';
import { CHECKING } from './lib/check/checkCopy.ts';
import * as gestureController from '#lib/gestures/controller.ts';
import { waitUntil } from '../../test/harness/waitUntil.ts';
import { installToolHarness } from '../../test/harness/toolHarness.ts';
import { useRedactSuite, required, query, settleUntil, dragBlurSlider, installCanvasEdge, setSelectedBoxColor } from '../../test/support/redactTool.tsx';

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

  // RED-03: a selected box's "Repeat on every page" button, next to duplicate
  // in the shared floating toolbar, and the linked-copies rules that follow
  // once a box has been repeated: editing, unlinking, removing and
  // duplicating a group all fire as one undo step. repeatGroup.ts's own unit
  // tests cover the pure rules directly; this covers PdfRedactTool.tsx's
  // wiring of them through updateElement/duplicateElement/unlinkFromGroup/
  // removeGroup, mirroring the clear-page block above.
  describe('repeat a box on every page, linked copies (RED-03)', () => {

    // loadFileAndGetDrawArea only stubs getBoundingClientRect on the FIRST
    // page's draw area - fine for every other describe block in this file,
    // which never drags on any page but the first. A multi-page repeat test
    // that resizes a copy on page 2 or 3 needs every page's draw area to
    // have a real (non-0x0) rect too, or its resize handle's own delta math
    // divides against a vacuous rect (see this file's own "regression"
    // comment above) and silently computes no change at all.
    function stubEveryDrawAreaRect(): void {
      const rect = { left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON: () => {} };
      s.container.querySelectorAll<HTMLElement>('.redact-draw-area').forEach((el) => {
        el.getBoundingClientRect = () => rect;
      });
    }

    async function selectBox(box: HTMLElement): Promise<void> {
      await act(async () => {
        box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
    }

    async function selectFirstBox(): Promise<HTMLElement> {
      const box = query<HTMLElement>(s.container, '[data-redact-box-id]');
      await selectBox(box);
      return box;
    }

    // A box-toolbar menu (the linked set's, or trash's scope choice): open
    // it on the selected box, then pick an item. Popover portals the menu
    // to document.body, so the item is found there.
    async function pickFromBoxMenu(trigger: string, item: string): Promise<void> {
      const button = query<HTMLButtonElement>(s.container, `[data-editor-actions] ${trigger}`);
      await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const choice = required(document.querySelector<HTMLButtonElement>(item), item);
      await act(async () => {
        choice.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    // A box that is not linked yet shows the plain repeat button; once it is,
    // the same slot becomes the linked set's menu trigger.
    async function repeatSelectedBox(): Promise<void> {
      const repeatButton = query<HTMLButtonElement>(s.container, '[data-editor-actions] [data-editor-repeat-every-page]');
      await act(async () => {
        repeatButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }

    // Same drag-resize gesture as the "resizes an existing box" test above
    // (mousedown on the bottom-right handle, then a move) - the box must
    // already be selected for the handle to exist.
    async function resizeBox(box: HTMLElement, dx: number, dy: number): Promise<void> {
      const resizer = query<HTMLElement>(box, '[data-editor-resizer="bottom-right"]');
      await act(async () => {
        resizer.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: dx, clientY: dy }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: dx, clientY: dy }));
      });
      await act(async () => {
        window.dispatchEvent(new MouseEvent('mouseup'));
      });
    }

    it('adds a copy to every other page as one undo step, redoes as one step, and pressing it again adds nothing more', async () => {
      s.harness.pdfjs.pageCountOfNextRead(3);
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      await selectFirstBox();
      await repeatSelectedBox();

      const pageCards = Array.from(s.container.querySelectorAll('[data-editor-page-card]'));
      expect(pageCards).toHaveLength(3);
      pageCards.forEach((card) => {
        expect(card.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);
      });
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(3);

      const announcementRegion = required(
        s.container.querySelector<HTMLElement>('.sr-only[aria-live="polite"]'),
        'sr-only announcement region',
      );
      expect(announcementRegion.textContent).toContain('Added the box to 2 more pages');

      // The original box is still selected, so its toolbar (and the repeat
      // trigger on it) is still on screen if it renders one at all - pressing
      // it again must add nothing more, since every other page already has
      // an equivalent box (repeatCopies' own no-op case).
      const repeatButtonAgain = s.container.querySelector<HTMLButtonElement>('[data-editor-actions] [data-editor-repeat-group-trigger]');
      if (repeatButtonAgain) {
        await act(async () => {
          repeatButtonAgain.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
      }
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(3);

      // One undo removes every copy this action added, leaving only the original.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);

      // One redo puts every copy back, one per page again.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
      });
      pageCards.forEach((card) => {
        expect(card.querySelectorAll('[data-redact-box-id]')).toHaveLength(1);
      });
    });

    it('shows no repeat trigger on a single-page document', async () => {
      s.harness.pdfjs.pageCountOfNextRead(1);
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      await selectFirstBox();

      expect(s.container.querySelector('[data-editor-repeat-group-trigger]')).toBeNull();
    });

    it('resizing one linked copy resizes every copy as one undo step, and redo reapplies it', async () => {
      s.harness.pdfjs.pageCountOfNextRead(3);
      const drawArea = await loadFileAndGetDrawArea();
      stubEveryDrawAreaRect();
      await drawBox(drawArea, 50, 200, 200, 500);
      await selectFirstBox();
      await repeatSelectedBox();

      const boxes = () => Array.from(s.container.querySelectorAll<HTMLElement>('[data-redact-box-id]'));
      const widthBefore = parseFloat(boxes()[0].style.width);
      expect(boxes().every((box) => parseFloat(box.style.width) === widthBefore)).toBe(true);

      const pageCards = Array.from(s.container.querySelectorAll('[data-editor-page-card]'));
      const secondPageBox = query<HTMLElement>(pageCards[1], '[data-redact-box-id]');
      await selectBox(secondPageBox);
      await resizeBox(secondPageBox, 100, 100);

      const widthAfter = parseFloat(boxes()[0].style.width);
      expect(widthAfter).toBeGreaterThan(widthBefore);
      boxes().forEach((box) => {
        expect(parseFloat(box.style.width)).toBeCloseTo(widthAfter);
      });

      // One undo restores every copy to its pre-resize size.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      boxes().forEach((box) => {
        expect(parseFloat(box.style.width)).toBeCloseTo(widthBefore);
      });

      // One redo reapplies the resize to every copy.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
      });
      boxes().forEach((box) => {
        expect(parseFloat(box.style.width)).toBeCloseTo(widthAfter);
      });
    });

    it("unlinking a copy stops it following its former group's edits", async () => {
      s.harness.pdfjs.pageCountOfNextRead(3);
      const drawArea = await loadFileAndGetDrawArea();
      stubEveryDrawAreaRect();
      await drawBox(drawArea, 50, 200, 200, 500);
      await selectFirstBox();
      await repeatSelectedBox();

      const pageCards = Array.from(s.container.querySelectorAll('[data-editor-page-card]'));
      const secondPageBox = query<HTMLElement>(pageCards[1], '[data-redact-box-id]');
      await selectBox(secondPageBox);
      await pickFromBoxMenu('[data-editor-repeat-group-trigger]', '[data-editor-repeat-group-unlink]');

      const firstPageBox = query<HTMLElement>(pageCards[0], '[data-redact-box-id]');
      const thirdPageBox = query<HTMLElement>(pageCards[2], '[data-redact-box-id]');
      const widthBefore = parseFloat(firstPageBox.style.width);

      await selectBox(firstPageBox);
      await resizeBox(firstPageBox, 100, 100);

      expect(parseFloat(firstPageBox.style.width)).toBeGreaterThan(widthBefore);
      // Still linked to page 1's box (the group's own key never moved) - it follows.
      expect(parseFloat(thirdPageBox.style.width)).toBeCloseTo(parseFloat(firstPageBox.style.width));
      // Unlinked before the resize - untouched by it.
      expect(parseFloat(secondPageBox.style.width)).toBeCloseTo(widthBefore);
    });

    it('Remove from the other pages removes the other copies in one undo step', async () => {
      s.harness.pdfjs.pageCountOfNextRead(3);
      const drawArea = await loadFileAndGetDrawArea();
      stubEveryDrawAreaRect();
      await drawBox(drawArea, 50, 200, 200, 500);
      await selectFirstBox();
      await repeatSelectedBox();

      const boxes = () => Array.from(s.container.querySelectorAll<HTMLElement>('[data-redact-box-id]'));
      expect(boxes()).toHaveLength(3);
      const pageCards = Array.from(s.container.querySelectorAll('[data-editor-page-card]'));
      await selectBox(query<HTMLElement>(pageCards[1], '[data-redact-box-id]'));
      await pickFromBoxMenu('[data-editor-repeat-group-trigger]', '[data-editor-repeat-group-keep-only]');

      expect(boxes()).toHaveLength(1);
      expect(pageCards[1].querySelector('[data-redact-box-id]')).not.toBeNull();

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      expect(boxes()).toHaveLength(3);
    });

    it('Clear page on a page with a repeated box asks, and "Keep the repeated boxes" clears only its own boxes', async () => {
      s.harness.pdfjs.pageCountOfNextRead(3);
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      await selectFirstBox();
      await repeatSelectedBox();
      await armTool('Blackout');
      await drawBox(drawArea, 60, 600, 220, 700); // a box only page 1 has

      const pageCards = Array.from(s.container.querySelectorAll('[data-editor-page-card]'));
      const counts = () => pageCards.map((card) => card.querySelectorAll('[data-redact-box-id]').length);
      expect(counts()).toEqual([2, 1, 1]);

      const clearTrigger = query<HTMLButtonElement>(pageCards[0], '[data-editor-clear-page-trigger]');
      await act(async () => { clearTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const keep = required(document.querySelector<HTMLButtonElement>('[data-editor-clear-keep-repeated]'), 'keep repeated item');
      await act(async () => { keep.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(counts()).toEqual([1, 1, 1]);

      // Only the repeated box is left on page 1, so Clear page now offers
      // just "Clear everything", which removes this page's copy and no other.
      await act(async () => { query<HTMLButtonElement>(pageCards[0], '[data-editor-clear-page-trigger]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(document.querySelector('[data-editor-clear-keep-repeated]')).toBeNull();
      const everything = required(document.querySelector<HTMLButtonElement>('[data-editor-clear-everything]'), 'clear everything item');
      await act(async () => { everything.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(counts()).toEqual([0, 1, 1]);

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      expect(counts()).toEqual([1, 1, 1]);
    });

    it('Clear page on a page with no repeated box clears in one tap, as before', async () => {
      s.harness.pdfjs.pageCountOfNextRead(2);
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      const pageCard = query<HTMLElement>(s.container, '[data-editor-page-card]');
      expect(pageCard.querySelector('[data-editor-clear-page-trigger]')).toBeNull();
    });

    it('trash on a linked box removes only this page when "This page" is picked; the rest stay linked', async () => {
      s.harness.pdfjs.pageCountOfNextRead(3);
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      await selectFirstBox();
      await repeatSelectedBox();

      await pickFromBoxMenu('[data-editor-delete-scope-trigger]', '[data-editor-delete-this-page]');
      const pageCards = Array.from(s.container.querySelectorAll('[data-editor-page-card]'));
      expect(pageCards.map((card) => card.querySelectorAll('[data-redact-box-id]').length)).toEqual([0, 1, 1]);

      await selectBox(query<HTMLElement>(pageCards[1], '[data-redact-box-id]'));
      const trigger = query<HTMLElement>(s.container, '[data-editor-actions] [data-editor-repeat-group-trigger]');
      expect(trigger.textContent).toContain('2');
    });

    it('trash on a linked box removes every copy in one undo step when "All pages" is picked', async () => {
      s.harness.pdfjs.pageCountOfNextRead(3);
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      await selectFirstBox();
      await repeatSelectedBox();
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(3);

      await pickFromBoxMenu('[data-editor-delete-scope-trigger]', '[data-editor-delete-all-pages]');
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(0);

      const announcementRegion = required(
        s.container.querySelector<HTMLElement>('.sr-only[aria-live="polite"]'),
        'sr-only announcement region',
      );
      expect(announcementRegion.textContent).toContain('Removed the box from 3 pages');

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(3);
    });

    it('duplicating a linked box gives a second set on every page; changing the duplicate leaves the original set unchanged', async () => {
      s.harness.pdfjs.pageCountOfNextRead(3);
      const drawArea = await loadFileAndGetDrawArea();
      const whiteoutBtn = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
        .find((btn) => btn.textContent.includes('Whiteout')), 'Whiteout button');
      await act(async () => {
        whiteoutBtn.click();
      });
      await drawBox(drawArea, 50, 200, 200, 500);
      await selectFirstBox();
      await repeatSelectedBox();
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(3);

      const pageCards = Array.from(s.container.querySelectorAll('[data-editor-page-card]'));
      const firstBox = query<HTMLElement>(pageCards[0], '[data-redact-box-id]');
      await selectBox(firstBox);
      const duplicateButton = query<HTMLButtonElement>(s.container, '[data-editor-actions] button[title="Duplicate"]');
      await act(async () => {
        duplicateButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      pageCards.forEach((card) => {
        expect(card.querySelectorAll('[data-redact-box-id]')).toHaveLength(2);
      });
      expect(s.container.querySelectorAll('[data-redact-box-id]')).toHaveLength(6);

      // duplicateElement selects the duplicate of the box that was pressed
      // (page 0's), so its own toolbar/color trigger is already on screen.
      const originalColor = query<HTMLElement>(pageCards[0], '.redact-surface--whiteout').style.backgroundColor;
      await setSelectedBoxColor('#000000');

      pageCards.forEach((card) => {
        const surfaces = Array.from(card.querySelectorAll<HTMLElement>('.redact-surface--whiteout'));
        expect(surfaces).toHaveLength(2);
        // The original set (drawn first, so first in stacking/DOM order) kept its color.
        expect(surfaces[0].style.backgroundColor).toBe(originalColor);
      });
    });

    it('an old-style box with no repeatGroupId behaves as before: editing it never touches any other box', async () => {
      const drawArea = await loadFileAndGetDrawArea();
      await drawBox(drawArea, 50, 200, 200, 500);
      await armTool('Blackout');
      await drawBox(drawArea, 60, 220, 220, 520);
      const boxes = () => Array.from(s.container.querySelectorAll<HTMLElement>('[data-redact-box-id]'));
      expect(boxes()).toHaveLength(2);

      const secondWidthBefore = parseFloat(boxes()[1].style.width);
      await selectBox(boxes()[0]);
      await resizeBox(boxes()[0], 100, 100);

      expect(parseFloat(boxes()[1].style.width)).toBeCloseTo(secondWidthBefore);
    });
  });

  // RED-11: boxes added by one Find action ("Redact all") share a findSetId
  // (findSet.ts, pure), so they can be removed together and share blur
  // strength - the find-set equivalent of the repeat-group describe block
  // above, and modelled on its helpers.
  describe('found boxes stay a set (RED-11)', () => {
    // Two matches for "jane doe" on page 0 (same shape findMatches.test.ts builds its fixture with), so
    // "Redact all" always adds exactly 2 boxes. They arrive as the page's own text stream, read for real.
    // jsdom has no scrollIntoView; the current match's highlight calls it from a passive effect.
    beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
    afterEach(() => { delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView; });
    beforeEach(() => {
      const item = (str: string, x: number, y: number) => ({ str, transform: [12, 0, 0, 12, x, y], width: str.length * 6, height: 12 });
      s.harness.pdfjs.pageItems.set(0, [item('Jane Doe', 100, 700), item('Jane Doe again', 100, 600)]);
    });

    async function openFindAndSearch(term: string): Promise<void> {
      const toggle = query<HTMLButtonElement>(s.container, '[data-redact-find-toggle]');
      await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const input = query<HTMLInputElement>(s.container, '[data-redact-find-input]');
      await act(async () => {
        input.value = term;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      // The pages' text is read for real, page by page; "Cover all" is live once every page is read.
      await settleUntil('Find to read the pages', () => {
        const all = document.querySelector<HTMLButtonElement>('[data-redact-find-all]');
        return all !== null && !all.disabled && !all.hasAttribute('aria-pressed');
      });
    }

    async function chooseRedactStyle(label: 'Blackout' | 'Blur'): Promise<void> {
      const button = required(
        Array.from(s.container.querySelectorAll<HTMLButtonElement>('[data-redact-find-bar] button'))
          .find((b) => b.textContent === label),
        `${label} redact-style button`,
      );
      await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    }

    async function clickRedactAll(): Promise<void> {
      const button = query<HTMLButtonElement>(s.container, '[data-redact-find-all]');
      await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    }

    async function selectBox(box: HTMLElement): Promise<void> {
      await act(async () => { box.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0, bubbles: true })); });
      await act(async () => { window.dispatchEvent(new MouseEvent('mouseup')); });
    }

    // A box-toolbar menu (the delete-scope menu, or the blur-strength menu):
    // open it on the selected box, then pick an item. Popover portals the
    // menu to document.body, so the item is found there.
    async function pickFromBoxMenu(trigger: string, item: string): Promise<void> {
      const button = query<HTMLButtonElement>(s.container, `[data-editor-actions] ${trigger}`);
      await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const choice = required(document.querySelector<HTMLButtonElement>(item), item);
      await act(async () => { choice.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    }

    const boxes = () => Array.from(s.container.querySelectorAll<HTMLElement>('[data-redact-box-id]'));

    it('checks only deleted words automatically, never a Find search (RED-66)', async () => {
      s.restoreCanvas = installCanvasEdge();
      const originalCreateObjectURL = window.URL.createObjectURL;
      window.URL.createObjectURL = vi.fn(() => 'blob:redacted-pdf');
      try {
        await loadFileAndGetDrawArea();
        await openFindAndSearch('jane doe');
        await clickRedactAll();
        const download = required(Array.from(s.container.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
          .find((button) => button.textContent.includes('Download')), 'Download button');
        await act(async () => { download.click(); });
        // The saved file is checked on its own once it exists; no row is made for the search that found the boxes.
        await settleUntil('the saved-file check', () => s.container.querySelector('[data-saved-file-check]') !== null);
        expect(s.container.querySelector('[data-check-term]')).toBeNull();
        expect(s.container.querySelector('[data-saved-file-check]')?.textContent).not.toContain('jane doe');
      } finally {
        window.URL.createObjectURL = originalCreateObjectURL;
      }
    });

    it('gives every box added by Redact all one findSetId, offered as "All N from this search"', async () => {
      await loadFileAndGetDrawArea();
      await openFindAndSearch('jane doe');
      await clickRedactAll();
      expect(boxes()).toHaveLength(2);

      await selectBox(boxes()[0]);
      const trigger = query<HTMLElement>(s.container, '[data-editor-actions] [data-editor-delete-scope-trigger]');
      await act(async () => { trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const item = required(document.querySelector<HTMLButtonElement>('[data-editor-delete-find-set]'), 'find-set delete item');
      expect(item.textContent).toContain('All 2 from this search');
    });

    it('"All N from this search" removes exactly that search\'s boxes as one undo step; Undo restores them', async () => {
      const drawArea = await loadFileAndGetDrawArea(); // arms Blackout, spent by the drawBox below
      await openFindAndSearch('jane doe');
      await clickRedactAll();
      await drawBox(drawArea, 50, 750, 200, 780); // an unrelated box - must survive the find set's removal
      expect(boxes()).toHaveLength(3);

      await selectBox(boxes()[0]);
      await pickFromBoxMenu('[data-editor-delete-scope-trigger]', '[data-editor-delete-find-set]');
      expect(boxes()).toHaveLength(1);

      // Find's own input still has focus from opening it above -
      // useHistoryShortcuts deliberately ignores Ctrl/Cmd+Z while an
      // input/textarea is focused, so it must be blurred first.
      (document.activeElement as HTMLElement | null)?.blur();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      expect(boxes()).toHaveLength(3);
    });

    it('changing blur strength on one found box changes every box of its search, as one undo step', async () => {
      await loadFileAndGetDrawArea();
      await openFindAndSearch('jane doe');
      await chooseRedactStyle('Blur');
      await clickRedactAll();
      expect(boxes()).toHaveLength(2);

      const filterOf = (box: HTMLElement) => query<HTMLElement>(box, '.redact-surface__blur').style.backdropFilter;
      // RED-24: the page heights a blur box sizes itself from arrive async.
      await act(async () => {});
      const before = filterOf(boxes()[0]);
      expect(filterOf(boxes()[1])).toBe(before);

      await selectBox(boxes()[0]);
      // 0.22 is inside the slider's range and differs from what a fresh blur box
      // starts with (DEFAULT_BLUR_STRENGTH, blurStrength.ts).
      await dragBlurSlider(0.22);
      const after = filterOf(boxes()[0]);
      expect(after).not.toBe(before);
      expect(filterOf(boxes()[1])).toBe(after);

      // Find's own input still has focus from opening it above - blur it so
      // Ctrl+Z below is not swallowed by useHistoryShortcuts' input guard.
      (document.activeElement as HTMLElement | null)?.blur();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      expect(filterOf(boxes()[0])).toBe(before);
      expect(filterOf(boxes()[1])).toBe(before);
    });

    it('duplicating a found box makes an ordinary box with no findSetId', async () => {
      await loadFileAndGetDrawArea();
      await openFindAndSearch('jane doe');
      await clickRedactAll();
      expect(boxes()).toHaveLength(2);

      await selectBox(boxes()[0]);
      const duplicateButton = query<HTMLButtonElement>(s.container, '[data-editor-actions] button[title="Duplicate"]');
      await act(async () => { duplicateButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(boxes()).toHaveLength(3);

      // duplicateElement selects the new copy, so its own toolbar is on
      // screen: a plain trash button, since it belongs to no find set (and
      // no repeat group) any more.
      expect(s.container.querySelector('[data-editor-actions] [data-editor-delete-scope-trigger]')).toBeNull();
    });

    // A box can be in both sets at once: found by "Redact all" and then also
    // repeated onto every page. updateElement merges groupChanges and
    // findSetChanges by id (mergeChangesById), so an edit to it must reach
    // both the other found box on this page AND its own copies on other
    // pages, as one undo step.
    it('a found box that is also repeated: changing it updates the other found boxes and its copies on other pages, as one undo step', async () => {
      await loadFileAndGetDrawArea();
      await openFindAndSearch('jane doe');
      await chooseRedactStyle('Blur');
      await clickRedactAll();
      expect(boxes()).toHaveLength(2); // both found, both on page 0

      await selectBox(boxes()[0]);
      const repeatButton = query<HTMLButtonElement>(s.container, '[data-editor-actions] [data-editor-repeat-every-page]');
      await act(async () => { repeatButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(boxes()).toHaveLength(3); // the found box's copy landed on page 1

      const pageCards = Array.from(s.container.querySelectorAll('[data-editor-page-card]'));
      const boxesOnPage1 = Array.from(pageCards[0].querySelectorAll<HTMLElement>('[data-redact-box-id]'));
      const otherFoundBox = required(boxesOnPage1.find((box) => box !== boxes()[0]), 'the other found box on page 1');
      const copyOnPage2 = query<HTMLElement>(pageCards[1], '[data-redact-box-id]');
      const filterOf = (box: HTMLElement) => query<HTMLElement>(box, '.redact-surface__blur').style.backdropFilter;
      const before = filterOf(boxes()[0]);
      expect(filterOf(otherFoundBox)).toBe(before);
      expect(filterOf(copyOnPage2)).toBe(before);

      await selectBox(boxes()[0]);
      // 0.22 is inside the slider's range and differs from DEFAULT_BLUR_STRENGTH.
      await dragBlurSlider(0.22);
      const after = filterOf(boxes()[0]);
      expect(after).not.toBe(before);
      expect(filterOf(otherFoundBox)).toBe(after);
      expect(filterOf(copyOnPage2)).toBe(after);

      // Find's own input still has focus from opening it above - blur it so
      // Ctrl+Z below is not swallowed by useHistoryShortcuts' input guard.
      (document.activeElement as HTMLElement | null)?.blur();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      });
      expect(filterOf(boxes()[0])).toBe(before);
      expect(filterOf(otherFoundBox)).toBe(before);
      expect(filterOf(copyOnPage2)).toBe(before);
    });

    it('"All N from this search" on a box that is also repeated removes only the found boxes; its repeated copies on other pages stay', async () => {
      await loadFileAndGetDrawArea();
      await openFindAndSearch('jane doe');
      await clickRedactAll();
      expect(boxes()).toHaveLength(2);

      await selectBox(boxes()[0]);
      const repeatButton = query<HTMLButtonElement>(s.container, '[data-editor-actions] [data-editor-repeat-every-page]');
      await act(async () => { repeatButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(boxes()).toHaveLength(3);

      await selectBox(boxes()[0]);
      await pickFromBoxMenu('[data-editor-delete-scope-trigger]', '[data-editor-delete-find-set]');

      // Both found boxes on page 0 are gone; the repeated copy on page 1 stays.
      const pageCards = Array.from(s.container.querySelectorAll('[data-editor-page-card]'));
      expect(pageCards[0].querySelectorAll('[data-redact-box-id]')).toHaveLength(0);
      expect(pageCards[1].querySelectorAll('[data-redact-box-id]')).toHaveLength(1);
      expect(boxes()).toHaveLength(1);
    });

    it('a copy made by "repeat on every page" from a found box has no findSetId: its trash menu offers no "from this search" item', async () => {
      await loadFileAndGetDrawArea();
      await openFindAndSearch('jane doe');
      await clickRedactAll();
      expect(boxes()).toHaveLength(2);

      await selectBox(boxes()[0]);
      const repeatButton = query<HTMLButtonElement>(s.container, '[data-editor-actions] [data-editor-repeat-every-page]');
      await act(async () => { repeatButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(boxes()).toHaveLength(3);

      const pageCards = Array.from(s.container.querySelectorAll('[data-editor-page-card]'));
      const copyOnPage2 = query<HTMLElement>(pageCards[1], '[data-redact-box-id]');
      await selectBox(copyOnPage2);
      const trigger = query<HTMLElement>(s.container, '[data-editor-actions] [data-editor-delete-scope-trigger]');
      await act(async () => { trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(document.querySelector('[data-editor-delete-find-set]')).toBeNull();
    });
  });
});
