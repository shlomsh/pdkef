import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { useMarkFocus } from './useMarkFocus.ts';

const hl = (id: string, pageIndex: number, left: number, top: number): HighlightElement => ({
  id, type: 'highlight', pageIndex, left, top, width: 10, height: 2, color: '#ff0', bands: [],
} as unknown as HighlightElement);

const opened: string[] = [];

function Page({ pageIndex, elements }: { pageIndex: number; elements: EditorElement[] }) {
  const focus = useMarkFocus({ elements, openFor: (id) => opened.push(id) });
  return (
    <div>
      {elements.filter((e) => e.pageIndex === pageIndex).map((e) => (
        <div key={e.id} data-editor-element-id={e.id} {...focus.markProps(e.id)} />
      ))}
    </div>
  );
}

let container: HTMLElement | null = null;
function mount(elements: EditorElement[]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => render(<><Page pageIndex={0} elements={elements} /><Page pageIndex={1} elements={elements} /></>, container!));
}
const node = (id: string) => container!.querySelector<HTMLElement>(`[data-editor-element-id="${id}"]`)!;
const key = (target: HTMLElement, k: string) => act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });

afterEach(() => {
  if (container) { act(() => render(null, container!)); container.remove(); container = null; }
  opened.length = 0;
});

const doc = () => [hl('b', 0, 50, 40), hl('a', 0, 5, 10), hl('c', 1, 5, 10)];

describe('useMarkFocus', () => {
  it('only the first mark in reading order is a tab stop at first', () => {
    mount(doc());
    expect(['a', 'b', 'c'].map((id) => node(id).tabIndex)).toEqual([0, -1, -1]);
  });

  it('the stop moves to the last focused mark', () => {
    mount(doc());
    act(() => node('b').focus());
    expect(['a', 'b', 'c'].map((id) => node(id).tabIndex)).toEqual([-1, 0, -1]);
  });

  it('arrows move focus across pages in reading order, Home and End jump', () => {
    mount(doc());
    act(() => node('a').focus());
    key(node('a'), 'ArrowDown');
    expect(document.activeElement).toBe(node('b'));
    key(node('b'), 'ArrowRight');
    expect(document.activeElement).toBe(node('c'));
    key(node('c'), 'ArrowLeft');
    expect(document.activeElement).toBe(node('b'));
    key(node('b'), 'ArrowUp');
    expect(document.activeElement).toBe(node('a'));
    key(node('a'), 'End');
    expect(document.activeElement).toBe(node('c'));
    key(node('c'), 'Home');
    expect(document.activeElement).toBe(node('a'));
  });

  it('scrolls the mark it moves to into view', () => {
    mount(doc());
    const scroll = vi.fn();
    node('b').scrollIntoView = scroll;
    act(() => node('a').focus());
    key(node('a'), 'ArrowDown');
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('focusing a mark opens its toolbar on its page', () => {
    mount(doc());
    act(() => node('c').focus());
    expect(opened).toEqual(['c']);
  });

  it('a pointer press that focuses a mark does not open the toolbar', () => {
    mount(doc());
    act(() => { node('b').dispatchEvent(new Event('pointerdown', { bubbles: true })); node('b').focus(); });
    expect(opened).toEqual([]);
  });

  it('focus coming back from the toolbar does not reopen it', () => {
    mount(doc());
    const bar = document.createElement('div');
    bar.setAttribute('data-rest-toolbar', '');
    const button = document.createElement('button');
    bar.appendChild(button);
    container!.appendChild(bar);
    act(() => button.focus());
    act(() => node('a').focus());
    expect(opened).toEqual([]);
  });

  it.each(['data-comment-card', 'data-comment-sheet'])('focus handed back from %s does not reopen the comment', (attr) => {
    mount(doc());
    const card = document.createElement('div');
    card.setAttribute(attr, '');
    const field = document.createElement('textarea');
    card.appendChild(field);
    container!.appendChild(card);
    act(() => field.focus());
    act(() => node('a').focus());
    expect(opened).toEqual([]);
  });

  it('keyboard focus with no previous element still opens', () => {
    mount(doc());
    act(() => node('a').focus());
    expect(opened).toEqual(['a']);
  });

  it('a document with no marks has no stop and no key handling', () => {
    mount([]);
    expect(container!.querySelectorAll('[tabindex]').length).toBe(0);
  });
});
