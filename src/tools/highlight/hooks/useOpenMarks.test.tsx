import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { readOpenMarks, useOpenMarks, type OpenMarks } from './useOpenMarks.ts';

let root: HTMLElement;
let seen: OpenMarks;

function Probe({ pickedId }: { pickedId: string | null }) {
  seen = useOpenMarks({ current: root }, pickedId);
  return null;
}

function mount(html: string) {
  root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

afterEach(() => { root.remove(); });

const marks = '<div data-editor-element-id="a" tabindex="0"></div><div data-editor-element-id="b" tabindex="0"></div>';

describe('readOpenMarks', () => {
  it('is empty when nothing is open', () => {
    expect(readOpenMarks(mount(marks), null)).toEqual({ openId: null, hoverId: null });
  });

  it('an open note wins over a picked mark and over the card under the pointer', () => {
    mount(marks);
    root.querySelector('[data-editor-element-id="a"]')!.setAttribute('data-comment-focus', '');
    root.querySelector('[data-editor-element-id="b"]')!.setAttribute('data-comment-hover', '');
    expect(readOpenMarks(root, 'b')).toEqual({ openId: 'a', hoverId: null });
    expect(readOpenMarks(root, null)).toEqual({ openId: 'a', hoverId: null });
  });

  it('with no note open, the hovered card points at its mark', () => {
    mount(marks);
    root.querySelector('[data-editor-element-id="b"]')!.setAttribute('data-comment-hover', '');
    expect(readOpenMarks(root, null)).toEqual({ openId: null, hoverId: 'b' });
  });

  it('the mark a card is hovering is not also faint once it is the open one', () => {
    mount(marks);
    const a = root.querySelector('[data-editor-element-id="a"]')!;
    a.setAttribute('data-comment-focus', '');
    a.setAttribute('data-comment-hover', '');
    expect(readOpenMarks(root, null)).toEqual({ openId: 'a', hoverId: null });
  });

  it('a picked mark is open on its own', () => {
    expect(readOpenMarks(mount(marks), 'b').openId).toBe('b');
  });
});

describe('useOpenMarks', () => {
  it('follows the attributes the comments view sets, and clears when they go', async () => {
    mount(marks);
    act(() => render(<Probe pickedId={null} />, document.createElement('div')));
    expect(seen.openId).toBeNull();
    const a = root.querySelector('[data-editor-element-id="a"]')!;
    await act(async () => { a.setAttribute('data-comment-focus', ''); await Promise.resolve(); });
    expect(seen.openId).toBe('a');
    await act(async () => { a.removeAttribute('data-comment-focus'); await Promise.resolve(); });
    expect(seen.openId).toBeNull();
  });

  it('follows the picked mark', () => {
    mount(marks);
    const host = document.createElement('div');
    act(() => render(<Probe pickedId="b" />, host));
    expect(seen.openId).toBe('b');
  });
});

describe('keyboard focus', () => {
  it('the mark the keyboard is on is open when none is picked', () => {
    mount(marks);
    (root.querySelector('[data-editor-element-id="a"]') as HTMLElement).focus();
    expect(readOpenMarks(root, null).openId).toBe('a');
  });

  it('a picked mark stays open while the keyboard is on another one', () => {
    mount(marks);
    (root.querySelector('[data-editor-element-id="a"]') as HTMLElement).focus();
    expect(readOpenMarks(root, 'b').openId).toBe('b');
  });

  it('moving focus off a mark closes it', async () => {
    mount(marks);
    const a = root.querySelector('[data-editor-element-id="a"]') as HTMLElement;
    act(() => render(<Probe pickedId={null} />, document.createElement('div')));
    await act(async () => { a.focus(); await Promise.resolve(); });
    expect(seen.openId).toBe('a');
    await act(async () => { a.blur(); await Promise.resolve(); });
    expect(seen.openId).toBeNull();
  });

  it('stops listening for focus once it unmounts', () => {
    mount(marks);
    const removed: string[] = [];
    const remove = root.removeEventListener.bind(root);
    root.removeEventListener = ((type: string, ...rest: [EventListenerOrEventListenerObject, ...unknown[]]) => { removed.push(type); remove(type, ...(rest as [EventListenerOrEventListenerObject])); }) as typeof root.removeEventListener;
    const host = document.createElement('div');
    act(() => render(<Probe pickedId={null} />, host));
    act(() => render(null, host));
    expect(removed).toEqual(expect.arrayContaining(['focusin', 'focusout']));
  });
});
