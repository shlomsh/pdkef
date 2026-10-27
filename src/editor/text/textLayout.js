import { FIELD_TEXT_INSET_EM } from '../model/signGeometry.js';
import { resolveTypography } from './fonts.js';
import { getEffectiveTextDirection, strongTextDirection } from './textDirection.js';

/**
 * How far a box on a detected form cell (`minWidth`) sets its text in from the
 * wall it is aligned to, in whatever unit the three widths share: up to
 * FIELD_TEXT_INSET_EM of the font, never more than half the free span. A tight
 * cell (a ten-digit phone number nearly filling it) gets none, as a person
 * writing in it would; a fixed inset pushed the last digit past the wall. The
 * editor (`--field-inset`) and the exporter (textPdf.ts) both call this, so
 * the two insets are one number.
 */
export function fieldTextInset(spanWidth, textWidth, fontSize) {
  const slack = spanWidth - textWidth;
  if (!(slack > 0) || !(fontSize > 0)) return 0;
  return Math.min(FIELD_TEXT_INSET_EM * fontSize, slack / 2);
}

/**
 * Which edge of its box a text element's lines sit against: an explicit
 * `textAlign`, else the start edge of the text's own direction.
 *
 * On a field-spanned box (`minWidth`), text with no letters of its own (a
 * phone number, a date) follows the FORM's direction, the seed `textDirection`
 * carries, so it sits at the right of its cell like the Hebrew answers around
 * it. Layout direction (`getEffectiveTextDirection`) stays LTR for it, since
 * digits still read left to right; only the alignment follows the form.
 */
export function getTextAlign(element) {
  if (element.textAlign) return element.textAlign;
  const seed = element.minWidth ? element.textDirection : null;
  const direction = strongTextDirection(element.text) || seed || getEffectiveTextDirection(element);
  return direction === 'rtl' ? 'right' : 'left';
}

/**
 * True when a text element's `left` is its *right* edge: RTL text with no fixed
 * span. A free RTL box anchors its right edge and grows leftward as it is
 * typed; a comb (`width`) or a field box (`minWidth`) has a span fixed by the
 * paper, so it stays left-anchored. The wrapper's CSS, the drag clamps and the
 * exporter's pen all ask this.
 */
export function textAnchorsRightEdge(element) {
  return element?.type === 'text'
    && !element.width
    && !element.minWidth
    && getEffectiveTextDirection(element) === 'rtl';
}

/**
 * A text element's on-page layout: the outer box (page-percent) and the
 * typography (CSS px, scaled from PDF points). A fill-mode slot (FieldSlot.tsx)
 * calls this on the element it will become, so its preview matches the
 * committed text instead of drifting from it.
 */
export function textElementLayout(element, scaleFactor = 1) {
  const typography = resolveTypography(element.fontFamily, element.text, element.fontWeight, element.fontStyle, element.fontSize);
  const isRtlText = textAnchorsRightEdge(element);
  return {
    box: {
      top: `${element.top}%`,
      width: element.width ? `${element.width}%` : 'auto',
      ...(element.minWidth ? { minWidth: `${element.minWidth}%` } : {}),
      height: 'auto',
      ...(isRtlText ? { right: `${100 - element.left}%` } : { left: `${element.left}%` }),
    },
    font: {
      fontSize: typography.size * scaleFactor,
      fontFamily: typography.family,
      fontWeight: typography.weight,
      fontStyle: typography.style,
      paddingEm: typography.paddingEm,
    },
    textAlign: getTextAlign(element),
    direction: getEffectiveTextDirection(element),
  };
}
