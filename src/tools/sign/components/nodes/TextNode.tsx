import { useState, useLayoutEffect, useRef, useEffect, useMemo, useId } from 'preact/hooks';
import ElementResizers from '../../../../editor-ui/ElementResizers.tsx';
import useCoarsePointer from '../../useCoarsePointer.ts';
import usePdfCoordinates from '../../../../editor-ui/hooks/usePdfCoordinates.js';
import { fieldTextInset, getEffectiveTextDirection, getTextAlign, strongTextDirection } from '../../../../lib/signHelpers.js';
import { resolveFontSubstitution, resolveTypography } from '../../../../editor/text/fonts.js';
import { getTextFontSupport } from '../../../../editor/text/textFontSupport.js';
import { describeTextFontSupport } from '../textMessages.ts';
import FontSupportNotice from '../FontSupportNotice.tsx';
import { combLayout, isComb } from '../../../../editor/text/comb.js';
import CombCells from './CombCells.tsx';
import { englishSignMessages, type SignMessages } from '../../../../i18n/toolMessages';
import { useTextFill } from '../../fill/FillContext.tsx';
import workspaceStyles from '../../../../editor-ui/Workspace.module.css';
import elementStyles from '../../../../editor-ui/EditorElement.module.css';
import type { TextElement } from '../../../../editor/model/editorModel.ts';
import type { ElementNodeChange, NodeResizeStart } from '../nodeProps.ts';

export default function TextNode({ element, isActive, isEditing, onChange, onSelect, onBeginEdit, onResizeStart, pageWidthPoints, isSpanResizing = false, messages }: {
  element: TextElement;
  isActive: boolean;
  isEditing: boolean;
  onChange: ElementNodeChange<TextElement>;
  onSelect: (event: Event) => void;
  onBeginEdit: () => void;
  onResizeStart: NodeResizeStart;
  pageWidthPoints: number;
  isSpanResizing?: boolean;
  /** LOC-16 stage 2-5: optional and English-default, same shape as
   * SignToolbar.tsx's `messages` prop. */
  messages?: Partial<SignMessages>;
}) {
  const t: SignMessages = { ...englishSignMessages, ...messages };
  const isCoarsePointer = useCoarsePointer();
  // SNG-15: null outside fill mode (docs/sign-fill-mode.md, "the text
  // element's fill props travel by context"). FillLayer supplies it per
  // element; production never provides TextFillContext, so this is always
  // null there and every branch below that reads it is a no-op.
  const fill = useTextFill();
  const [scaleFactor, setScaleFactor] = useState(1);
  const { getScaleFactor } = usePdfCoordinates();
  const textRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const pageWrapper = textRef.current?.closest(`.${workspaceStyles['page-wrapper']}`) || null;
    if (!pageWrapper) return;
    const updateScale = () => {
      setScaleFactor(getScaleFactor(pageWrapper, pageWidthPoints));
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(pageWrapper);
    return () => observer.disconnect();
  }, [pageWidthPoints]);

  // Reported live, twice, on a short single-line field: a text box's corner
  // (font size, MOBI-12) and side (comb span) resize handles overlap into a
  // blob. Merely shrinking the handles was not enough on its own - two
  // handles a couple of px apart still touch even at their smallest legible
  // size - so `EditorElement.module.css` also pushes the corner handles
  // further from the box's vertical centre than their own edge would put
  // them, whenever the box is too short for that centre to already be far
  // enough away. `--half-height` is the one raw measurement that formula
  // needs; the shrink-and-separate arithmetic itself lives in CSS (`clamp()`
  // and `max()`), not here - see that file's comment on `[data-editor-text]
  // .resizer` for the exact formula. Measuring `textRef` directly (not
  // deriving a height from `textFontSize` below) is deliberately exact
  // rather than approximate: padding, line-height and multi-line wrapping
  // all affect the real box height, and a formula guessing at them would
  // drift from what is actually on screen. Same ResizeObserver pattern as
  // the `scaleFactor` effect just above - ordinary layout measurement, not
  // the golden-rule gesture path (editor.md): nothing here writes back to
  // `onChange`/state that a draft persists, only a local, cosmetic value.
  const [halfHeight, setHalfHeight] = useState(0);
  useLayoutEffect(() => {
    const node = textRef.current;
    if (!node) return;
    const updateHeight = () => setHalfHeight(node.getBoundingClientRect().height / 2);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The caret follows the edit session, not the selection. Two things open one:
  // starting to edit (created, double-clicked, Enter), and returning from the
  // floating toolbar - clicking A+ or a colour moves focus out of the textarea,
  // and typing has to continue where it left off afterwards.
  useEffect(() => {
    if (!isEditing || !textareaRef.current) return;
    if (document.activeElement === textareaRef.current) return;

    // `preventScroll`, because the field move has already decided where this
    // element should sit (bringFieldIntoView in useFieldNavigation.ts centres it
    // on the visual viewport). A focus that scrolls too adds a second, browser-
    // driven jump on top of ours, which on iOS is the one that yanks the page to
    // put the caret above the keyboard. One deliberate scroll reads as a move;
    // two read as a glitch: measured 2026-09-22 with this flag removed, a Next
    // press from a page scrolled 929px away from the destination travelled
    // 1367px - an instant 1400 -> 252 and then a smooth glide back down to 471,
    // which is the reported "all the way up to the toolbar and then all the way
    // down to the next element" exactly. `field-move-scroll.spec.js`'s second
    // test is what holds it; that is the number it fails with.
    //
    // `setSelectionRange` below needs no such treatment, and an earlier attempt
    // to snapshot and restore the scroll position around the pair has been
    // removed: it was dead code. Measured on a bare page with a textarea 2000px
    // down, in both WebKit and Chromium at an iPhone 15 viewport, neither
    // `focus({ preventScroll: true })` nor `setSelectionRange` moved the page
    // by a pixel.
    textareaRef.current.focus({ preventScroll: true });
    const len = textareaRef.current.value.length;
    textareaRef.current.setSelectionRange(len, len);
  }, [
    isEditing,
    element.fontFamily,
    element.fontSize,
    element.color,
    element.fontWeight,
    element.fontStyle,
    element.textDirection
  ]);

  const textDirection = getEffectiveTextDirection(element);
  // SIGN-08: the one typography descriptor shared with the exporter
  // (registry/text.ts) and the toolbar (ElementToolbar.tsx) - face, the
  // weight/style actually rendered (clamped to a real bundled file, never
  // the raw element flags: a stale draft or family switch can carry
  // `fontWeight: 'bold'` with no real bold face, and rendering that flag
  // directly used to paint a browser-synthesized bold on screen while the
  // export silently embedded Regular underneath it), and size.
  const typography = useMemo(() => resolveTypography(element.fontFamily, element.text, element.fontWeight, element.fontStyle, element.fontSize), [
    element.fontFamily, element.text, element.fontWeight, element.fontStyle, element.fontSize,
  ]);
  const textFontSize = typography.size * scaleFactor;
  // Render the family the exporter will embed, not the one that was picked, so
  // the browser never quietly patches in a system font for glyphs the chosen
  // file lacks — that fallback is what a PDF cannot reproduce.
  const support = useMemo(() => getTextFontSupport({ ...element, type: 'text' }), [
    element.text, element.fontFamily, element.fontWeight, element.fontStyle, element.width, element.combCells,
  ]);
  // Same value as support.family (both resolve through fonts.js against the
  // same inputs) - read from the shared descriptor so there is one source for
  // what actually renders, not two calls that merely happen to agree today.
  const renderedFontFamily = typography.family;
  const fontMessage = describeTextFontSupport(support, t);
  const fontDescriptionId = useId();
  const needsAttention = support.status === 'incompatible';
  // Some bundled faces (script/handwriting fonts, and Heebo among the plain
  // ones) have a real ascent+descent bigger than DEFAULT_LINE_HEIGHT_EM, so
  // they paint outside the CSS line box - and the textarea painting them
  // clips to its own box regardless of `overflow`. --text-pad-em gives each
  // font exactly the padding its own metrics need (see fonts.js) instead of
  // a flat padding tight enough to clip Gveret Levin's loops or Heebo's Hebrew.
  const textPaddingEm = typography.paddingEm;
  // Shown in the empty box, and measured to size it. One string for both, so the
  // box can never be sized against copy it isn't showing - except in a box on a
  // detected form cell, which is sized by the cell: measuring the placeholder
  // there pushed an empty box past a cell narrower than the copy and across the
  // next field (form 101's employer phone cell, live report). The placeholder
  // is clipped at the cell's edge instead, and typed text still grows the box.
  // An empty box that is not open names the gesture that opens it - and on a
  // phone that is a single tap (MOBI-21), never a double-click: a double-tap is
  // the browser's zoom, so "Double-click to edit" told touch users to make the
  // one gesture that cannot work there.
  const placeholder = isEditing
    ? t.typeYourTextPlaceholder
    : (isCoarsePointer ? t.tapToEditPlaceholder : t.doubleClickToEditPlaceholder);
  // Comb: the span is explicit and the characters are placed by cell, so the box
  // no longer measures itself from the text. Only its height still does, and it
  // is always exactly one line - a comb is a single row of boxes.
  const isRtl = textDirection === 'rtl';
  const comb = isComb(element);
  const spannedField = !comb && !!element.minWidth;
  // That clipped placeholder takes its own script's direction, not the box's,
  // so it loses its end rather than its start: in an RTL box the English copy
  // overflowed leftward and a narrow cell showed "ype your text". Direction,
  // not just alignment, because overflowing text ignores `text-align`. The
  // first typed character hands both back to the box.
  const placeholderDirection = spannedField && !element.text ? strongTextDirection(placeholder) : null;
  const textAlign = placeholderDirection
    ? (placeholderDirection === 'rtl' ? 'right' : 'left')
    : getTextAlign(element);
  const handleInput = (event: Event) => {
    const text = (event.currentTarget as HTMLTextAreaElement).value;
    // A new text box starts with the app's neutral default, not a meaningful
    // typographic decision. Let its first real content select a family that
    // can be represented, so typing Hebrew (or another supported script) is
    // uninterrupted. A family selected through the menu is deliberately
    // different: retain it and let the existing support notice explain any
    // automatic rendering fallback.
    if (element.fontFamilyExplicit === false) {
      const { family } = resolveFontSubstitution(
        element.fontFamily,
        text,
        element.fontWeight || 'normal',
        element.fontStyle || 'normal',
      );
      if (family !== element.fontFamily) {
        onChange({ text, fontFamily: family });
        return;
      }
    }
    onChange({ text });
  };
  // SNG-15: the platform's own next/previous do the hopping (docs/sign-fill-mode.md).
  // Only wired when `fill` is set (see the textarea below), so this is a no-op
  // outside fill mode; the `fill` guard inside is defence in depth, not load-bearing.
  const handleFillEnterKey = (event: KeyboardEvent) => {
    if (!fill || event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    fill.onEnter();
  };
  // `isSpanResizing` (true for the whole grab-to-release span-handle gesture,
  // set in useElementResize.js) mounts the overlay *hidden*, so a first-ever
  // comb-creation drag has real, Preact-owned nodes to reflow from its very
  // first frame rather than only once release has caught committed state up
  // to what the drag already showed. Mounting it is all this does: everything
  // about how the box *looks* still follows `comb`, so grabbing a handle and
  // not moving changes nothing on screen, and the drag itself (text.ts's
  // writeDOM) is what reveals the cells once it has cleared the floor.
  const cells = comb || isSpanResizing ? combLayout(element, isRtl) : null;

  // A box on a detected cell keeps its text off the wall only as far as the
  // cell has room (`fieldTextInset`, which the exporter calls with the same
  // widths in points). The measure is the text's own width, unpadded; the
  // display is the box, at least the cell wide. Written straight to the node
  // after layout, like any cosmetic measurement here - never through state.
  useLayoutEffect(() => {
    const display = textRef.current;
    if (!display) return;
    if (!spannedField) {
      display.style.removeProperty('--field-inset');
      return;
    }
    const measure = display.querySelector<HTMLElement>('[data-text-part="measure"]');
    const textWidth = measure ? measure.getBoundingClientRect().width : 0;
    const inset = fieldTextInset(display.getBoundingClientRect().width, textWidth, textFontSize);
    display.style.setProperty('--field-inset', `${inset}px`);
  });

  return (
    <>
      <div
        ref={textRef}
        className={elementStyles['text-display']}
        data-editor-text-display
        data-text-part="display"
        data-comb={comb ? 'on' : undefined}
        data-span={spannedField ? 'field' : undefined}
        style={{ fontSize: `${textFontSize}px`, '--text-pad-em': `${textPaddingEm}em` }}
        onDblClick={onBeginEdit}
      >
        {/* Explicit keys on all three children: the comb div between them is
            conditional, and without a key Preact matches children by index,
            not identity - mounting it would shift the textarea from index 1 to
            index 2, read as "different element at this slot", and remount it,
            dropping the ref and the caret mid-edit. */}
        <div
          key="measure"
          className={elementStyles['text-measure']}
          data-editor-text-measure
          data-text-part="measure"
          dir={textDirection}
          style={{
            fontSize: `${textFontSize}px`,
            fontFamily: renderedFontFamily,
            fontWeight: typography.weight,
            fontStyle: typography.style
          }}
        >
          {/* Kept measuring the real text even in comb layout, where the span
              is explicit and nothing is measured from it. It costs nothing
              (the box's width is pinned, the measure is hidden and clipped),
              and it means the intrinsic width the box would have as plain text
              is always there to fall back to - which is exactly what a
              span-handle drag paints the moment it crosses back below the comb
              floor, without waiting for a re-render to put the text back. */}
          {(element.text || (spannedField ? '' : placeholder)) + '\u200B'}
        </div>
        {cells && (
          // Mounted-but-hidden while a span drag is still under the floor:
          // text.ts's writeDOM reveals it the frame the drag makes a comb,
          // and hides it again if the drag comes back down.
          <CombCells
            key="comb"
            cells={cells}
            isRtl={isRtl}
            showGuides={isActive}
            visible={comb}
            color={element.color || '#000000'}
            fontFamily={renderedFontFamily}
            fontWeight={typography.weight}
            fontStyle={typography.style}
          />
        )}
        {/* Outside an edit session the textarea is inert: it cannot take the
            caret by click (pointer-events, via the class) or by Tab (tabIndex),
            and cannot be typed into (readOnly). That is what frees a plain click
            to select the element and Backspace to delete it, and it hands
            mousedown to the wrapper so a selected box can be dragged from
            anywhere - previously the textarea swallowed it.

            SNG-15: with `fill` set, none of that applies - this is a real fill
            input (docs/sign-fill-mode.md), focusable and writable with no edit
            session open, so iOS's own keyboard arrows can stop on it and typing
            works before anything is "selected". `onInput` below is already
            unconditional, so once the field stops being read-only/inert,
            typing reaches `onChange` on its own - nothing else to wire. Its
            focus does not call `onSelect`: `useFillFocus` drives selection and
            editing in fill mode from the DOM focus event itself. */}
        <textarea
          key="input"
          ref={textareaRef}
          dir={placeholderDirection ?? textDirection}
          rows={1}
          cols={1}
          className={`${elementStyles['text-input']}${fill ? ` ${elementStyles['text-input-fill']}` : (isEditing ? '' : ` ${elementStyles['text-input-inert']}`)}`}
          data-editor-text-input
          data-text-part="input"
          data-fill-input={fill ? '' : undefined}
          data-fill-key={fill ? fill.fillKey : undefined}
          enterkeyhint={fill ? fill.enterKeyHint : undefined}
          // Fill mode moves focus on every hop, and iOS applies a pending autocorrection
          // as focus leaves: a name would be "corrected" into a word (SNG-15, iOS 26).
          autocorrect={fill ? 'off' : undefined}
          aria-invalid={needsAttention || undefined}
          aria-describedby={fontMessage ? fontDescriptionId : undefined}
          readOnly={fill ? false : !isEditing}
          tabIndex={fill ? 0 : (isEditing ? undefined : -1)}
          value={element.text}
          placeholder={placeholder}
          onInput={handleInput}
          onFocus={fill ? undefined : onSelect}
          onKeyDown={fill ? handleFillEnterKey : undefined}
          style={{
            textAlign,
            fontSize: `${textFontSize}px`,
            fontFamily: renderedFontFamily,
            fontWeight: typography.weight,
            fontStyle: typography.style,
            // In comb layout the cells above are what you see; the textarea
            // stays underneath purely to take the typing, so only its caret
            // shows through.
            color: comb ? 'transparent' : (element.color || '#000000'),
            ...(comb ? { caretColor: element.color || '#000000' } : {})
          }}
        />
      </div>
      {/* Mounted before text changes so assistive technology announces updates.
          Only the selected box speaks; inactive problems retain a local badge. */}
      <span id={fontDescriptionId} className="sr-only" role={isActive ? 'status' : undefined} aria-live={isActive ? 'polite' : 'off'}>
        {fontMessage}
      </span>
      {fontMessage && (isActive || needsAttention) && <FontSupportNotice
        reference={textRef}
        message={fontMessage}
        needsAttention={needsAttention}
        isActive={isActive}
        onEdit={onBeginEdit}
        direction={textDirection}
        messages={messages}
      />}
      <ElementResizers
        // Older text fixtures predate the flat `type` discriminant. The node
        // itself is the authoritative type boundary, so preserve that input
        // compatibility while the registry remains type-driven.
        element={{ ...element, type: 'text' }}
        // SNG-15: shown exactly as production shows them, fill mode or not -
        // parity with production's own handles is the product goal
        // (docs/sign-fill-mode.md). The only fill-mode difference kept
        // anywhere in this element is native focus on the textarea, which
        // DraggableWrapper.tsx owns.
        isActive={isActive}
        onResizeStart={onResizeStart}
        messages={messages}
        style={{ '--half-height': `${halfHeight}px` }}
      />
    </>
  );
}
