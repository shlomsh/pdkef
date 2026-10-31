import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, it, expect, afterEach, vi } from 'vitest';
import HighlightNode from './HighlightNode.tsx';
import { CommentNumbersScope } from './commentNumbersContext.tsx';
import ElementToolbar from '../ElementToolbar.tsx';
import type { HighlightElement } from '#editor/model/editorModel.ts';

const make = (over: Partial<HighlightElement>): HighlightElement => ({
  id: 'h1', type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 50, height: 10, color: '#FFF34D',
  bands: [{ left: 0, top: 10, width: 100, height: 40 }], ...over,
});

let host: HTMLDivElement;
function mount(node: preact.ComponentChild) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(node, host));
}
afterEach(() => { act(() => render(null, host)); host.remove(); });

function node(element: HighlightElement, extra: Record<string, unknown> = {}) {
  return <HighlightNode element={element} isActive onResizeStart={() => {}} onChange={() => {}} onSelect={() => {}} {...extra} />;
}
describe('highlight dot', () => {
  const dot = () => host.querySelector<HTMLElement>('[data-highlight-dot]')!;
  it('renders a numbered-label dot at the passage end, outside the multiply root, no inline note', () => {
    const onSelect = vi.fn();
    const el = make({ comment: 'a' });
    mount(<CommentNumbersScope elements={[el]}>{node(el, { onSelect })}</CommentNumbersScope>);
    expect(host.querySelector('textarea')).toBeNull();
    expect(dot().hasAttribute('data-highlight-badge')).toBe(true);
    expect(dot().textContent).toBe('');
    expect(dot().getAttribute('aria-label')).toBe('Comment 1');
    expect(host.querySelector('[data-highlight-root]')!.contains(dot())).toBe(false);
    // end of the last band: page x = 10 + 50 = 60 -> local 100%; y = 10 + 0.5*(10*0.5)... centred in the band
    expect(dot().style.left).toBe('100%');
    expect(dot().style.top).toBe('30%');
    act(() => dot().click());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
  it('sits left of the end for rtl', () => {
    const el = make({ comment: 'a', direction: 'rtl' });
    mount(<CommentNumbersScope elements={[el]}>{node(el)}</CommentNumbersScope>);
    expect(dot().dataset.side).toBe('end');
    expect(dot().style.left).toBe('0%');
  });
  it('shows none for a blank comment', () => {
    const el = make({ comment: '  ' });
    mount(<CommentNumbersScope elements={[el]}>{node(el)}</CommentNumbersScope>);
    expect(host.querySelector('[data-highlight-dot]')).toBeNull();
  });
});

describe('toolbar comment button', () => {
  const button = () => host.querySelector('button[title="Comment"]') as HTMLButtonElement;
  function toolbar(element: HighlightElement, onChange = vi.fn()) {
    mount(<ElementToolbar element={element} onChange={onChange} onClone={() => {}} onDelete={() => {}} />);
    return onChange;
  }
  it('opens an empty comment when there is no comment', () => {
    const onChange = toolbar(make({}));
    expect(button().getAttribute('aria-pressed')).toBe('false');
    act(() => button().click());
    expect(onChange).toHaveBeenCalledWith({ comment: '' });
  });
  it('removes a blank note', () => {
    const onChange = toolbar(make({ comment: '' }));
    expect(button().getAttribute('aria-pressed')).toBe('true');
    act(() => button().click());
    expect(onChange).toHaveBeenCalledWith({ comment: undefined });
  });
  it('focuses the note and keeps the text when there is one', () => {
    const onChange = vi.fn();
    mount(<>
      <textarea data-highlight-note-input />
      <ElementToolbar element={make({ comment: 'keep' })} onChange={onChange} onClone={() => {}} onDelete={() => {}} />
    </>);
    act(() => button().click());
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(host.querySelector('textarea'));
  });
});
