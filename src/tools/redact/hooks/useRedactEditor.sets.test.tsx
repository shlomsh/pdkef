import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BLUR_STRENGTH } from '#editor/model/blurStrength.ts';
import { listDeletableObjects } from '../lib/deleteObjects.js';
import type { RedactElement } from '../lib/redactElements.ts';
import { mountRedactEditor, type MountedRedactEditor } from './redactEditor.test-helper.tsx';
import type { RedactEditor } from './useRedactEditor.ts';

const box = (id: string, pageIndex: number, extra: Partial<RedactElement> = {}): RedactElement => (
  { id, pageIndex, type: 'blackout', left: 10, top: 20, width: 30, height: 10, ...extra } as RedactElement
);
const blur = (id: string, pageIndex: number, extra: Partial<RedactElement> = {}): RedactElement => (
  box(id, pageIndex, { type: 'blur', strength: DEFAULT_BLUR_STRENGTH, findSetId: 'search', ...extra } as Partial<RedactElement>)
);

describe('useRedactEditor: repeated and found sets', () => {
  let mounted: MountedRedactEditor | undefined;
  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  const mount = (options: Parameters<typeof mountRedactEditor>[0] = {}) => {
    mounted = mountRedactEditor(options);
    return mounted;
  };
  const run = (m: MountedRedactEditor, edit: (editor: RedactEditor) => void) => { act(() => edit(m.editor())); };
  const elements = (m: MountedRedactEditor) => m.state().edits.elements as Array<RedactElement & { width: number; height: number; strength?: number; findSetId?: string; repeatGroupId?: string }>;
  const onPage = (m: MountedRedactEditor, page: number) => elements(m).filter((el) => el.pageIndex === page);
  const perPage = (m: MountedRedactEditor, pages: number) => Array.from({ length: pages }, (_, i) => onPage(m, i).length);
  const undo = (m: MountedRedactEditor) => run(m, (e) => e.editing.undoLast());
  const redo = (m: MountedRedactEditor) => run(m, (e) => e.editing.redoLast());
  const repeated = (m: MountedRedactEditor, pages = 3) => {
    run(m, (e) => e.editing.repeatOnEveryPage('a'));
    expect(perPage(m, pages)).toEqual(Array(pages).fill(1));
  };

  describe('repeat a box on every page (RED-03)', () => {
    it('adds a copy to every other page as one undo step, redoes as one step, and repeating again adds nothing more', () => {
      const m = mount({ numPages: 3, elements: [box('a', 0)] });
      repeated(m);
      expect(m.announcement()).toContain('Added the box to 2 more pages');
      const historyLength = m.state().edits.history.past.length;

      run(m, (e) => e.editing.repeatOnEveryPage('a'));
      expect(elements(m)).toHaveLength(3);
      expect(m.state().edits.history.past).toHaveLength(historyLength);

      undo(m);
      expect(perPage(m, 3)).toEqual([1, 0, 0]);

      redo(m);
      expect(perPage(m, 3)).toEqual([1, 1, 1]);
    });

    it('resizing one linked copy resizes every copy as one undo step, and redo reapplies it', () => {
      const m = mount({ numPages: 3, elements: [box('a', 0)] });
      repeated(m);
      const widthBefore = elements(m)[0].width;
      expect(elements(m).every((el) => el.width === widthBefore)).toBe(true);

      const second = onPage(m, 1)[0].id;
      run(m, (e) => e.editing.updateElement(second, { width: widthBefore + 12, height: 17 }));
      const widthAfter = widthBefore + 12;
      expect(elements(m).map((el) => el.width)).toEqual([widthAfter, widthAfter, widthAfter]);
      expect(elements(m).map((el) => el.height)).toEqual([17, 17, 17]);

      undo(m);
      expect(elements(m).map((el) => el.width)).toEqual([widthBefore, widthBefore, widthBefore]);
      expect(elements(m).map((el) => el.height)).toEqual([10, 10, 10]);

      redo(m);
      expect(elements(m).map((el) => el.width)).toEqual([widthAfter, widthAfter, widthAfter]);
      expect(elements(m).map((el) => el.height)).toEqual([17, 17, 17]);
    });

    it("unlinking a copy stops it following its former group's edits", () => {
      const m = mount({ numPages: 3, elements: [box('a', 0)] });
      repeated(m);
      const second = onPage(m, 1)[0].id;
      run(m, (e) => e.editing.unlinkFromGroup(second));

      const widthBefore = onPage(m, 0)[0].width;
      run(m, (e) => e.editing.updateElement('a', { width: widthBefore + 12 }));

      expect(onPage(m, 0)[0].width).toBe(widthBefore + 12);
      // Still linked to page 1's box (the group's own key never moved): it follows.
      expect(onPage(m, 2)[0].width).toBe(widthBefore + 12);
      // Unlinked before the resize: untouched by it.
      expect(onPage(m, 1)[0].width).toBe(widthBefore);
    });

    it('keepOnlyThis removes the other copies in one undo step', () => {
      const m = mount({ numPages: 3, elements: [box('a', 0)] });
      repeated(m);
      const second = onPage(m, 1)[0].id;

      run(m, (e) => e.editing.keepOnlyThis(second));
      expect(elements(m)).toHaveLength(1);
      expect(onPage(m, 1)).toHaveLength(1);

      undo(m);
      expect(elements(m)).toHaveLength(3);
    });

    it('clearPageOptions offers "keep the repeated boxes" and "clear everything", and the first clears only the page\'s own boxes', () => {
      const m = mount({ numPages: 3, elements: [box('a', 0)] });
      repeated(m);
      run(m, (e) => e.editing.commitDrawn(0, 'blackout', { left: 60, top: 60, width: 20, height: 10 })); // a box only page 1 has
      expect(perPage(m, 3)).toEqual([2, 1, 1]);

      const options = () => m.editor().editing.clearPageOptions(0) ?? [];
      const keepRepeated = options().find((item) => item.attrs?.['data-editor-clear-keep-repeated']);
      if (!keepRepeated) throw new Error('Expected the keep-repeated item');
      act(() => keepRepeated.onSelect());
      expect(perPage(m, 3)).toEqual([1, 1, 1]);

      // Only the repeated box is left on page 1, so Clear page now offers just "Clear everything".
      expect(options().some((item) => item.attrs?.['data-editor-clear-keep-repeated'])).toBe(false);
      const everything = options().find((item) => item.attrs?.['data-editor-clear-everything']);
      if (!everything) throw new Error('Expected the clear-everything item');
      act(() => everything.onSelect());
      expect(perPage(m, 3)).toEqual([0, 1, 1]);

      undo(m);
      expect(perPage(m, 3)).toEqual([1, 1, 1]);
    });

    it('deleteElement on a linked box removes only that box; the other copies stay linked', () => {
      const m = mount({ numPages: 3, elements: [box('a', 0)], render: true });
      repeated(m);

      run(m, (e) => e.editing.deleteElement('a'));
      expect(perPage(m, 3)).toEqual([0, 1, 1]);
      const [second, third] = [onPage(m, 1)[0], onPage(m, 2)[0]];
      expect(second.repeatGroupId).toBeDefined();
      expect(third.repeatGroupId).toBe(second.repeatGroupId);

      m.dispatch({ type: 'BOX_SELECTED', id: second.id });
      const trigger = document.querySelector('[data-editor-actions] [data-editor-repeat-group-trigger]');
      expect(trigger?.textContent).toContain('2');
    });

    it('removeLinked on a repeat group removes every copy in one undo step', () => {
      const m = mount({ numPages: 3, elements: [box('a', 0)] });
      repeated(m);

      run(m, (e) => e.editing.removeLinked('a', 'repeatGroup'));
      expect(elements(m)).toHaveLength(0);
      expect(m.announcement()).toContain('Removed the box from 3 pages');

      undo(m);
      expect(elements(m)).toHaveLength(3);
    });
  });

  describe('found boxes stay a set (RED-11)', () => {
    const found = () => [blur('a', 0), blur('b', 0, { top: 40 })];
    const strengths = (m: MountedRedactEditor) => elements(m).map((el) => el.strength);

    it('changeBlurStrength on one found box changes every box of its search, as one undo step', () => {
      const m = mount({ numPages: 2, elements: found() });
      expect(strengths(m)).toEqual([DEFAULT_BLUR_STRENGTH, DEFAULT_BLUR_STRENGTH]);

      // 0.22 is inside the slider's range and differs from DEFAULT_BLUR_STRENGTH.
      run(m, (e) => e.editing.changeBlurStrength('a', 0.22));
      expect(strengths(m)).toEqual([0.22, 0.22]);

      undo(m);
      expect(strengths(m)).toEqual([DEFAULT_BLUR_STRENGTH, DEFAULT_BLUR_STRENGTH]);
    });

    it('duplicateElement on a found box makes an ordinary box with no findSetId', () => {
      const m = mount({ numPages: 2, elements: found(), render: true });
      m.dispatch({ type: 'BOX_SELECTED', id: 'a' });
      expect(document.querySelector('[data-editor-actions] [data-editor-delete-scope-trigger]')).not.toBeNull();

      run(m, (e) => e.editing.duplicateElement('a'));
      expect(elements(m)).toHaveLength(3);
      const copy = elements(m).find((el) => el.id !== 'a' && el.id !== 'b');
      expect(copy?.findSetId).toBeUndefined();

      // duplicateElement selects the new copy, so its own toolbar is on screen: a plain trash
      // button, since it belongs to no find set (and no repeat group) any more.
      expect(m.state().selection.selectedBoxId).toBe(copy?.id);
      expect(document.querySelector('[data-editor-actions] [data-editor-delete-scope-trigger]')).toBeNull();
    });

    // A box can be in both sets at once: found by "Redact all" and then also repeated onto every
    // page, so an edit to it must reach both the other found box on this page and its own copies.
    it('a found box that is also repeated: changing it updates the other found boxes and its copies on other pages, as one undo step', () => {
      const m = mount({ numPages: 2, elements: found() });
      run(m, (e) => e.editing.repeatOnEveryPage('a'));
      expect(elements(m)).toHaveLength(3);
      expect(perPage(m, 2)).toEqual([2, 1]);

      run(m, (e) => e.editing.changeBlurStrength('a', 0.22));
      expect(strengths(m)).toEqual([0.22, 0.22, 0.22]);

      undo(m);
      expect(strengths(m)).toEqual([DEFAULT_BLUR_STRENGTH, DEFAULT_BLUR_STRENGTH, DEFAULT_BLUR_STRENGTH]);
    });

    it('removeLinked on a found box that is also repeated removes only the found boxes; its repeated copies on other pages stay', () => {
      const m = mount({ numPages: 2, elements: found() });
      run(m, (e) => e.editing.repeatOnEveryPage('a'));
      expect(elements(m)).toHaveLength(3);

      run(m, (e) => e.editing.removeLinked('a', 'findSet'));

      // Both found boxes on page 0 are gone; the repeated copy on page 1 stays.
      expect(perPage(m, 2)).toEqual([0, 1]);
      expect(elements(m)).toHaveLength(1);
    });

    it('a copy made by "repeat on every page" from a found box has no findSetId: its trash menu offers no "from this search" item', () => {
      const m = mount({ numPages: 2, elements: found(), render: true });
      run(m, (e) => e.editing.repeatOnEveryPage('a'));
      const copy = onPage(m, 1)[0];
      expect(copy.findSetId).toBeUndefined();

      m.dispatch({ type: 'BOX_SELECTED', id: copy.id });
      const trigger = document.querySelector<HTMLElement>('[data-editor-actions] [data-editor-delete-scope-trigger]');
      if (!trigger) throw new Error('Expected the trash scope trigger');
      act(() => { trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(document.querySelector('[data-editor-delete-all-pages]')).not.toBeNull();
      expect(document.querySelector('[data-editor-delete-find-set]')).toBeNull();
    });
  });

  describe('the Delete tool', () => {
    const fixture = () => {
      const bytes = readFileSync(join(import.meta.dirname, '../../../lib/__fixtures__/num-1.pdf'));
      return new Uint8Array(bytes).buffer;
    };

    // RED-13: a marked object has no mark of its own, and the toolbar's Undo is how it comes back.
    it('marking an object spends the arming and queues it once; the toolbar Undo brings it back', async () => {
      const fileBytes = fixture();
      const [object] = await listDeletableObjects(fileBytes);
      const m = mount({ numPages: 1, fileBytes, render: true });
      run(m, (e) => e.arming.setTool('delete'));
      expect(m.state().tool.activeStyle).toBe('delete');

      run(m, (e) => e.editing.deleteTool.markObject(object));

      expect(m.state().tool.activeStyle).toBeNull();
      expect(m.editor().editing.deleteTool.markedForDeletionIds.has(object.id)).toBe(true);
      expect(elements(m).map((el) => el.type)).toEqual(['delete']);

      run(m, (e) => e.arming.setTool('delete'));
      expect(m.editor().editing.deleteTool.markedForDeletionIds.has(object.id)).toBe(true);

      const undoButton = Array.from(m.root.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')).find((btn) => btn.title === 'Undo');
      if (!undoButton) throw new Error('Expected the toolbar Undo button');
      act(() => undoButton.click());
      expect(elements(m)).toHaveLength(0);
      expect(m.editor().editing.deleteTool.markedForDeletionIds.has(object.id)).toBe(false);
    });

    it('does not start a redaction-box drag gesture while the Delete tool is active', () => {
      const m = mount({ numPages: 1, render: true });
      run(m, (e) => e.arming.setTool('delete'));
      const area = m.root.querySelector<HTMLElement>('.redact-draw-area');
      if (!area) throw new Error('Expected .redact-draw-area');

      act(() => { area.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10, bubbles: true })); });
      expect(m.state().tool.drawingState).toBeNull();
      act(() => { area.dispatchEvent(new MouseEvent('mousemove', { clientX: 90, clientY: 90, bubbles: true })); });
      act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });

      expect(elements(m)).toHaveLength(0);
    });
  });

  describe('delete and clear-page announce and offer an undo chip (finding #3)', () => {
    // The chip rides in EditorToolStatus's own stack, so it is the shown role="status" row inside
    // the status slot, over the same hidden reservations the armed rows use.
    const statusSlot = (m: MountedRedactEditor) => {
      const slot = m.root.querySelector<HTMLElement>('[data-tool-status] [role="status"]');
      if (!slot) throw new Error('Expected the status chip');
      return slot;
    };
    const chipUndo = (m: MountedRedactEditor) => {
      const button = statusSlot(m).querySelector<HTMLButtonElement>('[role="status"] button');
      if (!button) throw new Error('Expected the chip Undo button');
      return button;
    };

    it('announces and offers Undo when a single box is deleted, and Undo restores it', () => {
      const m = mount({ numPages: 1, elements: [box('a', 0)], render: true });
      m.dispatch({ type: 'BOX_SELECTED', id: 'a' });
      const deleteButton = document.querySelector<HTMLButtonElement>('[data-editor-actions] button[title="Delete"]');
      if (!deleteButton) throw new Error('Expected the toolbar Delete button');
      act(() => { deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

      expect(elements(m)).toHaveLength(0);
      expect(m.announcement()).toContain('Removed the blackout box');

      const chip = statusSlot(m);
      expect(chip.querySelector('[role="status"] > span')).not.toBeNull();
      expect(chip.textContent).toContain('Removed the blackout box');
      // The chip did not replace the stack: every tool's hidden reservation is still there under it,
      // and the shell is told the slot is live.
      const help = chip.closest<HTMLElement>('[data-tool-status]');
      expect(help?.hasAttribute('data-status-active')).toBe(true);
      expect(help?.querySelectorAll('[data-help-row]:not([data-shown])').length).toBeGreaterThanOrEqual(4);

      act(() => chipUndo(m).click());

      expect(elements(m)).toHaveLength(1);
      expect(m.announcement()).toContain('Undid: Removed the blackout box');
    });

    it('announces and offers Undo when a page is cleared, and Undo restores every box', () => {
      const m = mount({ numPages: 1, elements: [box('a', 0), box('b', 0, { top: 50 })], render: true });
      const clear = m.root.querySelector<HTMLButtonElement>('button[title="Clear every box on this page"]');
      if (!clear) throw new Error('Expected the Clear page button');
      act(() => clear.click());

      expect(elements(m)).toHaveLength(0);
      expect(m.announcement()).toContain('Cleared 2 boxes on page 1');
      expect(statusSlot(m).textContent).toContain('Cleared 2 boxes on page 1');

      act(() => chipUndo(m).click());

      expect(elements(m)).toHaveLength(2);
    });
  });
});
