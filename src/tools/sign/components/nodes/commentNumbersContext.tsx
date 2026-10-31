import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useContext, useMemo } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { commentNumbers } from '../../lib/highlight/commentNumbers.ts';

/* SIGN-44: highlight id -> comment number, computed once per elements change. */
const CommentNumbersContext = createContext<ReadonlyMap<string, number>>(new Map());

/** @testSeam */
export const CommentNumbersProvider = CommentNumbersContext.Provider;
export const useCommentNumber = (id: string): number | undefined => useContext(CommentNumbersContext).get(id);

export function CommentNumbersScope({ elements, children }: { elements: readonly EditorElement[]; children: ComponentChildren }) {
  const numbers = useMemo(() => commentNumbers(elements), [elements]);
  return <CommentNumbersProvider value={numbers}>{children}</CommentNumbersProvider>;
}
