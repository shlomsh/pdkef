import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BLUR_STRENGTH, snapBlurStrength } from '#editor/model/blurStrength.ts';
import { rememberRecentWhiteoutColor } from '#editor/workspace/preferenceStore.ts';
import { mountRedactEditor, type MountedRedactEditor } from '../hooks/redactEditor.test-helper.tsx';
import type { RedactElement } from '../lib/redactElements.ts';

const box = (id: string, pageIndex: number, extra: Partial<RedactElement> = {}): RedactElement => (
  { id, pageIndex, type: 'blackout', left: 10, top: 20, width: 30, height: 10, ...extra } as RedactElement
);

type Loose = RedactElement & { color?: string; colorMode?: string; strength?: number; findSetId?: string; repeatGroupId?: string; left: number; top: number; width: number; height: number };

describe('Redact editor page column', () => {
  let mounted: MountedRedactEditor | undefined;
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => {
    mounted?.unmount();
    mounted = undefined;
  });

  const mount = (options: Parameters<typeof mountRedactEditor>[0] = {}) => {
    mounted = mountRedactEditor({ ...options, render: true });
    return mounted;
  };
  const drawArea = (m: MountedRedactEditor) => {
    const area = m.root.querySelector<HTMLElement>('.redact-draw-area');
    if (!area) throw new Error('Expected the page wrapper .redact-draw-area');
    return area;
  };

  describe('touch-action follows tool arming (mobile scroll fix)', () => {
    it('is auto (page scrolls) when a file first loads, before any tool is armed', () => {
      const m = mount();
      expect(drawArea(m).style.touchAction).toBe('auto');
    });

    it.each([['blackout'], ['whiteout'], ['blur']] as const)('is none while %s is armed, so a drag draws instead of scrolling', (tool) => {
      const m = mount();
      act(() => m.editor().arming.setTool(tool));
      expect(drawArea(m).style.touchAction).toBe('none');
    });

    it('stays auto while Delete is armed, since Delete places by tap and never owns the drag gesture', () => {
      const m = mount();
      act(() => m.editor().arming.setTool('delete'));
      expect(m.state().tool.activeStyle).toBe('delete');
      expect(drawArea(m).style.touchAction).toBe('auto');
    });

    // touch-action alone is not enough on iOS, the page's own touchmove has to be cancelled too, and that
    // only happens if the page wrapper really forwards a touchstart to the drawing hook.
    it('cancels the touchmove of a touch-drawn box, so the page does not scroll under the finger', () => {
      const m = mount();
      act(() => m.editor().arming.setTool('blackout'));
      const area = drawArea(m);
      act(() => { area.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true })); });
      expect(m.state().tool.drawingState).not.toBeNull();

      const move = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
      act(() => { window.dispatchEvent(move); });
      act(() => { window.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true })); });

      expect(move.defaultPrevented).toBe(true);
    });
  });

  describe('the repeat button and Clear page need more than one page of boxes', () => {
    const repeatButton = () => document.querySelector('[data-editor-actions] [data-editor-repeat-every-page]');

    it('shows no repeat trigger on a single-page document', () => {
      const m = mount({ numPages: 1, elements: [box('a', 0)] });
      m.dispatch({ type: 'BOX_SELECTED', id: 'a' });

      expect(document.querySelector('[data-editor-actions]')).not.toBeNull();
      expect(repeatButton()).toBeNull();
      expect(document.querySelector('[data-editor-repeat-group-trigger]')).toBeNull();
    });

    it('shows the repeat button on a selected box once there is another page', () => {
      const m = mount({ numPages: 2, elements: [box('a', 0)] });
      m.dispatch({ type: 'BOX_SELECTED', id: 'a' });

      expect(repeatButton()).not.toBeNull();
    });

    it('Clear page on a page with no repeated box is one tap, with no menu', () => {
      const m = mount({ numPages: 2, elements: [box('a', 0)] });
      const card = m.root.querySelector('[data-editor-page-card]');

      expect(card?.querySelector('[data-editor-page-header] button[title="Clear every box on this page"]')).toBeInstanceOf(HTMLElement);
      expect(card?.querySelector('[data-editor-clear-page-trigger]')).toBeNull();
    });

    it('Clear page on a page with a repeated box becomes a menu', () => {
      const m = mount({ numPages: 2, elements: [box('a', 0, { repeatGroupId: 'g' }), box('b', 1, { repeatGroupId: 'g' })] });
      const card = m.root.querySelector('[data-editor-page-card]');

      expect(card?.querySelector('[data-editor-clear-page-trigger]')).toBeInstanceOf(HTMLElement);
    });
  });
  describe('the selected box toolbar acts on the document', () => {
    const els = (m: MountedRedactEditor) => m.state().edits.elements as Loose[];
    const perPage = (m: MountedRedactEditor, pages: number) => Array.from({ length: pages }, (_, i) => els(m).filter((el) => el.pageIndex === i).length);
    const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const required = <T extends Element>(found: T | null, what: string): T => {
      if (!found) throw new Error(`Expected ${what}`);
      return found;
    };
    const inToolbar = (selector: string) => required(document.querySelector<HTMLElement>(`[data-editor-actions] ${selector}`), selector);
    const pick = (trigger: string, item: string) => {
      click(inToolbar(trigger));
      click(required(document.querySelector<HTMLElement>(item), item));
    };
    const select = (m: MountedRedactEditor, id: string) => m.dispatch({ type: 'BOX_SELECTED', id });
    const repeatFromToolbar = (m: MountedRedactEditor, id: string) => {
      select(m, id);
      click(inToolbar('[data-editor-repeat-every-page]'));
    };
    const whiteout = (id: string, extra: Partial<Loose> = {}) => box(id, 0, { type: 'whiteout', color: '#ffffff', colorMode: 'auto', ...extra } as Partial<RedactElement>);
    const blurBox = (id: string, pageIndex: number, extra: Partial<Loose> = {}) => box(id, pageIndex, { type: 'blur', strength: 0.25, ...extra } as Partial<RedactElement>);

    it('Duplicate adds a copy and selects it', () => {
      const m = mount({ elements: [box('a', 0)] });
      select(m, 'a');
      click(inToolbar('button[title="Duplicate"]'));

      expect(els(m)).toHaveLength(2);
      expect(m.state().selection.selectedBoxId).toBe(els(m)[1].id);
      expect(m.state().selection.selectedBoxId).not.toBe('a');
    });

    it('Delete on an unlinked box removes it', () => {
      const m = mount({ elements: [box('a', 0), box('b', 0, { top: 50 })] });
      select(m, 'a');
      click(inToolbar('button[title="Delete"]'));

      expect(els(m).map((el) => el.id)).toEqual(['b']);
    });

    it('Repeat on every page adds one linked copy to each other page', () => {
      const m = mount({ numPages: 3, elements: [box('a', 0)] });
      repeatFromToolbar(m, 'a');

      expect(perPage(m, 3)).toEqual([1, 1, 1]);
      expect(els(m).filter((el) => el.pageIndex > 0).map((el) => el.repeatGroupId)).toEqual(['a', 'a']);
    });

    it('the trash menu on a repeated box: "This page" removes only this copy, "All pages" removes every copy', () => {
      const m = mount({ numPages: 3, elements: [box('a', 0)] });
      repeatFromToolbar(m, 'a');

      pick('[data-editor-delete-scope-trigger]', '[data-editor-delete-this-page]');
      expect(perPage(m, 3)).toEqual([0, 1, 1]);
      expect(els(m).map((el) => el.repeatGroupId)).toEqual(['a', 'a']);

      select(m, els(m)[0].id);
      pick('[data-editor-delete-scope-trigger]', '[data-editor-delete-all-pages]');
      expect(els(m)).toHaveLength(0);
    });

    it('"Remove from the other pages" keeps this box and removes the other copies', () => {
      const m = mount({ numPages: 3, elements: [box('a', 0)] });
      repeatFromToolbar(m, 'a');
      const second = els(m).find((el) => el.pageIndex === 1)!.id;
      select(m, second);

      pick('[data-editor-repeat-group-trigger]', '[data-editor-repeat-group-keep-only]');

      expect(els(m).map((el) => el.id)).toEqual([second]);
    });

    it('"Unlink" detaches only this copy from its repeat group', () => {
      const m = mount({ numPages: 3, elements: [box('a', 0)] });
      repeatFromToolbar(m, 'a');
      const second = els(m).find((el) => el.pageIndex === 1)!;
      select(m, second.id);

      pick('[data-editor-repeat-group-trigger]', '[data-editor-repeat-group-unlink]');

      const after = (page: number) => els(m).find((el) => el.pageIndex === page)!;
      expect(perPage(m, 3)).toEqual([1, 1, 1]);
      expect(after(1).repeatGroupId).toBeDefined();
      expect(after(1).repeatGroupId).not.toBe(second.repeatGroupId);
      expect(second.repeatGroupId).toBe('a');
      expect(after(2).repeatGroupId).toBe('a');
    });

    it('a box both found and repeated: "All pages" removes its copies and keeps its search mates, the search item removes the mates and keeps the copies', () => {
      const linked = () => [
        blurBox('a', 0, { repeatGroupId: 'g', findSetId: 's' }),
        blurBox('b', 1, { repeatGroupId: 'g' }),
        blurBox('c', 0, { top: 50, findSetId: 's' }),
      ];
      const m = mount({ numPages: 2, elements: linked() });
      select(m, 'a');
      pick('[data-editor-delete-scope-trigger]', '[data-editor-delete-all-pages]');
      expect(els(m).map((el) => el.id)).toEqual(['c']);
      m.unmount();

      const second = mount({ numPages: 2, elements: linked() });
      select(second, 'a');
      pick('[data-editor-delete-scope-trigger]', '[data-editor-delete-find-set]');
      expect(els(second).map((el) => el.id)).toEqual(['b']);
    });

    it('a found box without copies: the trash menu removes every box of its search', () => {
      const m = mount({ elements: [blurBox('a', 0, { findSetId: 's' }), blurBox('b', 0, { top: 50, findSetId: 's' }), blurBox('c', 0, { top: 70 })] });
      select(m, 'a');
      pick('[data-editor-delete-scope-trigger]', '[data-editor-delete-find-set]');

      expect(els(m).map((el) => el.id)).toEqual(['c']);
    });

    it('a picked colour makes the whiteout custom, and is offered as a recent colour', () => {
      const m = mount({ elements: [whiteout('a')] });
      select(m, 'a');
      const input = inToolbar('input[type="color"]') as HTMLInputElement;
      act(() => {
        input.value = '#112233';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });

      expect(els(m)[0]).toMatchObject({ color: '#112233', colorMode: 'custom' });
      expect(inToolbar('[data-whiteout-color-recent="#112233"]').getAttribute('aria-pressed')).toBe('true');
    });

    it('a recent colour tile sets that colour, and Auto follows the page again', () => {
      rememberRecentWhiteoutColor('#abcdef', []);
      const m = mount({ elements: [whiteout('a')] });
      select(m, 'a');
      expect(inToolbar('[data-whiteout-color-auto]').getAttribute('aria-pressed')).toBe('true');

      click(inToolbar('[data-whiteout-color-recent="#abcdef"]'));
      expect(els(m)[0]).toMatchObject({ color: '#abcdef', colorMode: 'custom' });
      expect(inToolbar('[data-whiteout-color-auto]').getAttribute('aria-pressed')).toBe('false');

      click(inToolbar('[data-whiteout-color-auto]'));
      expect(els(m)[0].colorMode).toBe('auto');
      expect(inToolbar('[data-whiteout-color-auto]').getAttribute('aria-pressed')).toBe('true');
    });

    it('the pipette arms and disarms the box eyedropper', () => {
      const m = mount({ elements: [whiteout('a')] });
      select(m, 'a');
      expect(m.state().tool.eyedropping).toBeFalsy();

      click(inToolbar('[data-whiteout-color-eyedropper]'));
      expect(m.state().tool.eyedropping).toBe('box');
      expect(inToolbar('[data-whiteout-color-eyedropper]').getAttribute('aria-pressed')).toBe('true');

      click(inToolbar('[data-whiteout-color-eyedropper]'));
      expect(m.state().tool.eyedropping).toBeFalsy();
    });

    it('the blur slider sets the box strength once, on release', () => {
      const m = mount({ elements: [blurBox('a', 0)] });
      select(m, 'a');
      const input = inToolbar('input[type="range"]') as HTMLInputElement;
      act(() => {
        input.value = '0.12';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(els(m)[0].strength).toBe(0.25);

      act(() => { input.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(els(m)[0].strength).toBe(snapBlurStrength(0.12));
      expect(els(m)[0].strength).not.toBe(DEFAULT_BLUR_STRENGTH);
    });
  });

  describe('the box itself', () => {
    const els = (m: MountedRedactEditor) => m.state().edits.elements as Loose[];
    const boxEl = (id: string) => {
      const found = document.querySelector<HTMLElement>(`[data-redact-box-id="${id}"]`);
      if (!found) throw new Error(`Expected box ${id}`);
      return found;
    };
    const frame = (area: HTMLElement) => {
      const rect = { left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON() {} } as DOMRect;
      // forced: jsdom lays nothing out
      area.getBoundingClientRect = () => rect;
    };

    it('hovering sets and clears the active box', () => {
      const m = mount({ elements: [box('a', 0)] });
      act(() => { boxEl('a').dispatchEvent(new MouseEvent('mouseenter')); });
      expect(m.state().selection.activeBoxId).toBe('a');
      act(() => { boxEl('a').dispatchEvent(new MouseEvent('mouseleave')); });
      expect(m.state().selection.activeBoxId).toBeNull();
    });

    it('pressing a box selects it and shows its toolbar', () => {
      const m = mount({ elements: [box('a', 0), box('b', 0, { top: 60 })] });
      expect(document.querySelector('[data-editor-actions]')).toBeNull();

      act(() => { boxEl('b').dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10, bubbles: true })); });
      act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });

      expect(m.state().selection.selectedBoxId).toBe('b');
      expect(boxEl('b').hasAttribute('data-selected')).toBe(true);
      expect(boxEl('a').hasAttribute('data-selected')).toBe(false);
      expect(document.querySelector('[data-editor-actions]')).not.toBeNull();
    });

    it('dragging a box moves it inside its page', () => {
      const m = mount({ elements: [box('a', 0)] });
      frame(drawArea(m));
      act(() => { boxEl('a').dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true })); });
      act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 300 })); });
      act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 300 })); });
      act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });

      expect(els(m)[0].left).toBeCloseTo(20);
      expect(els(m)[0].top).toBeCloseTo(40);
    });

    it('dragging the corner handle resizes the box', () => {
      const m = mount({ elements: [box('a', 0)] });
      frame(drawArea(m));
      m.dispatch({ type: 'BOX_SELECTED', id: 'a' });
      const handle = boxEl('a').querySelector<HTMLElement>('[data-editor-resizer="bottom-right"]');
      if (!handle) throw new Error('Expected the bottom-right handle');
      act(() => { handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, clientY: 300, bubbles: true })); });
      act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 400 })); });
      act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 400 })); });
      act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });

      expect(els(m)[0].width).toBeCloseTo(40);
      expect(els(m)[0].height).toBeCloseTo(20);
    });

    it('holding Peek marks every box as peeking, and releasing clears it', () => {
      mount({ elements: [box('a', 0)] });
      const peek = document.querySelector<HTMLElement>('[data-redact-peek]');
      if (!peek) throw new Error('Expected the Peek button');
      act(() => { peek.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true })); });
      expect(boxEl('a').hasAttribute('data-peeking')).toBe(true);
      act(() => { peek.dispatchEvent(new Event('pointerup', { bubbles: true })); });
      expect(boxEl('a').hasAttribute('data-peeking')).toBe(false);
    });
  });

  describe('Clear page', () => {
    const els = (m: MountedRedactEditor) => m.state().edits.elements;
    const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const card = (m: MountedRedactEditor, page: number) => {
      const found = m.root.querySelectorAll('[data-editor-page-card]')[page];
      if (!found) throw new Error(`Expected page card ${page}`);
      return found;
    };
    const item = (selector: string) => {
      const found = document.querySelector<HTMLElement>(selector);
      if (!found) throw new Error(`Expected ${selector}`);
      return found;
    };
    const repeated = () => [box('a', 0, { repeatGroupId: 'g' }), box('b', 1, { repeatGroupId: 'g' }), box('own', 0, { top: 60 })];

    it('one tap clears every box on that page only', () => {
      const m = mount({ numPages: 2, elements: [box('a', 0), box('b', 0, { top: 50 }), box('c', 1)] });
      click(card(m, 0).querySelector('button[title="Clear every box on this page"]')!);

      expect(els(m).map((el) => el.id)).toEqual(['c']);
    });

    it('"Keep the repeated boxes" clears only the page\'s own boxes', () => {
      const m = mount({ numPages: 2, elements: repeated() });
      click(card(m, 0).querySelector('[data-editor-clear-page-trigger]')!);
      click(item('[data-editor-clear-keep-repeated]'));

      expect(els(m).map((el) => el.id)).toEqual(['a', 'b']);
    });

    it('"Clear everything" clears the page including its repeated box, and leaves the other copies', () => {
      const m = mount({ numPages: 2, elements: repeated() });
      click(card(m, 0).querySelector('[data-editor-clear-page-trigger]')!);
      click(item('[data-editor-clear-everything]'));

      expect(els(m).map((el) => el.id)).toEqual(['b']);
    });
  });
  describe('drawing on the page', () => {
    const els = (m: MountedRedactEditor) => m.state().edits.elements as Loose[];
    const frame = (el: HTMLElement) => {
      // forced: jsdom lays nothing out
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 1000, right: 500, bottom: 1000, x: 0, y: 0, toJSON() {} }) as DOMRect;
    };

    it('dragging with a tool armed draws one box where the pointer went, and a press that draws nothing keeps the tool armed', () => {
      const m = mount();
      frame(drawArea(m));
      act(() => m.editor().arming.setTool('blackout'));

      act(() => { drawArea(m).dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 100, bubbles: true, cancelable: true })); });
      act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });
      expect(els(m)).toHaveLength(0);
      expect(m.state().tool.activeStyle).toBe('blackout');

      act(() => { drawArea(m).dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 100, bubbles: true, cancelable: true })); });
      act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 300 })); });
      act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250, clientY: 300 })); });
      act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });

      expect(els(m)).toHaveLength(1);
      expect(els(m)[0]).toMatchObject({ type: 'blackout', left: 10, top: 10, width: 40, height: 20 });
      expect(m.state().tool.activeStyle).toBeNull();
    });

    it('painting with the brush adds a stroke and keeps the brush armed', () => {
      const m = mount();
      act(() => m.editor().arming.changeBrush({ mode: 'brush', size: 12 }));
      act(() => m.editor().arming.setTool('whiteout'));
      const layer = m.root.querySelector<HTMLElement>('[data-brush-layer]');
      if (!layer) throw new Error('Expected the brush layer');
      frame(layer);

      act(() => { layer.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 200, bubbles: true, cancelable: true })); });
      act(() => { window.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, clientY: 220 })); });
      act(() => { window.dispatchEvent(new MouseEvent('mouseup')); });

      expect(els(m).map((el) => el.type)).toEqual(['whiteoutStroke']);
      expect(m.root.querySelector('[data-brush-layer]')).not.toBeNull();
    });
  });
});
