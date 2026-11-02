// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { paintMarkDraft } from './paintMarkDraft.ts';
import { hatchIfLoaded, loadHatch } from '../outline/hatchLoader.ts';
import { sketchMark, bandRectsPts } from '#editor-ui/highlight/HighlightNode.tsx';
import type { HighlightElement } from '#editor/model/editorModel.ts';

const bands = [{ left: 0, top: 10, width: 100, height: 40 }, { left: 5, top: 60, width: 90, height: 30 }];
const box = { width: 200, height: 20 };
const element: HighlightElement = { id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 50, height: 10, color: '#FFF34D', bands };

function nodeWithDraft() {
  const node = document.createElement('div');
  const draft = document.createElement('div');
  draft.setAttribute('data-highlight-draft', '');
  node.appendChild(draft);
  return { node, draft };
}

describe('paintMarkDraft', () => {
  it('draws a sketched mark as the one path the committed node draws', () => {
    const { node, draft } = nodeWithDraft();
    const el = { ...element, stroke: 'sketch' as const };
    paintMarkDraft(node, el, bands, box, 1);
    const svg = draft.querySelector('svg[data-highlight-sketch]')!;
    expect(draft.children).toHaveLength(1);
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 20');
    const expected = sketchMark(el, bandRectsPts(bands, box), 1);
    const path = svg.querySelector('path')!;
    expect(path.getAttribute('d')).toBe(expected.d);
    expect(path.getAttribute('fill')).toBe(expected.fill);
  });

  it('draws an underline as underline bands with the ink vars', () => {
    const { node, draft } = nodeWithDraft();
    paintMarkDraft(node, { ...element, style: 'underline', strokeWidth: 2 }, bands, box, 0);
    const divs = draft.querySelectorAll<HTMLElement>('[data-highlight-underline]');
    expect(divs).toHaveLength(2);
    expect(divs[0].style.getPropertyValue('--highlight-ink-width')).toBe('2px');
    expect(divs[0].style.background).toBe('');
  });

  it('draws a clean highlight as filled bands, also without a box', () => {
    const { node, draft } = nodeWithDraft();
    paintMarkDraft(node, { ...element, stroke: 'sketch' }, bands, undefined, 0);
    const divs = draft.querySelectorAll<HTMLElement>('div');
    expect(divs).toHaveLength(2);
    expect(divs[1].style.top).toBe('60%');
    expect(divs[0].style.background).not.toBe('');
  });

  it('clears the layer for no bands', () => {
    const { node, draft } = nodeWithDraft();
    paintMarkDraft(node, element, bands, box, 0);
    paintMarkDraft(node, element, [], box, 0);
    expect(draft.children).toHaveLength(0);
  });

  describe('READ-14: pencil', () => {
    const pencil = { ...element, style: 'pencil' as const };

    it('draws the hatch the committed node draws once rough.js is in, and repaints itself when it arrives', async () => {
      const { node, draft } = nodeWithDraft();
      expect(hatchIfLoaded()).toBeNull();
      paintMarkDraft(node, pencil, bands, box, 0);
      expect(draft.children).toHaveLength(0);
      await vi.waitFor(() => expect(draft.querySelector('svg[data-highlight-hatch]')).not.toBeNull());
      const path = draft.querySelector('svg[data-highlight-hatch] path')!;
      expect(path.getAttribute('stroke')).toBe('#FFF34D');
      const hatch = (await loadHatch()).hatchOps;
      const { hatchPathD } = await import('#editor/geometry/hatchInk.ts');
      expect(path.getAttribute('d')).toBe(hatchPathD(hatch, bandRectsPts(bands, box), 'h1'));
    });

    it('does not bring a mark back that was cleared while rough.js was loading', async () => {
      const { node, draft } = nodeWithDraft();
      const { _resetForTest } = await import('../outline/hatchLoader.ts');
      _resetForTest();
      paintMarkDraft(node, pencil, bands, box, 0);
      paintMarkDraft(node, pencil, [], box, 0);
      await loadHatch();
      await new Promise((r) => setTimeout(r, 0));
      expect(draft.children).toHaveLength(0);
    });
  });
});
