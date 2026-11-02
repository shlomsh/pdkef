import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommentElement, EditorElement, HighlightElement } from '#editor/model/editorModel.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import NotePane from './NotePane.tsx';

const mark = (id: string, pageIndex: number, top: number): HighlightElement => ({ id, type: 'highlight', pageIndex, left: 10, top, width: 30, height: 4, color: '#FFF34D', bands: [] });
const note = (id: string, on: string, pageIndex: number, top: number): CommentElement => ({ id, type: 'comment', pageIndex, left: 10, top, width: 30, height: 4, comment: `text ${id}`, anchor: { kind: 'element', elementId: on } });
const elements: EditorElement[] = [mark('m1', 0, 10), note('c1', 'm1', 0, 10), mark('m2', 0, 40), note('c2', 'm2', 0, 40), mark('m3', 1, 10), note('c3', 'm3', 1, 10)];

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) { act(() => render(null, host!)); host.remove(); host = null; }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mount(activeElementId: string | null, over: Partial<Parameters<typeof NotePane>[0]> = {}) {
  const props = { onSelect: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(), onDiscard: vi.fn(), onUndo: vi.fn() };
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<NotePane elements={elements} activeElementId={activeElementId} messages={englishSignMessages} labels={t.notes} {...props} {...over} />, host!));
  return {
    ...props,
    root: () => host!.querySelector<HTMLElement>('[data-note-pane]'),
    button: (label: string) => host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!,
    click: (el: Element) => act(() => { (el as HTMLElement).click(); }),
  };
}

describe('NotePane', () => {
  it('renders nothing with no active note', () => {
    const { root } = mount(null);
    expect(root()).toBeNull();
  });

  it('counts the active note and steps to its neighbours', () => {
    const { root, button, click, onSelect } = mount('c2');
    expect(root()!.getAttribute('aria-label')).toBe('Notes');
    expect(root()!.textContent).toContain('2 of 3');
    click(button(t.notes.previous));
    expect(onSelect).toHaveBeenLastCalledWith('c1');
    click(button(t.notes.next));
    expect(onSelect).toHaveBeenLastCalledWith('c3');
  });

  it('disables Previous on the first note and Next on the last', () => {
    expect(mount('c1').button(t.notes.previous).disabled).toBe(true);
    act(() => render(null, host!)); host!.remove();
    expect(mount('c3').button(t.notes.next).disabled).toBe(true);
  });

  it('closes from the Close button and from Esc', () => {
    const { button, click, onSelect } = mount('c2');
    click(button(t.notes.close));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    onSelect.mockClear();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('deletes a note, moves on, and Undo brings it back', () => {
    const { root, click, onDelete, onSelect, onUndo } = mount('c2');
    click(root()!.querySelector('[data-note-card="c2"] [data-comment-more]')!);
    click(root()!.querySelector('[data-note-card="c2"] [data-comment-menu-delete]')!);
    expect(onDelete).toHaveBeenCalledWith('c2');
    expect(onSelect).toHaveBeenLastCalledWith('c3');
    const chip = root()!.querySelector('[role="status"]')!;
    expect(chip.textContent).toContain('Note deleted');
    click(chip.querySelector('button')!);
    expect(onUndo).toHaveBeenCalled();
    expect(onSelect).toHaveBeenLastCalledWith('c2');
    expect(root()?.querySelector('[role="status"]') ?? null).toBeNull();
  });

  it('selects the note a sideways scroll rests on', () => {
    const { root, onSelect } = mount('c1');
    const track = root()!.querySelector<HTMLElement>('[data-note-track]')!;
    root()!.querySelectorAll<HTMLElement>('[data-note-card]').forEach((card, i) => Object.defineProperty(card, 'offsetLeft', { value: i * 200 }));
    track.scrollLeft = 200;
    act(() => { track.dispatchEvent(new Event('scroll')); });
    expect(onSelect).toHaveBeenCalledWith('c2');
  });

  it('sits above the on-screen keyboard', () => {
    const vv = Object.assign(new EventTarget(), { height: 500, pageTop: 0 });
    vi.stubGlobal('visualViewport', vv);
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    const { root } = mount('c1');
    expect(root()!.style.bottom).toBe('300px');
    act(() => { vv.height = 800; vv.dispatchEvent(new Event('resize')); });
    expect(root()!.style.bottom).toBe('0px');
  });
});
