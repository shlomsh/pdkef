import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { EditorElement } from '#editor/model/editorModel.ts';
import type { SignMessages } from '#editor/registry/messages.ts';
import { commentCards, stackCards } from '#editor/highlight/commentCards.ts';
import { anchorNode, markAnchor } from './anchorNode.ts';
import type { CommentPatch } from '#editor/highlight/commentCommit.ts';
import { CommentCardBody } from './CommentCardBody.tsx';
import styles from './CommentRail.module.css';

const GAP = 8;
const NUDGE = 6;
const stop = (event: Event) => event.stopPropagation();

/** SIGN-44: comments in a margin rail beside the page, each card level with its anchor. */
export function CommentRail({ pageIndex, elements, activeElementId, messages, onSelect, onSave, onDelete, onDiscard }: {
  pageIndex: number;
  elements: readonly EditorElement[];
  activeElementId: string | null;
  messages: SignMessages;
  onSelect: (id: string) => void;
  onSave: (id: string, patch: CommentPatch) => void;
  onDelete: (id: string) => void;
  onDiscard: (id: string) => void;
}) {
  const cards = commentCards(elements, pageIndex, activeElementId);
  const rail = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ tops: Map<string, number>; height: number }>({ tops: new Map(), height: 0 });
  const key = cards.map((c) => `${c.id}:${c.firstBand.top}:${c.isNew}:${c.comment}`).join('|');

  useLayoutEffect(() => {
    const root = rail.current;
    if (!root) return;
    const measure = () => {
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
  }, [key]);

  return (
    <div ref={rail} class={styles.rail} data-comment-rail style={{ minHeight: `${layout.height}px` }}
      onClick={stop} onMouseDown={stop} onTouchStart={stop}>
      {cards.map((card) => (
        <div key={card.id} class={styles.card} data-comment-card={card.id} data-active={card.id === activeElementId ? 'true' : undefined}
          style={{ top: `${layout.tops.get(card.id) ?? 0}px` }}
          onMouseEnter={() => markAnchor(elements, card.id, 'data-comment-hover', true)} onMouseLeave={() => markAnchor(elements, card.id, 'data-comment-hover', false)}>
          <CommentCardBody
            card={card}
            active={card.id === activeElementId}
            messages={messages}
            onSelect={() => { onSelect(card.id); anchorNode(elements, card.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}
            onSave={(patch) => onSave(card.id, patch)}
            onDelete={() => onDelete(card.id)}
            onDiscard={() => onDiscard(card.id)}
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
