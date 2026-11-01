import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { commentCards, stackCards } from '#editor/highlight/commentCards.ts';
import { anchorNode, markAnchor } from './anchorNode.ts';
import type { CommentPatch } from '#editor/highlight/commentCommit.ts';
import { commentCardLabel } from './commentLabel.ts';
import { CommentCardBody } from './CommentCardBody.tsx';
import styles from './CommentRail.module.css';

const GAP = 8;
const NUDGE = 6;
const stop = (event: Event) => event.stopPropagation();

/** SIGN-44: comments in a margin rail beside the page, each card level with its anchor. */
export function CommentRail({ pageIndex, elements, activeElementId, messages, onSelect, onSave, onDelete, onDiscard, onReturnFocus, railHeight }: {
  pageIndex: number;
  elements: readonly EditorElement[];
  activeElementId: string | null;
  messages: SignMessages;
  onSelect: (id: string) => void;
  onSave: (id: string, patch: CommentPatch) => void;
  onDelete: (id: string) => void;
  onDiscard: (id: string) => void;
  onReturnFocus?: (id: string) => void;
  /** The rail's height in px, when the caller knows it: cards are then placed in the render that changes it. */
  railHeight?: number;
}) {
  const cards = commentCards(elements, pageIndex, activeElementId);
  const rail = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ tops: Map<string, number>; height: number }>({ tops: new Map(), height: 0 });
  const key = cards.map((c) => `${c.id}:${c.firstBand.top}:${c.isNew}:${c.comment}`).join('|');
  const known = railHeight !== undefined;
  // Card heights change with their content or the rail's width, never with the rail's height.
  const [heights, setHeights] = useState<Map<string, number>>(new Map());
  const derived = useMemo(() => (known ? derivedLayout(cards, heights, railHeight) : null), [known, key, heights, railHeight]);

  useLayoutEffect(() => {
    const root = rail.current;
    if (!root) return;
    const measure = () => {
      if (known) {
        const next = new Map<string, number>();
        for (const card of cards) next.set(card.id, root.querySelector<HTMLElement>(`[data-comment-card="${CSS.escape(card.id)}"]`)?.offsetHeight ?? 0);
        setHeights((prev) => (sameHeights(prev, next) ? prev : next));
        return;
      }
      const railHeight = root.getBoundingClientRect().height;
      const wanted = cards.map((card) => {
        const node = root.querySelector<HTMLElement>(`[data-comment-card="${CSS.escape(card.id)}"]`);
        return { id: card.id, want: (card.firstBand.top / 100) * railHeight - NUDGE, height: node?.offsetHeight ?? 0 };
      });
      const tops = stackCards(wanted, GAP);
      const last = wanted[wanted.length - 1];
      const height = last ? (tops.get(last.id) ?? 0) + last.height : 0;
      setLayout((prev) => (sameLayout(prev, tops, height) ? prev : { tops, height }));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root);
    root.querySelectorAll('[data-comment-card]').forEach((node) => observer?.observe(node));
    return () => observer?.disconnect();
  }, [key, known]);
  const shown = derived ?? layout;

  return (
    <div ref={rail} class={styles.rail} data-comment-rail style={{ minHeight: `${shown.height}px` }}
      onClick={stop} onMouseDown={stop} onTouchStart={stop}>
      {cards.map((card) => (
        <div key={card.id} class={styles.card} data-comment-card={card.id} data-active={card.id === activeElementId ? 'true' : undefined}
          style={{ top: `${shown.tops.get(card.id) ?? 0}px` }}
          onMouseEnter={() => markAnchor(elements, card.id, 'data-comment-hover', true)} onMouseLeave={() => markAnchor(elements, card.id, 'data-comment-hover', false)}>
          <CommentCardBody
            card={card}
            active={card.id === activeElementId}
            messages={messages}
            label={commentCardLabel(elements, card.id, pageIndex, messages)}
            onSelect={() => { onSelect(card.id); anchorNode(elements, card.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}
            onSave={(patch) => onSave(card.id, patch)}
            onDelete={() => onDelete(card.id)}
            onDiscard={() => onDiscard(card.id)}
            onReturnFocus={() => onReturnFocus?.(card.id)}
          />
        </div>
      ))}
    </div>
  );
}

function sameLayout(prev: { tops: Map<string, number>; height: number }, tops: Map<string, number>, height: number): boolean {
  if (prev.height !== height || prev.tops.size !== tops.size) return false;
  for (const [id, top] of tops) if (prev.tops.get(id) !== top) return false;
  return true;
}

/** Tops for the cards given their measured heights and the rail's height; pure, so a new height lands in one render. */
function derivedLayout(cards: ReturnType<typeof commentCards>, heights: ReadonlyMap<string, number>, railHeight: number): { tops: Map<string, number>; height: number } {
  const wanted = cards.map((card) => ({ id: card.id, want: (card.firstBand.top / 100) * railHeight - NUDGE, height: heights.get(card.id) ?? 0 }));
  const tops = stackCards(wanted, GAP);
  const last = wanted[wanted.length - 1];
  return { tops, height: last ? (tops.get(last.id) ?? 0) + last.height : 0 };
}

function sameHeights(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, h] of b) if (a.get(id) !== h) return false;
  return true;
}
