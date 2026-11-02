import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { sketchBands, sketchUnderline, strokeSeed } from '#editor/geometry/sketchStroke.ts';
import HighlightNode from './HighlightNode.tsx';
import type { HighlightElement } from '#editor/model/editorModel.ts';

vi.mock('#editor/geometry/sketchStroke.ts', () => ({
  strokeSeed: vi.fn(() => 42), sketchBands: vi.fn(() => [['Z']]), sketchUnderline: vi.fn(() => [['Z']]), svgPath: vi.fn(() => 'M0 0Z'),
}));

const element: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 50, height: 10, color: '#FFF34D',
  bands: [{ left: 0, top: 10, width: 100, height: 40 }, { left: 5, top: 60, width: 90, height: 30 }],
};

describe('HighlightNode', () => {
  let host: HTMLDivElement;
  afterEach(() => { act(() => render(null, host)); host.remove(); });

  it('READ-14: a pencil mark shows the hatch its tool hands in instead of bands, and plain bands where none is handed in (Sign)', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const pencil = { ...element, style: 'pencil' as const };
    act(() => render(<HighlightNode element={pencil} isActive={false} onResizeStart={() => {}} hatch={<svg data-test-hatch />} />, host));
    expect(host.querySelector('[data-test-hatch]')).not.toBeNull();
    expect(host.querySelectorAll('[data-highlight-band]')).toHaveLength(0);
    act(() => render(<HighlightNode element={pencil} isActive={false} onResizeStart={() => {}} />, host));
    expect(host.querySelectorAll('[data-highlight-band]')).toHaveLength(2);
    act(() => render(<HighlightNode element={element} isActive={false} onResizeStart={() => {}} hatch={<svg data-test-hatch />} />, host));
    expect(host.querySelector('[data-test-hatch]')).toBeNull();
    expect(host.querySelectorAll('[data-highlight-band]')).toHaveLength(2);
  });

  it('renders one band per element band at its percents, and an empty draft container', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<HighlightNode element={element} isActive={false} onResizeStart={() => {}} />, host));
    const bands = Array.from(host.querySelectorAll<HTMLElement>('[data-highlight-band]'));
    expect(bands).toHaveLength(2);
    expect(bands[1].style.left).toBe('5%');
    expect(bands[1].style.top).toBe('60%');
    expect(bands[1].style.width).toBe('90%');
    expect(bands[1].style.height).toBe('30%');
    expect(bands[0].style.backgroundColor).not.toBe('');
    const draft = host.querySelector('[data-highlight-draft]')!;
    expect(draft.children).toHaveLength(0);
    expect(host.querySelector('.resizer, [data-editor-resizer]')).toBeNull();
  });

  it('marks its bands focused while active', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<HighlightNode element={element} isActive onResizeStart={() => {}} />, host));
    expect(host.querySelector('[data-highlight-bands]')!.hasAttribute('data-focused')).toBe(true);
    act(() => render(<HighlightNode element={element} isActive={false} onResizeStart={() => {}} />, host));
    expect(host.querySelector('[data-highlight-bands]')!.hasAttribute('data-focused')).toBe(false);
  });
});

describe('HighlightNode without comments', () => {
  it('draws no dot: comments are their own elements', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<HighlightNode element={{ ...element, comment: 'old' } as typeof element} isActive onResizeStart={() => {}} />, host));
    expect(host.querySelector('[data-comment-marker]')).toBeNull();
    act(() => render(null, host));
    host.remove();
  });
});

describe('HighlightNode styles', () => {
  const mount = (el: HighlightElement) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<HighlightNode element={el} isActive={false} onResizeStart={() => {}} />, host));
    return host;
  };

  it('draws a highlight at its opacity', () => {
    const host = mount({ ...element, opacity: 0.5 });
    expect(host.querySelector<HTMLElement>('[data-highlight-bands]')!.style.opacity).toBe('0.5');
    expect(host.querySelector('[data-highlight-underline]')).toBeNull();
    act(() => render(null, host));
    host.remove();
  });

  it('draws full opacity when none is set', () => {
    const host = mount(element);
    expect(host.querySelector<HTMLElement>('[data-highlight-bands]')!.style.opacity).toBe('');
    act(() => render(null, host));
    host.remove();
  });

  it('READ-04: an underline sets its width custom property, 3px by default', () => {
    const wide = mount({ ...element, style: 'underline', strokeWidth: 2 });
    wide.querySelectorAll<HTMLElement>('[data-highlight-band]').forEach((band) => expect(band.style.getPropertyValue('--highlight-ink-width')).toBe('2px'));
    const plain = mount({ ...element, style: 'underline' });
    plain.querySelectorAll<HTMLElement>('[data-highlight-band]').forEach((band) => expect(band.style.getPropertyValue('--highlight-ink-width')).toBe('3px'));
  });

  it('draws an underline as a transparent band with a darkened ink custom property', () => {
    const host = mount({ ...element, style: 'underline', opacity: 0.6 });
    const bands = Array.from(host.querySelectorAll<HTMLElement>('[data-highlight-band]'));
    expect(bands).toHaveLength(2);
    bands.forEach((band) => {
      expect(band.hasAttribute('data-highlight-underline')).toBe(true);
      expect(band.style.getPropertyValue('--highlight-ink')).toBe('#B8AF37');
      expect(band.style.background).toBe('');
      expect(band.style.backgroundColor).toBe('');
    });
    expect(host.querySelector<HTMLElement>('[data-highlight-bands]')!.style.opacity).toBe('0.6');
    expect(host.querySelector('[data-highlight-draft]')!.children).toHaveLength(0);
    act(() => render(null, host));
    host.remove();
  });

  it('paints the live swipe at the opacity of its bands', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    act(() => render(<HighlightNode element={{ ...element, opacity: 0.5 }} isActive={false} onResizeStart={() => {}} />, host));
    expect(host.querySelector<HTMLElement>('[data-highlight-draft]')!.style.opacity).toBe('0.5');
    act(() => render(null, host));
    host.remove();
  });

});

describe('HighlightNode sketch stroke', () => {
  let host: HTMLDivElement;
  afterEach(() => { act(() => render(null, host)); host.remove(); });
    const mount = (el: HighlightElement, props: Record<string, unknown> = {}) => {
      host = document.createElement('div');
      document.body.appendChild(host);
      act(() => render(<HighlightNode element={el} isActive={false} onResizeStart={() => {}} {...props} />, host));
    };
    const box = { width: 200, height: 20 };

    it('draws a sketched highlight as one svg path in the layer, no bands', () => {
      vi.mocked(sketchBands).mockClear();
      mount({ ...element, stroke: 'sketch', opacity: 0.5 }, { boxPts: box, turns: 2 });
      expect(host.querySelectorAll('[data-highlight-band]')).toHaveLength(0);
      const path = host.querySelector('[data-highlight-bands] svg[data-highlight-sketch] path')!;
      expect(path.getAttribute('fill')).toBe('#FFF34D');
      expect(path.getAttribute('d')).toBe('M0 0Z');
      expect(host.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 200 20');
      expect((host.querySelector('[data-highlight-bands]') as HTMLElement).style.opacity).toBe('0.5');
      expect(strokeSeed).toHaveBeenCalledWith('h1');
      expect(sketchBands).toHaveBeenCalledWith([{ x: 0, y: 2, w: 200, h: 8 }, { x: 10, y: 12, w: 180, h: 6 }], 42, 2);
      expect(host.querySelector('[data-highlight-draft]')!.children).toHaveLength(0);
    });

    it('draws a sketched underline in its ink and width', () => {
      vi.mocked(sketchUnderline).mockClear();
      mount({ ...element, style: 'underline', stroke: 'sketch', strokeWidth: 2 }, { boxPts: box });
      expect(host.querySelector('[data-highlight-sketch] path')!.getAttribute('fill')).toBe('#B8AF37');
      expect(sketchUnderline).toHaveBeenCalledWith(expect.any(Array), 42, 2, 0);
    });

    it('stays clean without boxPts or without the sketch stroke', () => {
      mount({ ...element, stroke: 'sketch' });
      expect(host.querySelector('[data-highlight-sketch]')).toBeNull();
      expect(host.querySelectorAll('[data-highlight-band]')).toHaveLength(2);
      act(() => render(null, host)); host.remove();
      mount(element, { boxPts: box });
      expect(host.querySelector('[data-highlight-sketch]')).toBeNull();
      expect(host.querySelectorAll('[data-highlight-band]')).toHaveLength(2);
    });
});
