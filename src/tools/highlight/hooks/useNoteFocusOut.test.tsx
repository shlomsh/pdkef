import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { useRef } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { useNoteFocusOut } from './useNoteFocusOut.ts';

const mark = { id: 'm1', type: 'highlight' } as unknown as EditorElement;
const note = { id: 'c1', type: 'comment', anchor: { kind: 'element', elementId: 'm1' } } as unknown as EditorElement;

let host: HTMLElement | null = null;
afterEach(() => {
  if (host) act(() => render(null, host!));
  host?.remove();
  host = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function mount(opts: { enabled?: boolean; field?: boolean; activeId?: string } = {}) {
  vi.useFakeTimers();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const onClose = vi.fn();
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    useNoteFocusOut({ rootRef: ref, elements: [mark, note], activeElementId: opts.activeId ?? 'c1', enabled: opts.enabled ?? true, onClose });
    return (
      <div ref={ref}>
        <span data-editor-element-id="m1" tabIndex={0} id="mark" />
        <div data-comment-card="c1">
          <button id="inside" />
          {opts.field ? <textarea id="field" /> : null}
        </div>
        <p id="blank" tabIndex={-1} />
      </div>
    );
  }
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<Probe />, host!));
  const q = (id: string) => host!.querySelector<HTMLElement>(`#${id}`)!;
  return { onClose, q };
}

function moveFocus(from: HTMLElement, to: HTMLElement | null) {
  from.focus();
  to ? to.focus() : from.blur();
  act(() => { vi.runAllTimers(); });
}

describe('useNoteFocusOut', () => {
  it('closes when focus leaves the card for the page', () => {
    const { onClose, q } = mount();
    moveFocus(q('inside'), q('blank'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('closes when focus leaves the card for nowhere', () => {
    const { onClose, q } = mount();
    moveFocus(q('inside'), null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('stays open when focus moves to the mark it hangs on', () => {
    const { onClose, q } = mount();
    moveFocus(q('inside'), q('mark'));
    expect(onClose).not.toHaveBeenCalled();
  });
  it('stays open while the card text field is open', () => {
    const { onClose, q } = mount({ field: true });
    moveFocus(q('inside'), q('blank'));
    q('blank').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
  it('does nothing when disabled', () => {
    const { onClose, q } = mount({ enabled: false });
    moveFocus(q('inside'), q('blank'));
    q('blank').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
  it('closes on a press on blank page', () => {
    const { onClose, q } = mount();
    q('blank').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('a press on blank page leaves a picked highlight alone: only a note closes', () => {
    const { onClose, q } = mount({ activeId: 'm1' });
    q('blank').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
  it('stays open on a press in the card or on a mark', () => {
    const { onClose, q } = mount();
    q('inside').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    q('mark').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });
  it('closes nothing when the window itself lost focus', () => {
    const { onClose, q } = mount();
    q('inside').focus();
    q('inside').blur();
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    act(() => { vi.runAllTimers(); });
    expect(onClose).not.toHaveBeenCalled();
  });
});
