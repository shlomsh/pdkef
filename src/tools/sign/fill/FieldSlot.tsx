import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import usePdfCoordinates from '../../../editor-ui/hooks/usePdfCoordinates.js';
import { resolveTypography } from '../../../editor/text/fonts.js';
import { getEffectiveTextDirection } from '../../../lib/signHelpers.js';
import { combLayout, isComb } from '../../../editor/text/comb.js';
import CombCells from '../components/nodes/CombCells.tsx';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';
import type { TextElement } from '../../../editor/model/editorModel.ts';
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
 * Comb fields (`slot.placement.combCells`) draw their cells live, the same
 * way TextNode.tsx draws them while editing a placed comb field: the real
 * input keeps taking the typing (transparent text, a visible caret), and a
 * `CombCells` overlay on top renders `combLayout` of the input's own live
 * value - `elementOf(value)`, the same `elementForSlot` call the commit
 * uses, so the cells the slot shows are exactly the cells the committed
 * element will show. A `letter-spacing` approximation was considered and
 * rejected: it adds a fixed gap after each glyph's own (variable) advance
 * rather than pinning characters to fixed-width cells, so it drifts from
 * the printed pitch in precisely the way `comb.js`'s own docstring says a
 * comb must not.
 */
export default function FieldSlot({ slot, enterKeyHint, aimed, pageWidthPoints, label, elementOf, onEnter, onCommit, onLeave }: {
  slot: FillSlot;
  enterKeyHint: EnterKeyHint;
  /** The droppable look: this slot is what the armed tool's own reach would tap next. */
  aimed: boolean;
  pageWidthPoints: number;
  label: string;
  /** The element this slot becomes with `text` in it (elementForSlot): what decides the
   * live comb layout and the direction the slot starts in and follows while typing. */
  elementOf: (text: string) => TextElement;
  /** Enter, without Shift and not composing: move to the next fill input. */
  onEnter: () => void;
  /** Blurred with a non-blank value: the caller turns this slot into a text element. */
  onCommit: (text: string) => void;
  /** Every blur, after onCommit when there was text: the free slot closes on it. */
  onLeave?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { getScaleFactor } = usePdfCoordinates();
  const [scaleFactor, setScaleFactor] = useState(1);
  // Mirrors the real, uncontrolled input's value (never drives it) so the
  // comb preview and the direction can follow every keystroke, the same as
  // TextNode's own textarea does through committed element state.
  const [value, setValue] = useState('');

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

  // The element this slot would become right now, with whatever is typed so
  // far - the one source of truth signHelpers.js's getEffectiveTextDirection
  // and comb.js's isComb/combLayout both read, so the slot never re-derives
  // either on its own (SIGN-34's "one rule for every box" applies here too).
  const element = elementOf(value);
  const direction = getEffectiveTextDirection(element);
  const comb = isComb(element);
  const cells = comb ? combLayout(element, direction === 'rtl') : null;

  const handleInput = (event: Event) => {
    setValue((event.currentTarget as HTMLInputElement).value);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    onEnter();
  };

  const handleBlur = (event: FocusEvent) => {
    const text = (event.currentTarget as HTMLInputElement).value.trim();
    if (text) onCommit(text);
    onLeave?.();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        data-fill-input
        data-fill-key={slot.key}
        className={`${styles.slot}${aimed ? ` ${styles.aimed}` : ''}${comb ? ` ${styles['slot-comb']}` : ''}`}
        enterKeyHint={enterKeyHint}
        dir={direction}
        aria-label={label}
        autocomplete="off"
        // Names, numbers and addresses are not prose, and iOS applies a pending
        // autocorrection as focus leaves for the next field ("DJane" became "Do").
        autocorrect="off"
        onInput={handleInput}
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
          // In comb layout the cells below are what's seen; the input stays
          // underneath purely to take the typing, same as TextNode's own
          // textarea does for a placed comb field. The static transparent
          // text colour lives in .slot-comb; only the live caret colour
          // (the element's own colour) needs to stay inline.
          ...(comb ? { caretColor: element.color || '#000000' } : {}),
        }}
      />
      {cells && (
        <div
          aria-hidden="true"
          className={styles['comb-overlay']}
          style={{
            left: `${box.left}%`,
            top: `${box.top}%`,
            width: `${box.width}%`,
            height: `${box.height}%`,
            fontSize: `${typography.size * scaleFactor}px`,
            '--text-pad-em': `${typography.paddingEm}em`,
          }}
        >
          <CombCells
            cells={cells}
            isRtl={direction === 'rtl'}
            showGuides={false}
            visible
            color={element.color || '#000000'}
            fontFamily={typography.family}
            fontWeight={typography.weight}
            fontStyle={typography.style}
          />
        </div>
      )}
    </>
  );
}
