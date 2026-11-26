import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStroke } from '#editor/model/strokeGeometry.ts';
import { listDeletableObjects } from '../lib/deleteObjects.js';
import { DEFAULT_BLUR_STRENGTH } from '#editor/model/blurStrength.ts';
import { getAppStyle, getRecentWhiteoutColors, rememberAppStyle, rememberRecentWhiteoutColor } from '#editor/workspace/preferenceStore.ts';
import { sampleRingColor } from '#editor-ui/whiteout/pageSampling.ts';
import { recentActions, resetActionTrailForTests } from '#lib/telemetry/actionTrail.ts';
import type { PercentBox } from '#editor-ui/whiteout/pageColor.ts';
import type { RedactElement } from '../lib/redactElements.ts';
import { setScreen } from '../../../test/support/screen.ts';
import { mountRedactEditor, type MountedRedactEditor } from './redactEditor.test-helper.tsx';
import type { RedactEditor } from './useRedactEditor.ts';

vi.mock('#editor-ui/whiteout/pageSampling.ts', { spy: true });

const BOX: PercentBox = { left: 10, top: 20, width: 20, height: 30 };
const SECOND: PercentBox = { left: 40, top: 50, width: 20, height: 30 };

describe('useRedactEditor over the real reducer', () => {
  let m: MountedRedactEditor;

  beforeEach(() => {
    localStorage.clear();
    resetActionTrailForTests();
    vi.mocked(sampleRingColor).mockClear();
  });
  afterEach(() => {
    m?.unmount();
    m = undefined as never;
  });

  const keydown = (init: KeyboardEventInit) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })); });
  const undoKey = () => keydown({ key: 'z', ctrlKey: true });
  const redoKey = () => keydown({ key: 'z', ctrlKey: true, shiftKey: true });
  const escape = () => keydown({ key: 'Escape' });
  const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

  const arm = (tool: Parameters<RedactEditor['arming']['setTool']>[0], locked = false) => {
    act(() => m.editor().arming.setTool(tool, locked));
  };
  const draw = (type: 'blackout' | 'whiteout' | 'blur', patch: PercentBox = BOX, pageIndex = 0) => {
    act(() => m.editor().editing.commitDrawn(pageIndex, type, patch));
  };
  const elements = () => m.state().edits.elements;
  const only = () => elements()[0];
  const box = (id: string, extra: Partial<RedactElement> = {}): RedactElement => ({ id, pageIndex: 0, type: 'whiteout', ...BOX, color: '#abcdef', ...extra } as RedactElement);
  const toolButton = (label: string) => {
    const button = Array.from(m.root.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')).find((b) => b.querySelector('span')?.textContent === label);
    if (!button) throw new Error(`no ${label} button`);
    return button;
  };
  const drawArea = () => m.root.querySelector<HTMLElement>('.redact-draw-area')!;
  const statusChip = () => m.root.querySelector<HTMLButtonElement>('[data-tool-status] [role="status"] button');

  describe('arming', () => {
    it('a committed box returns a one-shot tool to nothing armed, so the page scrolls again', () => {
      m = mountRedactEditor({ render: true });
      arm('blackout');
      expect(drawArea().style.touchAction).toBe('none');

      draw('blackout');

      expect(elements()).toHaveLength(1);
      expect(m.state().tool.activeStyle).toBeNull();
      expect(drawArea().style.touchAction).toBe('auto');
    });

    it('does not draw a second box after the first commits without re-arming', () => {
      m = mountRedactEditor({ render: true });
      arm('blackout');
      draw('blackout');
      expect(elements()).toHaveLength(1);

      const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      act(() => { drawArea().dispatchEvent(press); });

      expect(press.defaultPrevented).toBe(false);
      expect(m.state().tool.drawingState).toBeNull();
      expect(elements()).toHaveLength(1);
    });

    it('draws a second box once the tool is re-armed', () => {
      m = mountRedactEditor();
      arm('blackout');
      draw('blackout');
      arm('blackout');
      draw('blackout', SECOND);

      expect(elements()).toHaveLength(2);
    });

    it('a drag that draws nothing does not spend the arming', () => {
      m = mountRedactEditor({ render: true });
      arm('blackout');

      draw('blackout', { left: 10, top: 20, width: 0, height: 0 });
      expect(elements()).toHaveLength(0);
      expect(m.state().tool.activeStyle).toBe('blackout');
      expect(drawArea().style.touchAction).toBe('none');

      draw('blackout');
      expect(elements()).toHaveLength(1);
    });

    it('a locked tool stays armed across two drawn boxes and its button is marked locked', () => {
      m = mountRedactEditor({ render: true });
      arm('blackout', true);
      expect(toolButton('Blackout').hasAttribute('data-locked')).toBe(true);

      draw('blackout');
      expect(elements()).toHaveLength(1);
      expect(toolButton('Blackout').hasAttribute('data-locked')).toBe(true);

      draw('blackout', SECOND);
      expect(elements()).toHaveLength(2);
      expect(m.state().tool.activeStyle).toBe('blackout');
    });

    it('turning the keep-on chip off returns a locked tool to one at a time and stays on screen', () => {
      m = mountRedactEditor({ render: true });
      arm('blackout', true);
      expect(statusChip()!.getAttribute('aria-checked')).toBe('true');

      click(statusChip()!);

      expect(statusChip()).not.toBeNull();
      expect(statusChip()!.getAttribute('aria-checked')).toBe('false');
      expect(toolButton('Blackout').hasAttribute('data-locked')).toBe(false);
      expect(toolButton('Blackout').getAttribute('aria-pressed')).toBe('true');
    });

    it('leaves stopping a locked tool to Escape', () => {
      m = mountRedactEditor({ render: true });
      arm('blackout', true);
      expect(drawArea().style.touchAction).toBe('none');

      escape();

      expect(m.root.querySelector('[data-tool-status] [role="status"]')).toBeNull();
      expect(drawArea().style.touchAction).toBe('auto');
    });

    it('Escape disarms a one-shot armed tool and restores scrolling', () => {
      m = mountRedactEditor({ render: true });
      arm('blackout');
      expect(drawArea().style.touchAction).toBe('none');

      escape();

      expect(m.root.querySelector('[data-tool-status] [role="status"]')).toBeNull();
      expect(drawArea().style.touchAction).toBe('auto');
      expect(m.state().tool.activeStyle).toBeNull();
    });

    it('Escape disarms a locked tool too', () => {
      m = mountRedactEditor({ render: true });
      arm('blackout', true);
      expect(drawArea().style.touchAction).toBe('none');

      escape();

      expect(m.root.querySelector('[data-tool-status] [role="status"]')).toBeNull();
      expect(drawArea().style.touchAction).toBe('auto');
      expect(m.state().tool.toolLocked).toBe(false);
    });
  });

  describe('undo and redo', () => {
    it('undo then redo restores a box at the same stacking position, announcing each', () => {
      m = mountRedactEditor();
      arm('blackout');
      draw('blackout');
      arm('blackout');
      draw('blackout', SECOND);
      const [first, second] = elements().map((el) => el.id);

      undoKey();
      expect(elements().map((el) => el.id)).toEqual([first]);
      expect(m.announcement()).toContain('Undid: Added blackout box');

      redoKey();
      expect(elements().map((el) => el.id)).toEqual([first, second]);
      expect(m.announcement()).toContain('Redid: Added blackout box');
    });

    it('running the undo chip keeps a redo when its command is still the newest', () => {
      m = mountRedactEditor({ elements: [box('a', { type: 'blackout' })] });
      m.dispatch({ type: 'BOX_SELECTED', id: 'a' });
      act(() => m.editor().editing.deleteElement('a'));
      expect(elements()).toHaveLength(0);

      arm('blackout');
      draw('blackout', SECOND);
      const drawn = only().id;
      undoKey();
      expect(elements()).toHaveLength(0);

      act(() => m.editor().editing.runUndoChip());
      expect(elements().map((el) => el.id)).toEqual(['a']);

      redoKey();
      expect(elements()).toHaveLength(0);

      redoKey();
      expect(elements().map((el) => el.id)).toEqual([drawn]);
    });

    it('moving a box is undoable: Undo restores its position, Redo moves it again', () => {
      m = mountRedactEditor();
      arm('blackout');
      draw('blackout');
      const id = only().id;

      act(() => m.editor().editing.updateElement(id, { left: 55, top: 65 }));
      expect(only()).toMatchObject({ left: 55, top: 65 });

      undoKey();
      expect(only()).toMatchObject({ left: BOX.left, top: BOX.top });
      expect(m.announcement()).toContain('Undid: Moved blackout box');

      redoKey();
      expect(only()).toMatchObject({ left: 55, top: 65 });
    });

    it('changing a whiteout box colour is undoable: Undo restores its old colour', () => {
      m = mountRedactEditor();
      arm('whiteout');
      draw('whiteout');
      const id = only().id;
      const original = only() as RedactElement & { color: string };

      act(() => m.editor().editing.pickColor(id, '#000000'));
      expect((only() as typeof original).color).toBe('#000000');

      undoKey();
      expect(only()).toMatchObject({ color: original.color, colorMode: 'auto' });
      expect(m.announcement()).toContain('Undid: Changed whiteout box color');
    });

    it('records resize_mark once after place_mark when a box is resized', () => {
      m = mountRedactEditor();
      arm('blackout');
      draw('blackout');

      act(() => m.editor().editing.updateElement(only().id, { width: 30, height: 40 }));

      expect(recentActions()).toEqual(['arm_tool', 'place_mark', 'resize_mark']);
    });
  });

  describe('brushes', () => {
    const armBrush = (tool: 'blur' | 'whiteout') => {
      act(() => m.editor().arming.changeBrush({ mode: 'brush', size: 12 }));
      arm(tool);
    };
    const stroke = () => makeStroke('whiteoutStroke', { id: `s${elements().length}`, pageIndex: 0, points: [[100, 200], [140, 220]], sizePt: 12, pageWidthPt: 612, pageHeightPt: 792, color: '#ffffff' });

    it('a stroke commits one element and the brush stays armed for the next', () => {
      m = mountRedactEditor({ render: true });
      armBrush('whiteout');
      expect(m.root.querySelector('[data-brush-layer]')).not.toBeNull();

      act(() => m.editor().editing.addStroke(stroke()));
      expect(elements()).toHaveLength(1);
      expect(m.state().tool.activeStyle).toBe('whiteout');
      expect(m.root.querySelector('[data-brush-layer]')).not.toBeNull();

      act(() => m.editor().editing.addStroke(stroke()));
      expect(elements()).toHaveLength(2);
    });

    it('Escape disarms the brush', () => {
      m = mountRedactEditor({ render: true });
      armBrush('blur');
      expect(m.root.querySelector('[data-brush-layer]')).not.toBeNull();

      escape();

      expect(m.root.querySelector('[data-brush-layer]')).toBeNull();
      expect(m.editor().arming.brushKind).toBeNull();
    });

    it('remembers the mode and size for the next document', () => {
      m = mountRedactEditor();

      act(() => m.editor().arming.changeBrush({ mode: 'brush', size: 30 }));

      expect(getAppStyle()).toMatchObject({ brushMode: 'brush', brushSize: 30 });
      expect(localStorage.getItem('pdf-toolkit:redact-brush:v1')).toBeNull();
    });
  });

  describe('whiteout colour', () => {
    it('a picked colour makes the box custom: a later move keeps it and never asks the sampler', () => {
      m = mountRedactEditor();
      arm('whiteout');
      draw('whiteout');
      const id = only().id;

      act(() => m.editor().editing.pickColor(id, '#123456'));
      expect(only()).toMatchObject({ color: '#123456', colorMode: 'custom' });

      vi.mocked(sampleRingColor).mockClear();
      act(() => m.editor().editing.updateElement(id, { left: 50, top: 60 }));

      expect(only()).toMatchObject({ color: '#123456', colorMode: 'custom', left: 50, top: 60 });
      expect(sampleRingColor).not.toHaveBeenCalled();
    });

    it('matchPage after a custom colour follows the page again, and one Undo brings the custom colour back', () => {
      m = mountRedactEditor();
      arm('whiteout');
      draw('whiteout');
      const id = only().id;
      act(() => m.editor().editing.pickColor(id, '#123456'));
      // Style edits within half a second fold into one step; move the clock past the 500 ms window.
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(Date.now() + 550);
        vi.mocked(sampleRingColor).mockClear();

        act(() => m.editor().editing.matchPage(id));
        expect(only()).toMatchObject({ colorMode: 'auto' });
        expect(sampleRingColor).toHaveBeenCalledTimes(1);

        undoKey();
        expect(only()).toMatchObject({ color: '#123456', colorMode: 'custom' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('a brush pick goes to the brush, leaves the box and is offered as a recent colour', () => {
      m = mountRedactEditor({ elements: [box('w', { colorMode: 'auto' } as Partial<RedactElement>)] });
      m.dispatch({ type: 'BOX_SELECTED', id: 'w' });
      act(() => m.editor().arming.changeBrush({ mode: 'brush', size: 12 }));
      arm('whiteout');
      const before = only();
      const entries = m.state().edits.history.past.length;

      act(() => m.editor().editing.pickBrushColor('#dbeafe'));

      expect(m.state().tool.activeColor).toBe('#dbeafe');
      expect(only()).toBe(before);
      expect(m.state().edits.history.past).toHaveLength(entries);
      expect(getRecentWhiteoutColors()).toEqual(['#dbeafe']);
      expect(m.editor().arming.recentColors).toEqual(['#dbeafe']);
    });

    it('a restored whiteout without a colour mode keeps its colour when moved, and is never sampled', () => {
      m = mountRedactEditor({ elements: [box('old-1')] });
      vi.mocked(sampleRingColor).mockClear();

      act(() => m.editor().editing.updateElement('old-1', { left: 50, top: 60 }));

      expect(only()).toMatchObject({ color: '#abcdef', left: 50, top: 60 });
      expect('colorMode' in only()).toBe(false);
      expect(sampleRingColor).not.toHaveBeenCalled();
    });

    it('RED-53: pickColor remembers the colour; matchPage and a move do not', () => {
      m = mountRedactEditor();
      arm('whiteout');
      draw('whiteout');
      const id = only().id;
      expect(getRecentWhiteoutColors()).toEqual([]);

      act(() => m.editor().editing.matchPage(id));
      act(() => m.editor().editing.updateElement(id, { left: 50, top: 60 }));
      expect(getRecentWhiteoutColors()).toEqual([]);

      act(() => m.editor().editing.pickColor(id, '#112233'));
      expect(getRecentWhiteoutColors()).toEqual(['#112233']);
    });

    it('RED-53: a mount reads the stored list into the recent colours', () => {
      rememberRecentWhiteoutColor('#abcdef', []);

      m = mountRedactEditor();

      expect(m.editor().arming.recentColors).toEqual(['#abcdef']);
    });

    it('RED-53: a pick merges another tab\'s stored colour and offers both', () => {
      m = mountRedactEditor();
      arm('whiteout');
      draw('whiteout');
      rememberRecentWhiteoutColor('#abcdef', []); // another tab writes after this one mounted

      act(() => m.editor().editing.pickColor(only().id, '#112233'));

      expect(m.editor().arming.recentColors).toEqual(['#112233', '#abcdef']);
      expect(getRecentWhiteoutColors()).toEqual(['#112233', '#abcdef']);
    });

    it('RED-53: a pick on one box is offered as a recent colour for another auto box', () => {
      m = mountRedactEditor();
      arm('whiteout');
      draw('whiteout');
      act(() => m.editor().editing.pickColor(only().id, '#112233'));
      arm('whiteout');
      draw('whiteout', SECOND);

      expect(elements()).toHaveLength(2);
      expect(elements()[1]).toMatchObject({ colorMode: 'auto' });
      expect(m.editor().arming.recentColors).toEqual(['#112233']);
    });

    it('RED-40: a restored document draws whiteout as auto and keeps its own colour as its tool colour', () => {
      rememberAppStyle({ whiteoutColor: '#00ff00' });
      m = mountRedactEditor({ styles: { whiteoutColor: '#ff0000' } });
      expect(m.state().tool.activeColor).toBe('#ff0000');

      arm('whiteout');
      draw('whiteout');

      expect(only()).toMatchObject({ color: '#ffffff', colorMode: 'auto' });
    });

    it('RED-40: a fresh document draws whiteout as auto and starts from the app-wide colour', () => {
      rememberAppStyle({ whiteoutColor: '#00ff00' });
      m = mountRedactEditor();
      expect(m.state().tool.activeColor).toBe('#00ff00');

      arm('whiteout');
      draw('whiteout');

      expect(only()).toMatchObject({ color: '#ffffff', colorMode: 'auto' });
    });
  });

  describe('blur strength', () => {
    it('RED-40: a restored document draws blur at its own strength, not the app-wide one', () => {
      rememberAppStyle({ blurStrength: 0.5 });
      m = mountRedactEditor({ styles: { blurStrength: 0.2 } });

      arm('blur');
      draw('blur');

      expect(only()).toMatchObject({ type: 'blur', strength: 0.2 });
    });

    it('RED-40: a fresh document draws blur at the app-wide strength', () => {
      rememberAppStyle({ blurStrength: 0.5 });
      m = mountRedactEditor();

      arm('blur');
      draw('blur');

      expect(only()).toMatchObject({ type: 'blur', strength: 0.5 });
    });

    it('SITE-41: changeBlurStrength applies and remembers it, Undo restores the previous one and Redo reapplies it', () => {
      m = mountRedactEditor();
      arm('blur');
      draw('blur');
      const id = only().id;

      act(() => m.editor().editing.changeBlurStrength(id, 0.22));
      expect(only()).toMatchObject({ strength: 0.22 });
      expect(m.state().tool.activeBlurStrength).toBe(0.22);
      expect(getAppStyle()).toMatchObject({ blurStrength: 0.22 });

      undoKey();
      expect(only()).toMatchObject({ strength: DEFAULT_BLUR_STRENGTH });

      redoKey();
      expect(only()).toMatchObject({ strength: 0.22 });
    });

    it('SITE-41: a newly drawn blur box picks up the last-chosen strength', () => {
      m = mountRedactEditor();
      arm('blur');
      draw('blur');
      act(() => m.editor().editing.changeBlurStrength(only().id, 0.22));

      arm('blur');
      draw('blur', SECOND);

      expect(elements()[1]).toMatchObject({ type: 'blur', strength: 0.22 });
    });
  });

  describe('selection', () => {
    it('a click anywhere outside the selected box drops the selection, a click on the box keeps it', () => {
      m = mountRedactEditor({ render: true });
      arm('blackout');
      draw('blackout');
      const id = only().id;
      const boxEl = () => m.root.querySelector<HTMLElement>('[data-redact-box-id]')!;
      const toolbarShown = () => document.querySelector('[data-redact-box-bar], [data-editor-actions]') !== null;
      const select = () => m.dispatch({ type: 'BOX_SELECTED', id });

      select();
      click(boxEl());
      expect(boxEl().hasAttribute('data-selected')).toBe(true);
      expect(toolbarShown()).toBe(true);

      click(document.body);
      expect(boxEl().hasAttribute('data-selected')).toBe(false);
      expect(toolbarShown()).toBe(false);

      select();
      click(m.root.querySelector('[data-editor-page-header]')!);
      expect(boxEl().hasAttribute('data-selected')).toBe(false);
      expect(toolbarShown()).toBe(false);
    });
  });
  describe('resetForNewFile', () => {
    it('clears the delete lifts and the find bar: closed, no term, no preset', async () => {
      const bytes = new Uint8Array(readFileSync(join(import.meta.dirname, '../../../lib/__fixtures__/num-1.pdf'))).buffer;
      const [object] = await listDeletableObjects(bytes);
      m = mountRedactEditor({ numPages: 1, fileBytes: bytes, render: true });
      // The page column draws no canvas without a pdf.js document: this is a real one, in the place pdf.js would paint.
      const canvas = document.createElement('canvas');
      canvas.width = 20;
      canvas.height = 20;
      m.root.querySelector('[data-page-wrapper]')!.appendChild(canvas);
      // The test screen prefers reduced motion, which skips the lift entirely.
      setScreen({ reducedMotion: false });
      act(() => m.editor().editing.deleteTool.markObject(object));
      act(() => {
        m.editor().findKit.find.setOpen(true);
        m.editor().findKit.find.setTerm('secret');
        m.editor().findKit.find.setPreset('email');
      });
      expect(m.editor().editing.deleteTool.lifts).toHaveLength(1);
      expect(m.state().edits.undoAction).not.toBeNull();
      expect(m.editor().findKit.find).toMatchObject({ open: true, term: 'secret', preset: 'email' });

      act(() => m.editor().resetForNewFile());

      expect(m.editor().editing.deleteTool.lifts).toEqual([]);
      expect(m.editor().findKit.find.open).toBe(false);
      expect(m.editor().findKit.find.term).toBe('');
      expect(m.editor().findKit.find.preset).toBeNull();
    });
  });
});
