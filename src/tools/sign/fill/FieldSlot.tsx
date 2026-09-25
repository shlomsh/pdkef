import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import usePdfCoordinates from '../../../editor-ui/hooks/usePdfCoordinates.js';
import { resolveTypography } from '../../../editor/text/fonts.js';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';
import type { EnterKeyHint, FillSlot } from './fillTypes.ts';
import styles from './fill.module.css';

/**
 * Fill mode (SNG-15): an empty writing spot, before it is ever left with
 * text in it (docs/sign-fill-mode.md, "A slot while empty, an element once
 * filled"). A real, single-line, uncontrolled `<input type="text">` - iOS's
 * own keyboard arrows, Tab and VoiceOver all need a genuine focusable input
 * to land on, not a styled div standing in for one. This component renders
 * and forwards events only: what "aimed" means (fillReach.ts), when a tap
 * should reach it (fillTap.ts) and what a commit turns into (a `TextElement`
 * via `placeTextOnField`, elsewhere) are all decided above it, never here.
 *
 * Font size and family are resolved exactly as TextNode.tsx resolves them -
 * the same `resolveTypography` call, the same scaleFactor derived from the
 * page's own rendered width via `usePdfCoordinates` - so a slot reads
 * identically to the text element it becomes the instant `ADD_ELEMENT`
 * fires. Nothing should visibly jump on commit.
 *
 * Comb fields (`slot.placement.combCells`) are not spaced per character
 * here. `comb.js` centres each typed character at a fixed cell fraction,
 * which needs the live value to position - a controlled overlay, the same
 * shape TextNode's own comb div is, not a plain input. Building that here
 * would turn the "real, uncontrolled input" iOS needs into a synthetic one,
 * exactly what this component exists to avoid. A `letter-spacing`
 * approximation was considered and rejected too: it adds a fixed gap after
 * each glyph's own (variable) advance rather than pinning characters to
 * fixed-width cells, so it drifts from the printed pitch in precisely the
 * way `comb.js`'s own docstring says a comb must not. A comb slot renders as
 * plain text, aligned by direction, until it is committed and TextNode's
 * real comb layout takes over.
 */
export default function FieldSlot({ slot, enterKeyHint, aimed, pageWidthPoints, label, onEnter, onCommit }: {
  slot: FillSlot;
  enterKeyHint: EnterKeyHint;
  /** The droppable look: this slot is what the armed tool's own reach would tap next. */
  aimed: boolean;
  pageWidthPoints: number;
  label: string;
  /** Enter, without Shift and not composing: move to the next fill input. */
  onEnter: () => void;
  /** Blurred with a non-blank value: the caller turns this slot into a text element. */
  onCommit: (text: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { getScaleFactor } = usePdfCoordinates();
  const [scaleFactor, setScaleFactor] = useState(1);

  // The same measurement TextNode.tsx makes for its own fontSize: the page
  // can be shown at any rendered width, so points only become the right CSS
  // px through the page wrapper's actual size, kept in sync as it resizes.
  useLayoutEffect(() => {
    const pageWrapper = inputRef.current?.closest(`.${workspaceStyles['page-wrapper']}`) || null;
    if (!pageWrapper) return undefined;
    const updateScale = () => setScaleFactor(getScaleFactor(pageWrapper, pageWidthPoints));
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(pageWrapper);
    return () => observer.disconnect();
  }, [pageWidthPoints]);

  const { box, fontFamily, fontSize } = slot.placement;
  // No text yet, so this never substitutes a family - fonts.js's covers('',
  // ...) is vacuously true, so the family the placement already chose is
  // always kept. Called anyway, rather than reading fontFamily straight off
  // the placement, so weight/style/padding come from the one shared rule
  // TextNode itself resolves through, not a second copy of it.
  const typography = resolveTypography(fontFamily, '', 'normal', 'normal', fontSize);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    onEnter();
  };

  const handleBlur = (event: FocusEvent) => {
    const value = (event.currentTarget as HTMLInputElement).value.trim();
    if (value) onCommit(value);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      data-fill-input
      data-fill-key={slot.key}
      className={`${styles.slot}${aimed ? ` ${styles.aimed}` : ''}`}
      enterKeyHint={enterKeyHint}
      dir="auto"
      aria-label={label}
      autocomplete="off"
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      style={{
        left: `${box.left}%`,
        top: `${box.top}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
        fontSize: `${typography.size * scaleFactor}px`,
        fontFamily: typography.family,
        fontWeight: typography.weight,
        fontStyle: typography.style,
        '--text-pad-em': `${typography.paddingEm}em`,
      }}
    />
  );
}
