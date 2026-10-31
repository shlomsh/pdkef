import { useEffect, useRef, useState } from 'preact/hooks';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { englishSignMessages } from '../../messages';
import type { SignMessages } from '#editor/registry/messages.ts';
import { commentPatch } from '../../lib/highlight/commentCommit.ts';
import type { ElementNodeChange } from '../nodeProps.ts';
import styles from './HighlightComment.module.css';

const stop = (event: Event) => event.stopPropagation();

/** SIGN-44: the note under a selected highlight. Draft is local; one onChange on blur. */
export function HighlightNote({ element, onChange, messages }: {
  element: HighlightElement;
  onChange: ElementNodeChange<HighlightElement>;
  messages?: Partial<SignMessages>;
}) {
  const t = { ...englishSignMessages, ...messages };
  const [draft, setDraft] = useState(element.comment ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  // Only a note the button just opened (comment === '' at mount) takes focus; a restored comment never does.
  useEffect(() => { if (element.comment === '') ref.current?.focus(); }, []);
  // Undo, redo or restore changed the comment from outside: follow it unless the person is typing.
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(element.comment ?? '');
  }, [element.comment]);
  return (
    <div data-highlight-note class={styles.note} data-side={element.direction === 'rtl' ? 'end' : 'start'}
      onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onClick={stop} onKeyDown={stop} onKeyUp={stop}>
      <textarea
        ref={ref}
        data-highlight-note-input
        class={styles.input}
        dir="auto"
        rows={3}
        value={draft}
        placeholder={t.highlightCommentPlaceholder}
        aria-label={t.highlightCommentLabel}
        onInput={(event) => setDraft((event.currentTarget as HTMLTextAreaElement).value)}
        onBlur={() => { const patch = commentPatch(draft, element.comment); if (patch) onChange(patch); }}
        onKeyDown={(event) => { if (event.key === 'Escape') (event.currentTarget as HTMLTextAreaElement).blur(); }}
      />
    </div>
  );
}

/** SIGN-44: the numbered circle at the passage start; a click selects the highlight. */
export function HighlightBadge({ element, number, onSelect, messages }: {
  element: HighlightElement;
  number: number;
  onSelect?: (event: Event) => void;
  messages?: Partial<SignMessages>;
}) {
  const t = { ...englishSignMessages, ...messages };
  const first = element.bands[0];
  const rtl = element.direction === 'rtl';
  const centre = first ? first.top + first.height / 2 : 50;
  const edge = first ? (rtl ? first.left + first.width : first.left) : (rtl ? 100 : 0);
  return (
    <button
      type="button"
      data-highlight-badge
      class={styles.badge}
      data-side={element.direction === 'rtl' ? 'end' : 'start'}
      style={{ left: `${edge}%`, top: `${centre}%` }}
      aria-label={formatMessage(t.highlightCommentNumberLabel, { number })}
      onPointerDown={stop}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={(event) => { event.stopPropagation(); onSelect?.(event); }}
    >
      {number}
    </button>
  );
}
