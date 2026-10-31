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
