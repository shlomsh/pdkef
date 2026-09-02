import { useState, useLayoutEffect, useRef, useEffect, useMemo, useId } from 'preact/hooks';
import ElementResizers from '../../ElementResizers.tsx';
import usePdfCoordinates from '../../../lib/usePdfCoordinates.js';
import { getEffectiveTextDirection } from '../../../lib/signHelpers.js';
import { resolveTypography } from '../../../editor/text/fonts.js';
import { getTextFontSupport } from '../../../editor/text/textFontSupport.js';
import { describeTextFontSupport } from '../textMessages.ts';
import FontSupportNotice from '../FontSupportNotice.tsx';
import { combLayout, isComb } from '../../../editor/text/comb.js';
import workspaceStyles from '../Workspace.module.css';
import elementStyles from '../EditorElement.module.css';


export default function TextNode({ element, isActive, isEditing, onChange, onSelect, onBeginEdit, onResizeStart, pageWidthPoints, isSpanResizing = false }: {
  element: any;
  isActive: boolean;
  isEditing: boolean;
  onChange: (changes: any) => void;
  onSelect: (...args: any[]) => void;
  onBeginEdit: (...args: any[]) => void;
  onResizeStart: (...args: any[]) => void;
  pageWidthPoints: number;
  isSpanResizing?: boolean;
}) {
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

  // The caret follows the edit session, not the selection. Two things open one:
  // starting to edit (created, double-clicked, Enter), and returning from the
  // floating toolbar - clicking A+ or a colour moves focus out of the textarea,
  // and typing has to continue where it left off afterwards.
  useEffect(() => {
    if (!isEditing || !textareaRef.current) return;
    if (document.activeElement === textareaRef.current) return;

    textareaRef.current.focus();
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
  const fontMessage = describeTextFontSupport(support);
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
  // box can never be sized against copy it isn't showing.
  const placeholder = isEditing ? 'Type your text' : 'Double-click to edit';
  // Comb: the span is explicit and the characters are placed by cell, so the box
  // no longer measures itself from the text. Only its height still does, and it
  // is always exactly one line - a comb is a single row of boxes.
  const isRtl = textDirection === 'rtl';
  const comb = isComb(element);
  // `isSpanResizing` (true for the whole grab-to-release span-handle gesture,
  // set in useElementResize.js) mounts the overlay *hidden*, so a first-ever
  // comb-creation drag has real, Preact-owned nodes to reflow from its very
  // first frame rather than only once release has caught committed state up
  // to what the drag already showed. Mounting it is all this does: everything
  // about how the box *looks* still follows `comb`, so grabbing a handle and
  // not moving changes nothing on screen, and the drag itself (text.ts's
  // writeDOM) is what reveals the cells once it has cleared the floor.
  const cells = comb || isSpanResizing ? combLayout(element, isRtl) : null;

  return (
    <>
      <div
        ref={textRef}
        className={[elementStyles['text-display'], comb && elementStyles['text-display-comb']].filter(Boolean).join(' ')}
        data-editor-text-display
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
          {(element.text || placeholder) + '\u200B'}
        </div>
        {cells && (
          <div
            key="comb"
            className={elementStyles['text-comb']}
            data-editor-text-comb
            aria-hidden="true"
            style={{
              // Mounted-but-hidden while a span drag is still under the floor:
              // text.ts's writeDOM reveals it the frame the drag makes a comb,
              // and hides it again if the drag comes back down.
              display: comb ? undefined : 'none',
              fontFamily: renderedFontFamily,
              fontWeight: typography.weight,
              fontStyle: typography.style,
              color: element.color || '#000000'
            }}
          >
            {/* Editor-only guides. They exist to be lined up against the rules
                printed on the page, and never reach the exported file. */}
            {isActive && cells.slice(1).map((cell) => (
              <span
                key={`guide-${cell.index}`}
                className={elementStyles['text-comb-guide']}
                style={{ left: `${(isRtl ? 1 - cell.index / cells.length : cell.index / cells.length) * 100}%` }}
              />
            ))}
            {cells.map((cell) => (
              <span
                key={`cell-${cell.index}`}
                className={elementStyles['text-comb-cell']}
                style={{ left: `${cell.centerFraction * 100}%` }}
              >
                {cell.char}
              </span>
            ))}
          </div>
        )}
        {/* Outside an edit session the textarea is inert: it cannot take the
            caret by click (pointer-events, via the class) or by Tab (tabIndex),
            and cannot be typed into (readOnly). That is what frees a plain click
            to select the element and Backspace to delete it, and it hands
            mousedown to the wrapper so a selected box can be dragged from
            anywhere - previously the textarea swallowed it. */}
        <textarea
          key="input"
          ref={textareaRef}
          dir={textDirection}
          rows={1}
          cols={1}
          className={`${elementStyles['text-input']}${isEditing ? '' : ` ${elementStyles['text-input-inert']}`}`}
          data-editor-text-input
          aria-invalid={needsAttention || undefined}
          aria-describedby={fontMessage ? fontDescriptionId : undefined}
          readOnly={!isEditing}
          tabIndex={isEditing ? undefined : -1}
          value={element.text}
          placeholder={placeholder}
          onInput={(e) => onChange({ text: e.currentTarget.value })}
          onFocus={onSelect}
          style={{
            textAlign: textDirection === 'rtl' ? 'right' : 'left',
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
      />}
      <ElementResizers
        // Older text fixtures predate the flat `type` discriminant. The node
        // itself is the authoritative type boundary, so preserve that input
        // compatibility while the registry remains type-driven.
        element={{ ...element, type: 'text' }}
        isActive={isActive}
        onResizeStart={onResizeStart}
      />
    </>
  );
}
