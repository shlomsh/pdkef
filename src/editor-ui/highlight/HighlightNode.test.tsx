import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, afterEach } from 'vitest';
import HighlightNode from './HighlightNode.tsx';
import type { HighlightElement } from '#editor/model/editorModel.ts';

const element: HighlightElement = {
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 50, height: 10, color: '#FFF34D',
  bands: [{ left: 0, top: 10, width: 100, height: 40 }, { left: 5, top: 60, width: 90, height: 30 }],
};

describe('HighlightNode', () => {
  let host: HTMLDivElement;
  afterEach(() => { act(() => render(null, host)); host.remove(); });

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

  it('draws an underline as a transparent band with a darkened ink custom property', () => {
    const host = mount({ ...element, style: 'underline', opacity: 0.6 });
    const bands = Array.from(host.querySelectorAll<HTMLElement>('[data-highlight-band]'));
    expect(bands).toHaveLength(2);
    bands.forEach((band) => {
      expect(band.hasAttribute('data-highlight-underline')).toBe(true);
      expect(band.style.getPropertyValue('--highlight-ink')).toBe('#A69E32');
      expect(band.style.background).toBe('');
      expect(band.style.backgroundColor).toBe('');
    });
    expect(host.querySelector<HTMLElement>('[data-highlight-bands]')!.style.opacity).toBe('0.6');
    expect(host.querySelector('[data-highlight-draft]')!.children).toHaveLength(0);
    act(() => render(null, host));
    host.remove();
  });
});
