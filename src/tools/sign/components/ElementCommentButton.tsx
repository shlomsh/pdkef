import { useContext } from 'preact/hooks';
import { CommentIcon } from '#editor-ui/toolIcons.tsx';
import type { EditorElement } from '#editor/model/editorModel.ts';
import { createElementId } from '#editor/model/ids.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { commentsAnchoredTo } from '../lib/comments/anchors.ts';
import { newElementComment } from '../lib/comments/newComment.ts';
import { SignToolContext } from './SignToolContext.tsx';

/** The Comment button every selected element's toolbar carries: opens the element's comment, adding a blank one first if it has none. */
export default function ElementCommentButton({ element, className, t }: { element: EditorElement; className: string; t: SignMessages }) {
  const sign = useContext(SignToolContext);
  if (!sign) return null;
  const { state, dispatch } = sign;
  const open = () => {
    const existing = commentsAnchoredTo(state.elements, element.id)[0];
    if (existing) return dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: existing.id });
    // Not logged: a blank card is not an edit, and the comment is saved (and logged) with its text.
    const comment = newElementComment(element, createElementId());
    dispatch({ type: 'ADD_ELEMENT', payload: comment });
    dispatch({ type: 'SET_ACTIVE_ELEMENT_ID', payload: comment.id });
  };
  return (
    <button type="button" data-element-comment-button className={className} aria-label={t.highlightCommentLabel} title={t.highlightCommentLabel} onClick={open}>
      <CommentIcon size={16} />
    </button>
  );
}
