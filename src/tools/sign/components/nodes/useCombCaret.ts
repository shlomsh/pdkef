import { useEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * Tracks the live caret position for a comb field (CombCells.tsx), shared by
 * TextNode.tsx (editing a placed comb field) and FieldSlot.tsx (an empty
 * slot previewing the comb it would become) so the two can never drift.
 *
 * The real input/textarea's own caret sits at the unspaced text position
 * (`selectionStart`), which lands mid-field instead of at the cell the next
 * character will fill - RTL forms are the common case. CombCells draws its
 * own caret instead, at the cell boundary `combCaretFraction` computes, so
 * this hook exists only to keep that position in sync with the real one:
 * null while the element has no focus, `selectionStart` while it does.
 * `selectionchange` fires on the document, so it is filtered to this
 * element being focused - it is what catches a caret moved by a method none
 * of the element's own events cover (e.g. a keyboard's own suggestion bar).
 */
export function useCombCaret(ref: RefObject<HTMLInputElement | HTMLTextAreaElement>, enabled: boolean): {
  caretIndex: number | null;
  /** Spread onto the input/textarea; empty when !enabled. */
  caretEvents: {
    onFocus?: () => void;
    onBlur?: () => void;
    onKeyUp?: () => void;
    onClick?: () => void;
    onSelect?: () => void;
  };
  /** Call after the element's own onInput handling. */
  sync: () => void;
} {
  const [caretIndex, setCaretIndex] = useState<number | null>(null);

  const sync = () => {
    const el = ref.current;
    setCaretIndex(document.activeElement === el ? (el?.selectionStart ?? null) : null);
  };

  useEffect(() => {
    if (!enabled) return undefined;
    document.addEventListener('selectionchange', sync);
    return () => document.removeEventListener('selectionchange', sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const caretEvents = enabled
    ? { onFocus: sync, onBlur: () => setCaretIndex(null), onKeyUp: sync, onClick: sync, onSelect: sync }
    : {};

  return { caretIndex: enabled ? caretIndex : null, caretEvents, sync };
}
