import type { EditorElement } from './editorModel.ts';

/** The snapshot predicate every delete call site uses: the element and the comments anchored to it go (and come back) together. */
export function deletedWith(id: string): (element: EditorElement) => boolean {
  return (el) => el.id === id || (el.type === 'comment' && el.anchor.kind === 'element' && el.anchor.elementId === id);
}
