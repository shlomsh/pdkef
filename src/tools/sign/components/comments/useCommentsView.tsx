import { useEffect, useRef, useState } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { commentCount, hasCommentCards } from '../../lib/highlight/commentCards.ts';
import { CommentRail } from './CommentRail.tsx';
import { CommentSheet } from './CommentSheet.tsx';
import styles from './CommentRail.module.css';

/** Pages container width from which comments sit in a rail beside the page; narrower uses the sheet. */
const RAIL_MIN_WIDTH_PX = 1000;

type CommentPatch = { comment: string | undefined };

/**
 * SIGN-44's comments view, wired once for the workspace: a margin rail beside every page on a wide
 * workspace (from the first comment on, never for highlighting alone), a bottom
 * sheet on a narrow one, and the page header's comment count.
 */
export function useCommentsView({ elements, activeElementId, messages, onSelect, onChange }: {
  elements: readonly EditorElement[];
  activeElementId: string | null;
  messages: SignMessages;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: CommentPatch) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setWide(node.getBoundingClientRect().width >= RAIL_MIN_WIDTH_PX));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // Opens with the first comment (pressing Comment, never mid-swipe), for every page at once so the
  // pages keep one width; highlighting alone leaves the page at full width.
  const showRail = wide && hasCommentCards(elements, activeElementId);
  return {
    containerRef,
    cardClass: showRail ? styles['page-card-with-rail'] : undefined,
    headerNote: (pageIndex: number) => {
      const count = commentCount(elements, pageIndex);
      if (count === 0) return undefined;
      return count === 1 ? messages.commentsCountOne : formatMessage(messages.commentsCountOther, { count });
    },
    rail: (pageIndex: number) => (showRail ? (
      <CommentRail pageIndex={pageIndex} elements={elements} activeElementId={activeElementId} messages={messages} onSelect={onSelect} onChange={onChange} />
    ) : null),
    sheet: wide ? null : (
      <CommentSheet elements={elements} activeElementId={activeElementId} messages={messages} onChange={onChange} onClose={() => onSelect(null)} />
    ),
  };
}
