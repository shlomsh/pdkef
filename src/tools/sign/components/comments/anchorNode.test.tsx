import { afterEach, describe, expect, it } from 'vitest';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { anchorNode, markAnchor } from './anchorNode.ts';

const box = { pageIndex: 0, left: 10, top: 10, width: 20, height: 5 };
const elements = [
  { id: 'h1', type: 'highlight', color: '#ff0', bands: [], ...box },
  { id: 'c1', type: 'comment', comment: 'On the highlight', anchor: { kind: 'element', elementId: 'h1' }, ...box },
  { id: 'c2', type: 'comment', comment: 'A pin', anchor: { kind: 'point' }, ...box },
] as unknown as EditorElement[];

function node(id: string) {
  const el = document.createElement('div');
  el.setAttribute('data-editor-element-id', id);
  document.body.appendChild(el);
  return el;
}
afterEach(() => { document.body.innerHTML = ''; });

describe('anchorNode', () => {
  it('is the target node for an element comment and the comment node for a pin', () => {
    const target = node('h1');
    const pin = node('c2');
    expect(anchorNode(elements, 'c1')).toBe(target);
    expect(anchorNode(elements, 'c2')).toBe(pin);
    expect(anchorNode(elements, 'h1')).toBeNull();
  });
  it('markAnchor sets and clears the marker on the anchored node', () => {
    const target = node('h1');
    markAnchor(elements, 'c1', 'data-comment-focus', true);
    expect(target.hasAttribute('data-comment-focus')).toBe(true);
    markAnchor(elements, 'c1', 'data-comment-focus', false);
    expect(target.hasAttribute('data-comment-focus')).toBe(false);
  });
});
