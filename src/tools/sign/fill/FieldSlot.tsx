import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import usePdfCoordinates from '../../../editor-ui/hooks/usePdfCoordinates.js';
import { textElementLayout } from '../../../lib/signHelpers.js';
import { combLayout, isComb } from '../../../editor/text/comb.js';
import CombCells from '../components/nodes/CombCells.tsx';
import { useCombCaret } from '../components/nodes/useCombCaret.ts';
import workspaceStyles from '../../../editor-ui/Workspace.module.css';
import type { TextElement } from '../../../editor/model/editorModel.ts';
import { AUTOCORRECT_OFF, type EnterKeyHint, type FillSlot } from './fillTypes.ts';
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
 * Position and typography both come from `textElementLayout` (signHelpers.js),
 * called on `elementOf(value)` - the exact element `ADD_ELEMENT` would commit -
 * the same function TextNode.tsx calls on the placed element, with the same
 * scaleFactor derived from the page's own rendered width via
 * `usePdfCoordinates`. So a slot reads identically to the text element it
 * becomes the instant it commits; nothing visibly jumps.
 *
 * Comb fields (`slot.placement.combCells`) draw their cells live, the same
 * way TextNode.tsx draws them while editing a placed comb field: the real
 * input keeps taking the typing (transparent text, no native caret - see
 * `.slot-comb`), and a `CombCells` overlay on top renders `combLayout` of
 * the input's own live value plus a caret bar of its own, at `caretIndex`
 * (the input's live `selectionStart`) - `elementOf(value)`, the same
 * `elementForSlot` call the commit uses, so the cells the slot shows are
 * exactly the cells the committed element will show. A `letter-spacing`
 * approximation was considered and
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

  // The element this slot would become right now, with whatever is typed so
  // far - the one source of truth `textElementLayout` (signHelpers.js) reads
  // for both geometry and typography, so the slot can never drift from the
  // text element it becomes on commit (elsewhere TextNode.tsx calls the same
  // function on the same element shape). comb.js's isComb/combLayout read
  // the same element too (SIGN-34's "one rule for every box" applies here).
  const element = elementOf(value);
  const layout = textElementLayout(element, scaleFactor);
  const direction = layout.direction;
  const comb = isComb(element);
  const cells = comb ? combLayout(element, direction === 'rtl') : null;
  // A field slot's element always carries a comb `width` or a cell
  // `minWidth` (placeTextOnField always sets one or the other), so `layout.box`
  // already has a real span. A free slot (nothing detected) has neither - a
  // committed free text box only gets a width once it is measured on screen
  // (TextNode's own auto-sizing measure div), which a bare `<input>` cannot
  // reproduce - so it keeps its own placement's span instead.
  // A field slot's layout.box carries height: 'auto' (textElementLayout); an
  // inline style beats the class, so drop it here and let fill.module.css's
  // .slot rule size the box instead (it must equal .text-input's own padded
  // line box, which `calc()` cannot compute in this object).
  const { height: _fieldSlotHeight, ...fieldBox } = layout.box;
  const box = slot.field ? fieldBox : { ...layout.box, width: `${slot.placement.box.width}%`, height: `${slot.placement.box.height}%` };

  const handleInput = (event: Event) => {
    setValue((event.currentTarget as HTMLInputElement).value);
  };

  // The comb caret (useCombCaret.ts): null while the input has no focus, the
  // live selectionStart while it does. The real input's own caret is hidden
  // for a comb (.slot-comb below) because it sits at the unspaced text
  // position, not the cell boundary the next character lands at.
  const { caretIndex, caretEvents, sync: syncCaret } = useCombCaret(inputRef, comb);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    onEnter();
  };

  const handleBlur = (event: FocusEvent) => {
    const text = (event.currentTarget as HTMLInputElement).value.trim();
    if (text) onCommit(text);
    caretEvents.onBlur?.();
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
        // autocorrection as focus leaves for the next field (AUTOCORRECT_OFF).
        autocorrect={AUTOCORRECT_OFF}
        spellcheck={false}
        onInput={comb ? (event) => { handleInput(event); syncCaret(); } : handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={caretEvents.onKeyUp}
        onFocus={caretEvents.onFocus}
        onClick={caretEvents.onClick}
        onSelect={caretEvents.onSelect}
        onBlur={handleBlur}
        style={{
          ...box,
          fontSize: `${layout.font.fontSize}px`,
          fontFamily: layout.font.fontFamily,
          fontWeight: layout.font.fontWeight,
          fontStyle: layout.font.fontStyle,
          '--text-pad-em': `${layout.font.paddingEm}em`,
          // The committed element's own ink; a comb's input text stays
          // transparent (.slot-comb), the overlay draws it.
          ...(comb ? {} : { color: element.color }),
        }}
      />
      {cells && (
        <div
          aria-hidden="true"
          className={styles['comb-overlay']}
          style={{
            ...box,
            fontSize: `${layout.font.fontSize}px`,
            '--text-pad-em': `${layout.font.paddingEm}em`,
          }}
        >
          <CombCells
            cells={cells}
            isRtl={direction === 'rtl'}
            showGuides={false}
            visible
            caretIndex={caretIndex}
            color={element.color || '#000000'}
            fontFamily={layout.font.fontFamily}
            fontWeight={layout.font.fontWeight}
            fontStyle={layout.font.fontStyle}
          />
        </div>
      )}
    </>
  );
}
