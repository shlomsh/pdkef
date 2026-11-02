import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { englishHighlightMessages } from '../messages.ts';
import { useNoteWriter } from '../hooks/useNoteWriter.ts';
import NoteWriter from './NoteWriter.tsx';

const onSave = vi.fn();
const onDiscard = vi.fn();
const onReturnFocus = vi.fn();
let container: HTMLElement;

function Harness({ target }: { target: { id: string; comment: string; isNew: boolean } }) {
  const writer = useNoteWriter();
  return (
    <div>
      <button type="button" data-open onClick={() => writer.open(target)}>open</button>
      <NoteWriter writer={writer} messages={englishSignMessages} labels={englishHighlightMessages.notes}
        onSave={onSave} onDiscard={onDiscard} onReturnFocus={onReturnFocus} />
    </div>
  );
}

function mount(target: { id: string; comment: string; isNew: boolean }) {
  act(() => render(<Harness target={target} />, container));
  const dialog = container.querySelector('dialog') as HTMLDialogElement;
  const field = container.querySelector('textarea') as HTMLTextAreaElement;
  const open = container.querySelector('[data-open]') as HTMLButtonElement;
  return { dialog, field, open };
}
const buttons = () => Array.from(container.querySelectorAll('dialog button')) as HTMLButtonElement[];
const byText = (text: string) => buttons().find((b) => b.textContent === text)!;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
  onSave.mockClear(); onDiscard.mockClear(); onReturnFocus.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => render(null, container)); container.remove(); });

describe('NoteWriter', () => {
  it('focuses the field and opens the dialog synchronously inside the tap', () => {
    const { dialog, field, open } = mount({ id: 'a', comment: 'hello', isNew: false });
    open.click();
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('hello');
    expect(field.selectionStart).toBe(5);
  });

  it('saves an edited old note and closes', () => {
    const { dialog, field, open } = mount({ id: 'a', comment: 'hello', isNew: false });
    act(() => open.click());
    field.value = 'changed';
    act(() => { field.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => byText(englishSignMessages.commentSave).click());
    expect(onSave).toHaveBeenCalledWith('a', { comment: 'changed', commentedAt: expect.any(Number) });
    expect(dialog.open).toBe(false);
    expect(onReturnFocus).toHaveBeenCalledWith('a');
  });

  it('disables Save while blank and labels a new note Comment', () => {
    const { open } = mount({ id: 'b', comment: '', isNew: true });
    act(() => open.click());
    const save = byText(englishSignMessages.highlightCommentLabel);
    expect(save.disabled).toBe(true);
  });

  it('Cancel on a new note discards it', () => {
    const { dialog, open } = mount({ id: 'b', comment: '', isNew: true });
    act(() => open.click());
    act(() => byText(englishSignMessages.commentCancel).click());
    expect(onDiscard).toHaveBeenCalledWith('b');
    expect(dialog.open).toBe(false);
  });

  it('Escape on a new note discards it', () => {
    const { dialog, open } = mount({ id: 'b', comment: '', isNew: true });
    act(() => open.click());
    const event = new Event('cancel', { cancelable: true });
    act(() => { dialog.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(onDiscard).toHaveBeenCalledWith('b');
  });

  it('Cancel on an old note calls neither save nor discard', () => {
    const { open } = mount({ id: 'a', comment: 'hello', isNew: false });
    act(() => open.click());
    act(() => byText(englishSignMessages.commentCancel).click());
    expect(onSave).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onReturnFocus).toHaveBeenCalledWith('a');
  });
});
