import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { commentCards } from '#editor/highlight/commentCards.ts';
import { anchorNode, markAnchor } from './anchorNode.ts';
import type { CommentPatch } from '#editor/highlight/commentCommit.ts';
import { commentCardLabel } from './commentLabel.ts';
import { railLayout, type RailLayout } from './railLayout.ts';
import { CommentCardBody } from './CommentCardBody.tsx';
import styles from './CommentRail.module.css';

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
  const [layout, setLayout] = useState<RailLayout>({ tops: new Map(), height: 0 });
  const key = cards.map((c) => `${c.id}:${c.firstBand.top}:${c.isNew}:${c.comment}`).join('|');
  const known = railHeight !== undefined;
  // Card heights change with their content or the rail's width, never with the rail's height.
  const [heights, setHeights] = useState<Map<string, number>>(new Map());
  const derived = useMemo(() => (known ? railLayout(cards, heights, railHeight) : null), [known, key, heights, railHeight]);

  useLayoutEffect(() => {
    const root = rail.current;
    if (!root) return;
    const measure = () => {
      const next = new Map<string, number>();
      for (const card of cards) next.set(card.id, root.querySelector<HTMLElement>(`[data-comment-card="${CSS.escape(card.id)}"]`)?.offsetHeight ?? 0);
      if (known) {
        setHeights((prev) => (sameHeights(prev, next) ? prev : next));
        return;
      }
      const { tops, height } = railLayout(cards, next, root.getBoundingClientRect().height);
      setLayout((prev) => (sameLayout(prev, tops, height) ? prev : { tops, height }));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(root);
    root.querySelectorAll('[data-comment-card]').forEach((node) => observer?.observe(node));
    return () => observer?.disconnect();
  }, [key, known]);
  const shown = derived ?? layout;

  // A card that unmounts under the pointer never fires mouseleave: clear its passage here (the node is kept, its comment may be gone).
  const hovered = useRef<{ id: string; node: HTMLElement | null } | null>(null);
  const cardIds = cards.map((c) => c.id).join('|');
  const clearHover = () => { hovered.current?.node?.removeAttribute('data-comment-hover'); hovered.current = null; };
  useEffect(() => {
    if (hovered.current && !cards.some((c) => c.id === hovered.current!.id)) clearHover();
  }, [cardIds]);
  useEffect(() => clearHover, []);

  return (
    <div ref={rail} class={styles.rail} data-comment-rail style={{ minHeight: `${shown.height}px` }}
      onClick={stop} onMouseDown={stop} onTouchStart={stop}>
      {cards.map((card) => (
        <div key={card.id} class={styles.card} data-comment-card={card.id} data-active={card.id === activeElementId ? 'true' : undefined}
          style={{ top: `${shown.tops.get(card.id) ?? 0}px` }}
          onMouseEnter={() => { hovered.current = { id: card.id, node: anchorNode(elements, card.id) }; markAnchor(elements, card.id, 'data-comment-hover', true); }}
          onMouseLeave={() => { hovered.current = null; markAnchor(elements, card.id, 'data-comment-hover', false); }}>
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

function sameLayout(prev: RailLayout, tops: Map<string, number>, height: number): boolean {
  if (prev.height !== height || prev.tops.size !== tops.size) return false;
  for (const [id, top] of tops) if (prev.tops.get(id) !== top) return false;
  return true;
}

function sameHeights(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, h] of b) if (a.get(id) !== h) return false;
  return true;
}
