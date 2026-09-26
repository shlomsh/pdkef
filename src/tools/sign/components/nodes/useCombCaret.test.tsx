import { render, type ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { describe, it, expect, afterEach } from 'vitest';
import { useCombCaret } from './useCombCaret.ts';

/**
 * A minimal host that wires the hook to a real `<input>`, the same way
 * FieldSlot.tsx and TextNode.tsx do, so `sync()` reads a real
 * `document.activeElement`/`selectionStart` rather than a mock.
 */
function CaretHost({ onCaretIndex }: { onCaretIndex: (index: number | null) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { caretIndex, caretEvents } = useCombCaret(inputRef, true);
  onCaretIndex(caretIndex);
  return (
    <input
      ref={inputRef}
      onFocus={caretEvents.onFocus}
      onSelect={caretEvents.onSelect}
      onKeyUp={caretEvents.onKeyUp}
      onClick={caretEvents.onClick}
      onBlur={caretEvents.onBlur}
    />
  );
}

function mount(vnode: ComponentChildren): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    render(vnode, host);
  });
  return host;
}

describe('useCombCaret', () => {
  let host = document.createElement('div');

  afterEach(() => {
    if (host.isConnected) {
      act(() => render(null, host));
      document.body.removeChild(host);
    }
  });

  it('reports the grapheme count, not the UTF-16 code-unit offset, for a base+combining-mark string', () => {
    // "שָׁלוֹם" splits into 4 grapheme clusters (combCharacters, comb.js):
    // ['שָׁ', 'ל', 'וֹ', 'ם'] - the first cluster alone is 3 UTF-16 code
    // units (shin + two combining marks). Placing the caret right after it
    // (selectionStart 3) must land on cell index 1 (one grapheme consumed),
    // not 3 (the raw code-unit offset) - fails before the fix, where the
    // hook published selectionStart itself.
    let latestCaretIndex: number | null = null;
    host = mount(<CaretHost onCaretIndex={(index) => { latestCaretIndex = index; }} />);
    const input = host.querySelector('input') as HTMLInputElement;

    act(() => {
      input.value = 'שָׁלוֹם';
      input.focus();
      input.selectionStart = 3;
      input.dispatchEvent(new Event('select', { bubbles: true }));
    });

    expect(latestCaretIndex).toBe(1);
  });

  it('reports a plain ASCII offset unchanged (no combining marks to collapse)', () => {
    let latestCaretIndex: number | null = null;
    host = mount(<CaretHost onCaretIndex={(index) => { latestCaretIndex = index; }} />);
    const input = host.querySelector('input') as HTMLInputElement;

    act(() => {
      input.value = '12345';
      input.focus();
      input.selectionStart = 2;
      input.dispatchEvent(new Event('select', { bubbles: true }));
    });

    expect(latestCaretIndex).toBe(2);
  });

  it('reports null once the input is blurred', () => {
    let latestCaretIndex: number | null = null;
    host = mount(<CaretHost onCaretIndex={(index) => { latestCaretIndex = index; }} />);
    const input = host.querySelector('input') as HTMLInputElement;

    act(() => {
      input.value = '123';
      input.focus();
      input.selectionStart = 1;
      input.dispatchEvent(new Event('select', { bubbles: true }));
    });
    expect(latestCaretIndex).toBe(1);

    act(() => {
      input.blur();
    });
    expect(latestCaretIndex).toBeNull();
  });
});
