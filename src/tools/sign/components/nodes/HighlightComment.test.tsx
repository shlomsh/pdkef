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
const note = () => host.querySelector('textarea') as HTMLTextAreaElement;
function type(text: string) {
  act(() => { note().value = text; note().dispatchEvent(new Event('input', { bubbles: true })); });
}
const blur = () => act(() => { note().dispatchEvent(new FocusEvent('focusout', { bubbles: true })); note().dispatchEvent(new FocusEvent('blur')); });

describe('highlight comment note', () => {
  it('shows only when active and a comment exists; commits once on blur', () => {
    const onChange = vi.fn();
    mount(node(make({ comment: '' }), { onChange }));
    expect(note().dir).toBe('auto');
    type('hello');
    expect(onChange).not.toHaveBeenCalled();
    blur();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ comment: 'hello' });
  });
  it('is hidden when inactive or without a comment', () => {
    mount(node(make({ comment: 'x' }), { isActive: false }));
    expect(host.querySelector('textarea')).toBeNull();
    act(() => render(node(make({})), host));
    expect(host.querySelector('textarea')).toBeNull();
  });
  it('a blank commit removes the comment', () => {
    const onChange = vi.fn();
    mount(node(make({ comment: 'old' }), { onChange }));
    type('   ');
    blur();
    expect(onChange).toHaveBeenCalledWith({ comment: undefined });
  });
  it('an unchanged blur dispatches nothing', () => {
    const onChange = vi.fn();
    mount(node(make({ comment: 'same' }), { onChange }));
    blur();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('Delete in the note does not reach a document listener', () => {
    const seen = vi.fn();
    document.addEventListener('keydown', seen);
    mount(node(make({ comment: 'x' })));
    act(() => { note().dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); });
    document.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
  });
  it('note and badge sit outside the multiply root', () => {
    mount(
      <CommentNumbersScope elements={[make({ comment: 'x' })]}>{node(make({ comment: 'x' }))}</CommentNumbersScope>,
    );
    const root = host.querySelector('[data-highlight-root]')!;
    expect(root).not.toBeNull();
    expect(root.contains(note())).toBe(false);
    expect(root.contains(host.querySelector('[data-highlight-badge]'))).toBe(false);
  });
  it('aligns to the right edge for rtl', () => {
    mount(node(make({ comment: 'x', direction: 'rtl' })));
    expect(note().closest<HTMLElement>('[data-highlight-note]')!.dataset.side).toBe('end');
  });
});

describe('highlight note lifecycle', () => {
  it('follows an outside change to the comment when not focused', () => {
    const onChange = vi.fn();
    mount(node(make({ comment: 'new' }), { onChange }));
    act(() => render(node(make({ comment: 'older' }), { onChange }), host));
    expect(note().value).toBe('older');
    blur();
    expect(onChange).not.toHaveBeenCalled();
  });
  it('autofocuses only a note just opened empty', () => {
    mount(node(make({ comment: 'restored' })));
    expect(document.activeElement).not.toBe(note());
    act(() => render(null, host));
    mount(node(make({ comment: '' })));
    expect(document.activeElement).toBe(note());
  });
  it('an untouched blur closes an empty note', () => {
    const onChange = vi.fn();
    mount(node(make({ comment: '' }), { onChange }));
    blur();
    expect(onChange).toHaveBeenCalledWith({ comment: undefined });
  });
});

describe('copies drop the comment', () => {
  it('Duplicate drops it and keeps the rest', () => {
    const onClone = vi.fn();
    mount(<ElementToolbar element={make({ comment: 'x', direction: 'rtl' })} onChange={() => {}} onClone={onClone} onDelete={() => {}} />);
    act(() => (host.querySelector('button[title="Duplicate"]') as HTMLButtonElement).click());
    const copy = onClone.mock.calls[0][0];
    expect('comment' in copy && copy.comment !== undefined).toBe(false);
    expect(copy.direction).toBe('rtl');
    expect(copy.bands).toHaveLength(1);
  });
});

describe('badge position', () => {
  it('sits at the first band start edge, right edge for rtl', () => {
    const bands = [{ left: 30, top: 10, width: 40, height: 20 }, { left: 0, top: 40, width: 100, height: 20 }];
    mount(<CommentNumbersScope elements={[make({ comment: 'a', bands })]}>{node(make({ comment: 'a', bands }), { isActive: false })}</CommentNumbersScope>);
    const b = host.querySelector<HTMLElement>('[data-highlight-badge]')!;
    expect(b.style.left).toBe('30%');
    expect(b.style.top).toBe('20%');
    act(() => render(<CommentNumbersScope elements={[make({ comment: 'a', bands, direction: 'rtl' })]}>{node(make({ comment: 'a', bands, direction: 'rtl' }), { isActive: false })}</CommentNumbersScope>, host));
    expect(host.querySelector<HTMLElement>('[data-highlight-badge]')!.style.left).toBe('70%');
  });
});

describe('highlight badge', () => {
  it('shows each highlight its number, none for a blank comment, click selects', () => {
    const onSelect = vi.fn();
    const elements = [make({ id: 'h1', top: 40, comment: 'a' }), make({ id: 'h2', top: 10, comment: 'b' }), make({ id: 'h3', top: 5, comment: '  ' })];
    mount(
      <CommentNumbersScope elements={elements}>
        {node(elements[0], { isActive: false, onSelect })}
        {node(elements[1], { isActive: false })}
        {node(elements[2], { isActive: false })}
      </CommentNumbersScope>,
    );
    const badges = Array.from(host.querySelectorAll<HTMLElement>('[data-highlight-badge]'));
    expect(badges.map((b) => b.textContent)).toEqual(['2', '1']);
    expect(badges[0].getAttribute('aria-label')).toBe('Comment 2');
    act(() => badges[0].click());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('toolbar comment button', () => {
  const button = () => host.querySelector('button[title="Comment"]') as HTMLButtonElement;
  function toolbar(element: HighlightElement, onChange = vi.fn()) {
    mount(<ElementToolbar element={element} onChange={onChange} onClone={() => {}} onDelete={() => {}} />);
    return onChange;
  }
  it('opens an empty note when there is no comment', () => {
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
