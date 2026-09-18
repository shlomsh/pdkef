import { useId } from 'preact/hooks';
import { PilcrowLeft, PilcrowRight, TextAlignCenter, TextAlignEnd, TextAlignStart } from 'lucide-preact';
import ColorPickerMenu from './ColorPickerMenu.tsx';
import FontPickerMenu from './FontPickerMenu.tsx';
import ThicknessPickerMenu from './ThicknessPickerMenu.tsx';
import { getEffectiveTextDirection, getTextAlign } from '../lib/signHelpers.js';
import { resolveTypography } from '../editor/text/fonts.js';
import { combCellCount, isComb, textForCoverage } from '../editor/text/comb.js';
import { MAX_COMB_CELLS } from '../constants/signGeometry.js';
import { formatDate, isDateFormatId, nextDateFormatId } from '../editor/text/dateFormat.ts';
import { englishSignMessages, formatMessage, type SignMessages } from '../i18n/toolMessages';
import styles from './EditorControls.module.css';

export default function ElementToolbar({
  element,
  onChange,
  onPreviewFont,
  onPreviewFontEnd,
  onClone,
  onDelete,
  messages,
}: {
  element: any;
  onChange: (changes: any) => void;
  onPreviewFont?: (fontFamily: string) => void;
  onPreviewFontEnd?: () => void;
  onClone: (...args: any[]) => void;
  onDelete: (...args: any[]) => void;
  /** LOC-16 stage 2-5: optional and English-default, same shape as
   * SignToolbar.tsx's `messages` prop. Shared with Redact (RedactBox.tsx),
   * which never passes it, so its English rendering is unaffected. */
  messages?: Partial<SignMessages>;
}) {
  const t: SignMessages = { ...englishSignMessages, ...messages };
  // A font-size change is the "done aligning, back to normal typing" signal
  // that turns comb off (see useElementResize.js for the drag-gesture side of
  // the same rule) - width is what makes a text element a comb at all (see
  // comb.js's isComb), so clearing it here is what actually turns it off.
  const setFontSize = (fontSize: number) => onChange(isComb(element) ? { fontSize, width: 0 } : { fontSize });
  const textDirection = element.type === 'text' ? getEffectiveTextDirection(element) : 'ltr';
  // Only a box spanning a detected form cell has room to align in; a free box
  // hugs its text and a comb places one character per cell.
  const canAlign = element.type === 'text' && !!element.minWidth && !isComb(element);
  const textAlign: 'left' | 'center' | 'right' = canAlign ? getTextAlign(element) : 'left';
  const NEXT_ALIGN = { left: 'center', center: 'right', right: 'left' } as const;
  const alignTitle = { left: t.alignLeftTitle, center: t.alignCenterTitle, right: t.alignRightTitle }[textAlign];
  // element.type is the geometry discriminator directly (no shape/shapeType wrapper).
  const actualType = element.type;
  const isLine = actualType === 'line';
  // Gates the shape-type-switcher toolbar (ellipse / rectangle / line only — not whiteout,
  // which has its own separate tool and toolbar section).
  const isDrawnShape = actualType === 'ellipse' || actualType === 'rectangle';
  const buttonClass = (active = false, danger = false) => [styles['element-button'], active && styles.active, danger && styles['element-button-danger']].filter(Boolean).join(' ');

  // SIGN-08: the same typography descriptor TextNode renders with and
  // text.ts exports with (fonts.js) - family, and which weight/style the
  // resolved family actually has a real file for, computed once instead of
  // three call sites separately resolving substitution then hasRealFace.
  const typography = element.type === 'text'
    ? resolveTypography(element.fontFamily, element.text, element.fontWeight, element.fontStyle, element.fontSize)
    : null;
  const currentWeight = typography?.requestedWeight ?? 'normal';
  const currentStyle = typography?.requestedStyle ?? 'normal';
  const effectiveFamily = typography?.family;
  const canBold = element.type === 'text' && !!typography?.canBold;
  const canItalic = element.type === 'text' && !!typography?.canItalic;
  // W5 (docs/wysiwyg-text-architecture.md §3.4): with only Regular declared,
  // the browser synthesises Bold/Italic on screen while the export 404s and
  // silently falls back to Regular - bold on screen, upright in the download.
  // Blocking the request here is what closes that gap; loadCustomFont's
  // fallback stays as the runtime safety net, not the first line of defense.
  const boldReasonId = useId();
  const italicReasonId = useId();

  // Edge case: a saved draft (drafts persist 14 days) or a family switch can
  // leave fontWeight/fontStyle 'bold'/'italic' on a family with no real face
  // for it - pre-W5 elements, or the user toggled Bold then picked a
  // Regular-only display face. Deliberately not rewritten here: the element
  // is left as it was saved (no silent data change on the user's behalf,
  // and the underlying value still matters if they switch back to a family
  // that does have the face). What changes is only the toolbar's own
  // display - a disabled control must never also read as pressed, so
  // "active" is gated on the face actually existing, not on the stored flag
  // alone.
  const boldActive = currentWeight === 'bold' && canBold;
  const italicActive = currentStyle === 'italic' && canItalic;

  // A box is "date-flavored" exactly when both fields are set (editorModel.ts's
  // dateFormatId comment) - the anchor day (`dateValue`) is what a format
  // switch reformats from, never "today" again, so a draft reopened days
  // later doesn't drift.
  const dateFormatId = element.type === 'text' && isDateFormatId(element.dateFormatId) ? element.dateFormatId : null;
  const isDateField = dateFormatId !== null && typeof element.dateValue === 'string';
  const cycleDateFormat = () => {
    if (!isDateField || !dateFormatId) return;
    const nextFormatId = nextDateFormatId(dateFormatId);
    onChange({ dateFormatId: nextFormatId, text: formatDate(element.dateValue, nextFormatId) });
  };

  return (
    <>
      {element.type === 'text' && (
        <>
          <FontPickerMenu
            value={effectiveFamily}
            text={element.text}
            drawnText={textForCoverage(element)}
            fontWeight={currentWeight}
            fontStyle={currentStyle}
            // A menu selection is an explicit stylistic choice. TextNode may
            // choose a compatible family for a fresh default field, but it
            // must not replace a family the person deliberately picked.
            onChange={(fontFamily: string) => onChange({ fontFamily, fontFamilyExplicit: true })}
            onPreview={onPreviewFont}
            onPreviewEnd={onPreviewFontEnd}
          />
          <div className={styles.divider} />
          <button
            type="button"
            className={buttonClass()}
            onClick={() => setFontSize(Math.max(6, (element.fontSize || 12) - 1))}
            title={t.decreaseFontSizeTitle}
          >
            A-
          </button>
          <button
            type="button"
            className={buttonClass()}
            onClick={() => setFontSize(Math.min(72, (element.fontSize || 12) + 1))}
            title={t.increaseFontSizeTitle}
          >
            A+
          </button>
          <div className={styles.divider} />
          <button
            type="button"
            className={buttonClass(boldActive)}
            disabled={!canBold}
            onClick={() => onChange({ fontWeight: currentWeight === 'bold' ? 'normal' : 'bold' })}
            title={canBold ? t.boldLabel : formatMessage(t.boldUnavailableTemplate, { family: effectiveFamily ?? '' })}
            aria-describedby={canBold ? undefined : boldReasonId}
          >
            <b>B</b>
            {!canBold && <span id={boldReasonId} className="sr-only">{formatMessage(t.boldUnavailableTemplate, { family: effectiveFamily ?? '' })}</span>}
          </button>
          <button
            type="button"
            className={buttonClass(italicActive)}
            disabled={!canItalic}
            onClick={() => onChange({ fontStyle: currentStyle === 'italic' ? 'normal' : 'italic' })}
            title={canItalic ? t.italicLabel : formatMessage(t.italicUnavailableTemplate, { family: effectiveFamily ?? '' })}
            aria-describedby={canItalic ? undefined : italicReasonId}
          >
            <i>I</i>
            {!canItalic && <span id={italicReasonId} className="sr-only">{formatMessage(t.italicUnavailableTemplate, { family: effectiveFamily ?? '' })}</span>}
          </button>
          <div className={styles.divider} />
          <button
            type="button"
            // This describes the detected writing direction; it is not a
            // selected formatting option. In particular, RTL text should not
            // make the control look persistently pressed for Hebrew/Arabic
            // users.
            className={buttonClass()}
            onClick={() => onChange({ textDirection: textDirection === 'rtl' ? 'ltr' : 'rtl' })}
            title={textDirection === 'rtl' ? t.rtlTextTitle : t.ltrTextTitle}
            aria-label={textDirection === 'rtl' ? t.directionRtlAria : t.directionLtrAria}
          >
            {textDirection === 'rtl' ? (
              <PilcrowLeft size={14} strokeWidth={2.5} />
            ) : (
              <PilcrowRight size={14} strokeWidth={2.5} />
            )}
          </button>
          {canAlign && (
            <button
              type="button"
              className={buttonClass()}
              onClick={() => onChange({ textAlign: NEXT_ALIGN[textAlign] })}
              title={alignTitle}
              aria-label={alignTitle}
            >
              {textAlign === 'center' && <TextAlignCenter size={14} strokeWidth={2.5} />}
              {textAlign === 'left' && <TextAlignStart size={14} strokeWidth={2.5} />}
              {textAlign === 'right' && <TextAlignEnd size={14} strokeWidth={2.5} />}
            </button>
          )}
          {isDateField && (
            <>
              <div className={styles.divider} />
              <button
                type="button"
                className={buttonClass()}
                onClick={cycleDateFormat}
                title={formatMessage(t.dateFormatCycleTitleTemplate, { example: element.text })}
              >
                {element.text}
              </button>
            </>
          )}
          {isComb(element) && (
            <>
              <div className={styles.divider} />
              <button
                type="button"
                className={buttonClass()}
                onClick={() => onChange({ combCells: Math.max(1, combCellCount(element) - 1) })}
                title={t.oneBoxFewerTitle}
              >
                −
              </button>
              <button
                type="button"
                className={buttonClass()}
                // Absent combCells means the count follows the text, which is
                // right whenever the field has one box per character. Clicking
                // the readout gives that back after a manual override.
                onClick={() => onChange({ combCells: 0 })}
                title={element.combCells ? t.boxesFixedTitle : t.boxesFollowingTitle}
              >
                {combCellCount(element)}
              </button>
              <button
                type="button"
                className={buttonClass()}
                onClick={() => onChange({ combCells: Math.min(MAX_COMB_CELLS, combCellCount(element) + 1) })}
                title={t.oneBoxMoreTitle}
              >
                +
              </button>
            </>
          )}
          <div className={styles.divider} />
          <ColorPickerMenu
            value={element.color}
            onChange={(color: string) => onChange({ color })}
            title={t.textColorTitle}
            defaultColor="#000000"
          />
          <div className={styles.divider} />
        </>
      )}
      {element.type === 'symbol' && (
        <>
          <button
            type="button"
            className={buttonClass((element.mark || 'check') === 'check')}
            onClick={() => onChange({ mark: 'check' })}
            title={t.checkMarkTitle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button
            type="button"
            className={buttonClass(element.mark === 'x')}
            onClick={() => onChange({ mark: 'x' })}
            title={t.xMarkTitle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
              <line x1="5" y1="5" x2="19" y2="19" />
              <line x1="19" y1="5" x2="5" y2="19" />
            </svg>
          </button>
          <button
            type="button"
            className={buttonClass(element.mark === 'dot')}
            onClick={() => onChange({ mark: 'dot' })}
            title={t.dotMarkTitle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="12" cy="12" r="7" />
            </svg>
          </button>
          <div className={styles.divider} />
          <ColorPickerMenu
            value={element.color}
            onChange={(color: string) => onChange({ color })}
            title={t.checkboxColorTitle}
            defaultColor="#1463ff"
          />
          <div className={styles.divider} />
        </>
      )}
      {(isDrawnShape || isLine) && (
        <>
          <button
            type="button"
            className={buttonClass(actualType === 'ellipse')}
            onClick={() => {
              if (actualType === 'line') {
                onChange({ type: 'ellipse', left: Math.min(element.x1, element.x2), top: Math.min(element.y1, element.y2), width: Math.max(Math.abs(element.x2 - element.x1), 4), height: Math.max(Math.abs(element.y2 - element.y1), 4) });
              } else {
                onChange({ type: 'ellipse' });
              }
            }}
            title={t.ellipseLabel}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <ellipse cx="12" cy="12" rx="10" ry="7" />
            </svg>
          </button>
          <button
            type="button"
            className={buttonClass(actualType === 'rectangle')}
            onClick={() => {
              if (actualType === 'line') {
                onChange({ type: 'rectangle', left: Math.min(element.x1, element.x2), top: Math.min(element.y1, element.y2), width: Math.max(Math.abs(element.x2 - element.x1), 4), height: Math.max(Math.abs(element.y2 - element.y1), 4) });
              } else {
                onChange({ type: 'rectangle' });
              }
            }}
            title={t.rectangleLabel}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="3" y="6" width="18" height="12" rx="2" />
            </svg>
          </button>
          <button
            type="button"
            className={buttonClass(actualType === 'line')}
            onClick={() => {
              if (actualType !== 'line') {
                onChange({ type: 'line', x1: element.left, y1: element.top + (element.height || 6)/2, x2: element.left + (element.width || 12), y2: element.top + (element.height || 6)/2 });
              }
            }}
            title={t.lineLabel}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="4" y1="20" x2="20" y2="4" />
            </svg>
          </button>
          <div className={styles.divider} />
          <ThicknessPickerMenu
            value={element.strokeWidth}
            onChange={(strokeWidth: number) => onChange({ strokeWidth })}
            title={t.lineThicknessTitle}
          />
          <ColorPickerMenu
            value={element.color}
            onChange={(color: string) => onChange({ color })}
            title={t.shapeColorTitle}
            defaultColor="#1463ff"
          />
          <div className={styles.divider} />
        </>
      )}
      {element.type === 'signature' && (
        <>
          <ColorPickerMenu
            value={element.color}
            onChange={(color: string) => onChange({ color })}
            title={t.signatureColorTitle}
            defaultColor="#000000"
          />
          <div className={styles.divider} />
        </>
      )}
      {element.type === 'whiteout' && (
        <>
          <ColorPickerMenu
            value={element.color}
            onChange={(color: string) => onChange({ color })}
            title={t.whiteoutColorTitle}
            defaultColor="#ffffff"
          />
          <div className={styles.divider} />
        </>
      )}
      {/* Redact's blackout and blur elements (element.type === 'blackout' | 'blur')
          intentionally match no branch above: they have no per-element colour
          (only whiteout does), so they fall straight through to the shared
          duplicate + delete pair below with no divider in front of it - the
          minimum shared chrome every redaction type now uses on selection,
          instead of RedactBox's old separate inline red delete button. */}
      <button
        type="button"
        className={buttonClass()}
        onClick={() => {
          const newId = `el-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
          onClone({
            ...element,
            id: newId,
            left: Math.min(90, element.left + 4),
            top: Math.min(90, element.top + 4)
          });
        }}
        title={t.duplicateElementTitle}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <button
        type="button"
        className={buttonClass(false, true)}
        onClick={onDelete}
        title={t.deleteElementTitle}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </>
  );
}
