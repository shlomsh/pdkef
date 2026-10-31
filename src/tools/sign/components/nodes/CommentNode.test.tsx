import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { CommentElement, HighlightElement } from '#editor/model/editorModel.ts';
import CommentNode from './CommentNode.tsx';
import { CommentNumbersScope } from './commentNumbersContext.tsx';

const highlight: HighlightElement = {
  id: 'h', type: 'highlight', pageIndex: 0, left: 10, top: 10, width: 50, height: 10, color: '#FFF34D',
  bands: [{ left: 20, top: 0, width: 80, height: 100 }], direction: 'rtl',
};
const onHighlight: CommentElement = {
  id: 'c', type: 'comment', pageIndex: 0, left: 10, top: 10, width: 50, height: 10, comment: 'x', anchor: { kind: 'element', elementId: 'h' },
};

let host: HTMLDivElement;
function mount(element: CommentElement, isActive = false) {
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(
    <CommentNumbersScope elements={[highlight, element]}><CommentNode element={element} isActive={isActive} onResizeStart={() => {}} /></CommentNumbersScope>,
    host,
  ));
}
afterEach(() => { act(() => render(null, host)); host.remove(); });

describe('CommentNode marker', () => {
  it('draws a comment on a Hebrew highlight as the bubble marker at the passage end, on the left', () => {
    mount(onHighlight);
    const marker = host.querySelector<HTMLElement>('[data-comment-marker]')!;
    expect(marker.querySelector('svg')).not.toBeNull();
    expect(marker.style.left).toBe('20%');
    expect(marker.dataset.side).toBe('end');
  });

  it('draws a passage comment with the same bubble marker', () => {
    mount({ ...onHighlight, anchor: { kind: 'passage', bands: [{ left: 0, top: 0, width: 100, height: 100 }] } });
    expect(host.querySelector('[data-comment-marker] svg')).not.toBeNull();
  });

  it('rings the marker while its comment is selected', () => {
    mount(onHighlight, true);
    expect(host.querySelector('[data-comment-marker]')!.hasAttribute('data-focused')).toBe(true);
  });
});
