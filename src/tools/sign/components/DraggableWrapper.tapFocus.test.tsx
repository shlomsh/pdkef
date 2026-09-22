import { render } from 'preact';
import { act } from 'preact/test-utils';
import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';
import TextNode from './nodes/TextNode.tsx';
import DraggableWrapper from './DraggableWrapper.tsx';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';
import type { TextElement } from '../../../editor/model/editorModel.ts';

// MOBI-24: iOS opens the keyboard only for a focus() made while the touch is
// still being handled. So the tap that opens a text box's edit session must
// have focused its textarea - editable - by the time the session is asked
// for, inside the touchend itself, not in a render effect a frame later.
// jsdom has no keyboard; what it can prove is the ordering, and the ordering
// is the whole bug.

function coarsePointer(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches && query.includes('coarse'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

const element: TextElement = { id: 't1', type: 'text', pageIndex: 0, left: 20, top: 10, text: 'Hi', fontSize: 12 };

function mount(onBeginEdit: () => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const wrapper = document.createElement('div');
  wrapper.className = workspaceStyles['page-wrapper'];
  wrapper.getBoundingClientRect = () => new DOMRect(0, 0, 600, 800);
  host.appendChild(wrapper);
  act(() => {
    render(
      <DraggableWrapper
        element={element}
        isActive
        isEditing={false}
        onBeginEdit={onBeginEdit}
        onSelect={() => {}}
        onChange={() => {}}
        onDelete={() => {}}
        onClone={() => {}}
        pageWidthPoints={612}
      >
        <TextNode element={element} isActive isEditing={false} onChange={() => {}} onSelect={() => {}} onBeginEdit={onBeginEdit} onResizeStart={() => {}} pageWidthPoints={612} />
      </DraggableWrapper>,
      wrapper
    );
  });
  const box = wrapper.querySelector('[data-editor-element]') as HTMLElement;
  const input = wrapper.querySelector('[data-editor-text-input]') as HTMLTextAreaElement;
  return { box, input };
}

function tap(target: EventTarget) {
  const point = { clientX: 30, clientY: 30 } as Touch;
  act(() => {
    target.dispatchEvent(new TouchEvent('touchstart', { touches: [point], changedTouches: [point], bubbles: true, cancelable: true }));
  });
  act(() => {
    window.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [point], bubbles: true, cancelable: true }));
  });
}

describe('DraggableWrapper tap-to-edit focus (MOBI-24)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('focuses the textarea, editable, before the edit session is requested', () => {
    coarsePointer(true);
    let focusedAtRequest: Element | null = null;
    let readOnlyAtRequest: boolean | null = null;
    const { box, input } = mount(() => {
      focusedAtRequest = document.activeElement;
      readOnlyAtRequest = (document.querySelector('[data-editor-text-input]') as HTMLTextAreaElement).readOnly;
    });
    expect(input.readOnly).toBe(true);

    tap(box);

    expect(focusedAtRequest).toBe(input);
    expect(readOnlyAtRequest).toBe(false);
    expect(input.selectionStart).toBe(input.value.length);
  });

  it('leaves a fine pointer alone: no focus, no edit from a tap', () => {
    coarsePointer(false);
    const onBeginEdit = vi.fn();
    const { box, input } = mount(onBeginEdit);

    tap(box);

    expect(onBeginEdit).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(input);
    expect(input.readOnly).toBe(true);
  });
});
