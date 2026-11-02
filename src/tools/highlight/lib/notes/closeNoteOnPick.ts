import type { EditorElement } from '#editor/model/editorModel.ts';
import { isComment } from '#editor/comments/anchors.ts';

/**
 * On touch, picking a mark puts its controls up top. A note still open in the sheet on another mark would keep that
 * mark's outline and its text on screen next to the new pick, so it closes; the one on the picked mark stays.
 */
export function closesNoteOnPick(elements: readonly EditorElement[], activeId: string | null, pickedId: string): boolean {
  const open = activeId ? elements.find((el) => el.id === activeId) : undefined;
  if (!open || !isComment(open)) return false;
  return !(open.anchor.kind === 'element' && open.anchor.elementId === pickedId);
}
