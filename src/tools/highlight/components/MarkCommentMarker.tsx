import { CommentMarker } from '#editor-ui/comments/HighlightComment.tsx';
import { commentMarkers } from '#editor/comments/anchors.ts';
import { commentNumbers } from '#editor/highlight/commentNumbers.ts';
import { readerTextDirection } from '#editor/highlight/resolveDirection.ts';
import type { EditorElement } from '#editor/model/editorModel.ts';

type MarkerPlace = NonNullable<ReturnType<ReturnType<typeof commentMarkers>['get']>>;

type MarkComment = { id: string; at: MarkerPlace; number: number | undefined };

/** Each commented mark's comment: its id, number and the marker's place in the mark's box, the way Sign draws them. */
export function commentsByMark(elements: EditorElement[]): Map<string, MarkComment> {
  const places = commentMarkers(elements, () => readerTextDirection());
  const numbers = commentNumbers(elements);
  const byMark = new Map<string, MarkComment>();
  for (const el of elements) {
    const at = places.get(el.id);
    if (el.type === 'comment' && el.anchor.kind === 'element' && at) byMark.set(el.anchor.elementId, { id: el.id, at, number: numbers.get(el.id) });
  }
  return byMark;
}

/** The comment marker on one mark, wearing its focused ring while its card is the active one. */
export default function MarkCommentMarker({ comment, activeElementId, onSelectComment }: {
  comment: MarkComment | undefined;
  activeElementId: string | null;
  onSelectComment?: (commentId: string) => void;
}) {
  if (!comment) return null;
  return <CommentMarker at={comment.at} number={comment.number} focused={activeElementId === comment.id} onSelect={() => onSelectComment?.(comment.id)} />;
}
