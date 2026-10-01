import { FIELD_TEXT_INSET_EM } from '../constants/signGeometry.js';
import { resolveTypography } from '../editor/text/fonts.js';

// "First strong character" (UAX #9): a run's direction comes from its first
// character with an inherent one, and every letter has one. A Latin-and-
// Hebrew-only list leaves other scripts unmatched, and the box would silently
// inherit the direction of whatever was edited before it.
const STRONG_DIRECTION_CHAR = /\p{L}/u;
// Includes Arabic Extended-A/B (U+08A0 and friends) and the presentation forms.
const RTL_CHAR = /[\u0591-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
// Digits and the punctuation of an ID number or date (327-69-8221, 27/05/2008)
// have no inherent direction; without this they would inherit the previous
// element's, landing right-anchored after a Hebrew field.
const NEUTRAL_ONLY = /^[0-9\s/\-.:,()+]*$/;

/** The direction of the text's first letter, or null when it has none. */
export function strongTextDirection(text) {
  const firstStrong = (text || '').match(STRONG_DIRECTION_CHAR)?.[0];
  if (!firstStrong) return null;
  return RTL_CHAR.test(firstStrong) ? 'rtl' : 'ltr';
}

export function detectTextDirection(text) {
  const value = text || '';
  return strongTextDirection(value) || (value && NEUTRAL_ONLY.test(value) ? 'ltr' : null);
}

/**
 * The direction a whole page of printed text reads in: 'rtl' when more of its
 * letters are Hebrew/Arabic than anything else. Counts letters, not runs,
 * because a Hebrew form carries plenty of Latin runs (a URL, a form number).
 * Digits and punctuation vote for nobody. This is the document's direction,
 * not the UI locale's.
 */
export function dominantTextDirection(strings) {
  let rtl = 0;
  let ltr = 0;
  for (const value of strings) {
    for (const char of value || '') {
      if (!STRONG_DIRECTION_CHAR.test(char)) continue;
      if (RTL_CHAR.test(char)) rtl += 1;
      else ltr += 1;
    }
  }
  return rtl > ltr ? 'rtl' : 'ltr';
}

export function getEffectiveTextDirection(element) {
  // Typed letters decide first. Until then every box, free or on a field,
  // starts in the direction it was created with (SIGN-33, SIGN-34).
  return detectTextDirection(element.text) || element.textDirection || 'ltr';
}

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

export function hexToRgbFractions(hex, fallback = '#000000') {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || fallback);
  const r = result ? parseInt(result[1], 16) / 255 : 0;
  const g = result ? parseInt(result[2], 16) / 255 : 0;
  const b = result ? parseInt(result[3], 16) / 255 : 0;
  return { r, g, b };
}

export function tintImageDataUrl(dataUrl, hexColor) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = hexColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
