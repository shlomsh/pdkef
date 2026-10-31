import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { CommentRail } from './CommentRail.tsx';

const hl = (id: string, top: number, comment?: string, pageIndex = 0): EditorElement => ({
  id, type: 'highlight', pageIndex, left: 10, top, width: 50, height: 2, color: '#ff0', comment,
  bands: [{ left: 0, top: 0, width: 100, height: 100 }],
} as unknown as EditorElement);

let host: HTMLDivElement | null = null;
afterEach(() => { if (host) render(null, host); host?.remove(); host = null; vi.restoreAllMocks(); });

function mount(elements: EditorElement[], activeElementId: string | null = null, extra: { onSelect?: (id: string) => void } = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<CommentRail pageIndex={0} elements={elements} activeElementId={activeElementId} messages={englishSignMessages}
    onSelect={extra.onSelect ?? (() => {})} onChange={() => {}} />, host!));
}
const cards = () => [...host!.querySelectorAll<HTMLElement>('[data-comment-card]')];

describe('CommentRail', () => {
  it('renders one card per commented highlight in reading order', () => {
    mount([hl('b', 50, 'second'), hl('a', 10, 'first'), hl('x', 30), hl('o', 5, 'other page', 1)]);
    expect(cards().map((c) => c.dataset.commentCard)).toEqual(['a', 'b']);
    expect(host!.querySelector('[data-comment-rail]')).not.toBeNull();
  });

  it('adds the active highlight that was just opened for a comment, and marks the active card', () => {
    mount([hl('a', 10, 'first'), hl('n', 40, '')], 'n');
    expect(cards().map((c) => c.dataset.commentCard)).toEqual(['a', 'n']);
    expect(cards()[1].dataset.active).toBe('true');
    expect(cards()[0].dataset.active).toBeUndefined();
    expect(host!.querySelector('[data-highlight-note-input]')).not.toBeNull();
  });

  it('stacks cards below each other when their passages are close, and grows the rail', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 1000 } as DOMRect);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(80);
    mount([hl('a', 10, 'one'), hl('b', 11, 'two')]);
    const [a, b] = cards();
    expect(a.style.top).toBe('94px');
    expect(b.style.top).toBe('182px');
    expect((host!.querySelector('[data-comment-rail]') as HTMLElement).style.minHeight).toBe('262px');
  });

  it('keeps clicks from reaching the workspace', () => {
    const outer = vi.fn();
    mount([hl('a', 10, 'one')]);
    host!.addEventListener('click', outer);
    act(() => cards()[0].click());
    expect(outer).not.toHaveBeenCalled();
  });
});
