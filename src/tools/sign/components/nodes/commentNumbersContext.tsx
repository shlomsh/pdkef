import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useMemo } from 'preact/hooks';
import type { EditorElement, TextDirection } from '#editor/model/editorModel.ts';
import { commentNumbers } from '../../lib/highlight/commentNumbers.ts';
import { commentMarkers, type CommentMarker } from '../../lib/comments/anchors.ts';

/* SIGN-44: comment id -> its number and its marker's place, computed once per elements change. */
const CommentNumbersContext = createContext<{ numbers: ReadonlyMap<string, number>; markers: ReadonlyMap<string, CommentMarker> }>({
  numbers: new Map(), markers: new Map(),
});

export const useCommentNumber = (id: string): number | undefined => useContext(CommentNumbersContext).numbers.get(id);
export const useCommentMarker = (id: string): CommentMarker | undefined => useContext(CommentNumbersContext).markers.get(id);

export function CommentNumbersScope({ elements, directionOfPage, children }: {
  elements: readonly EditorElement[];
  directionOfPage?: (pageIndex: number) => TextDirection;
  children: ComponentChildren;
}) {
  const value = useMemo(
    () => ({ numbers: commentNumbers(elements), markers: commentMarkers(elements, directionOfPage) }),
    [elements, directionOfPage],
  );
  return <CommentNumbersContext.Provider value={value}>{children}</CommentNumbersContext.Provider>;
}
