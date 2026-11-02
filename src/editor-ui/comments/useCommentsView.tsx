import { useEffect, useRef, useState } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { commentCount, hasCommentCards } from '#editor/highlight/commentCards.ts';
import type { CommentPatch } from '#editor/highlight/commentCommit.ts';
import { handFocusBack, markAnchor } from './anchorNode.ts';
import { commentTarget } from './commentLabel.ts';
import { CommentRail } from './CommentRail.tsx';
import { CommentSheet } from './CommentSheet.tsx';
import styles from './CommentRail.module.css';

/** Pages container width from which comments sit in a rail beside the page; narrower uses the sheet. */
const RAIL_MIN_WIDTH_PX = 1000;

/**
 * SIGN-44's comments view, wired once for the workspace: a margin rail beside every page on a wide
 * workspace (from the first comment on, never for highlighting alone), a bottom
 * sheet on a narrow one, and the page header's comment count.
 */
export function useCommentsView({ elements, activeElementId, messages, onSelect, onSave, onDelete, onDiscard, readActions }: {
  elements: readonly EditorElement[];
  activeElementId: string | null;
  messages: SignMessages;
  onSelect: (id: string | null) => void;
  onSave: (id: string, patch: CommentPatch) => void;
  onDelete: (id: string) => void;
  onDiscard: (id: string) => void;
  /** Highlight: the rail's selected card shows Delete and Edit as buttons. Off for Sign. */
  readActions?: boolean;
}) {
  // A callback ref, so a container that mounts after this hook (Highlight's workspace opens with its file) is
  // measured too.
  const [container, containerRef] = useState<HTMLElement | null>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setWide(container.getBoundingClientRect().width >= RAIL_MIN_WIDTH_PX));
    observer.observe(container);
    return () => observer.disconnect();
  }, [container]);
  // The selected comment's anchor wears a deeper tint (or outline) while it is selected.
  useEffect(() => {
    if (!activeElementId) return undefined;
    markAnchor(elements, activeElementId, 'data-comment-focus', true);
    return () => markAnchor(elements, activeElementId, 'data-comment-focus', false);
  }, [elements, activeElementId]);
  // Focus goes back to the mark a note belongs to, else to the workspace itself; never the body.
  const focusAnchor = (markId: string | null) => {
    const node = markId ? container?.querySelector<HTMLElement>(`[data-editor-element-id="${CSS.escape(markId)}"]`) : null;
    if (node) handFocusBack(node);
    if (node && document.activeElement === node) return;
    if (!container) return;
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
    container.focus();
  };
  const returnFocus = (commentId: string) => focusAnchor(commentTarget(elements, commentId)?.id ?? null);
  // A note that closes (Esc, a press elsewhere, Delete, Cancel on a new one) leaves focus on the body when
  // its field unmounts; hand it back unless the person already moved it to another control.
  const open = useRef<{ id: string; markId: string | null } | null>(null);
  useEffect(() => {
    const was = open.current;
    const now = activeElementId && elements.some((el) => el.id === activeElementId && el.type === 'comment') ? activeElementId : null;
    open.current = now ? { id: now, markId: commentTarget(elements, now)?.id ?? null } : null;
    if (!was || was.id === now) return;
    const active = document.activeElement;
    if (!active || active === document.body) focusAnchor(was.markId);
  }, [activeElementId, elements]);
  // Opens with the first comment (pressing Comment, never mid-swipe), for every page at once so the
  // pages keep one width; highlighting alone leaves the page at full width.
  const showRail = wide && hasCommentCards(elements, activeElementId);
  return {
    containerRef,
    returnFocus,
    /** The workspace is wide enough for the rail; a tool with its own narrow view (Highlight's note pane) reads this. */
    wide,
    showRail,
    cardClass: showRail ? styles['page-card-with-rail'] : undefined,
    headerNote: (pageIndex: number) => {
      const count = commentCount(elements, pageIndex);
      if (count === 0) return undefined;
      return count === 1 ? messages.commentsCountOne : formatMessage(messages.commentsCountOther, { count });
    },
    rail: (pageIndex: number, railHeight?: number) => (showRail ? (
      <CommentRail pageIndex={pageIndex} elements={elements} activeElementId={activeElementId} messages={messages} onSelect={onSelect} onSave={onSave} onDelete={onDelete} onDiscard={onDiscard} onReturnFocus={returnFocus} railHeight={railHeight} readActions={readActions} />
    ) : null),
    sheet: wide ? null : (
      <CommentSheet elements={elements} activeElementId={activeElementId} messages={messages} onSave={onSave} onDelete={onDelete} onDiscard={onDiscard} onClose={() => onSelect(null)} onReturnFocus={returnFocus} />
    ),
  };
}
