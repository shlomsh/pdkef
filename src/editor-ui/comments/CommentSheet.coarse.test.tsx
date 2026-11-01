import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { CommentSheet } from './CommentSheet.tsx';

const comment = (text: string): EditorElement => ({
  id: 'a', type: 'comment', pageIndex: 1, left: 10, top: 20, width: 50, height: 2, comment: text,
  anchor: { kind: 'passage', bands: [{ left: 0, top: 0, width: 100, height: 100 }] },
});

let host: HTMLDivElement | null = null;
afterEach(() => { if (host) render(null, host); host?.remove(); host = null; vi.unstubAllGlobals(); });

/** A finger on an element: the event order a touch screen produces. */
const tap = (el: Element) => {
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  }
};
const button = (name: string) => [...host!.querySelectorAll('button')].filter((b) => b.textContent === name).pop()!;

function mountPhone(text: string) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('coarse'), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  host = document.createElement('div');
  document.body.appendChild(host);
  let elements = [comment(text)];
  const draw = () => render(
    <CommentSheet elements={elements} activeElementId="a" messages={englishSignMessages}
      onSave={(_id, patch) => { elements = [{ ...elements[0], ...patch } as EditorElement]; draw(); }}
      onDelete={() => {}} onDiscard={() => {}} onClose={() => {}}
      // Handing focus back moves it between nodes and the host app re-renders in that same task.
      onReturnFocus={() => draw()} />, host!);
  act(() => { draw(); });
}

describe('CommentSheet on a phone (coarse pointer)', () => {
  it('Save on an existing comment leaves the edit field closed', () => {
    mountPhone('hello');
    act(() => tap(host!.querySelector('p')!));
    expect(host!.querySelector('textarea')).not.toBeNull();
    const field = host!.querySelector<HTMLTextAreaElement>('textarea')!;
    field.value = 'hello again';
    act(() => { field.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => tap(button(englishSignMessages.highlightCommentLabel)));
    expect(host!.querySelector('textarea')).toBeNull();
    expect(host!.querySelector('p')!.textContent).toBe('hello again');
  });

  it('Cancel on an existing comment leaves the edit field closed', () => {
    mountPhone('hello');
    act(() => tap(host!.querySelector('p')!));
    expect(host!.querySelector('textarea')).not.toBeNull();
    act(() => tap(button(englishSignMessages.commentCancel)));
    expect(host!.querySelector('textarea')).toBeNull();
  });
});
