import { FIELD_TEXT_INSET_EM } from '../constants/signGeometry.js';
import { resolveTypography } from '../editor/text/fonts.js';

// "First strong character", per UAX #9: a run's direction comes from its first
// character that has an inherent one, and *every* letter has one - not just the
// Latin and Hebrew/Arabic ranges this used to list. Devanagari, Thai, Cyrillic,
// Greek and CJK were all missing, so they matched nothing here, detection
// returned null, and the element silently inherited the direction of whatever
// was edited before it. Typing Hebrew and then Devanagari left the new box
// right-anchored, right-aligned and the RTL toggle lit up for no visible reason.
const STRONG_DIRECTION_CHAR = /\p{L}/u;
// Includes Arabic Extended-A/B as well as the Hebrew/Arabic presentation
// forms. The former were missing from the original range, so a letter such as
// U+08A0 was incorrectly treated as LTR.
const RTL_CHAR = /[\u0591-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
// Digits and the punctuation an ID number or date is made of (327-69-8221,
// 27/05/2008). None of it has an inherent direction, so without this a field
// like that would silently inherit whatever direction the *previous* element
// on the page happened to be \u2014 e.g. always landing right-anchored and
// right-aligned after a Hebrew field, even though nothing about "27/05/2008"
// is Hebrew.
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
 * The direction a whole page of printed text reads in, from every text run
 * pdf.js reports on it: 'rtl' when more of its letters are Hebrew/Arabic than
 * anything else, 'ltr' otherwise. Counts letters rather than runs because a
 * Hebrew form still carries plenty of Latin - a URL, "Email", a form number -
 * and each of those is a run of its own. Digits and punctuation vote for
 * nobody, the same as in detectTextDirection. This is the document's own
 * direction, so it can differ from the UI locale: a Hebrew form opened on the
 * English edition still reads right to left.
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
  // Typed letters decide first. Until then, every box - free or on a field -
  // starts in the direction it was created with: the document's carried
  // direction (SIGN-33), or for a field with nothing carried yet, the page's
  // printed direction. One rule for every box (SIGN-34, Shlomi 2026-09-26),
  // replacing an older special case that forced an empty FREE box to LTR.
  return detectTextDirection(element.text) || element.textDirection || 'ltr';
}

/**
 * How far a box on a detected form cell (`minWidth`) sets its text in from
 * the wall it is aligned to, in whatever unit the three widths share: up to
 * FIELD_TEXT_INSET_EM of the font, never more than half the span the text
 * leaves free. A roomy cell gets its air, and a tight one - form 101's phone
 * cell, where ten digits nearly fill it - gets none, which is what a person
 * writing in it would do; a fixed inset there pushed the last digit past the
 * wall (live report). The editor (TextNode's `--field-inset`) and the
 * exporter (textPdf.ts) both call this, so the two insets are one number.
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
 * Only a field-spanned box (`minWidth`) has room for this to show - a free
 * box hugs its text and a comb places one character per cell. For that box,
 * text with no letters of its own (a phone number, a date) follows the
 * FORM's direction - the seed `textDirection` carries - rather than the
 * digits' own LTR: on a Hebrew form a phone number belongs at the right of
 * its cell like the Hebrew answers around it, not at the left (live report).
 * Layout direction (`getEffectiveTextDirection`) deliberately stays LTR for
 * that text - digits still read left to right - only the alignment follows
 * the form.
 */
export function getTextAlign(element) {
  if (element.textAlign) return element.textAlign;
  const seed = element.minWidth ? element.textDirection : null;
  const direction = strongTextDirection(element.text) || seed || getEffectiveTextDirection(element);
  return direction === 'rtl' ? 'right' : 'left';
}

/**
 * True when a text element's `left` is its *right* edge: RTL text with no
 * fixed span. A free RTL box anchors its right edge on `left` and grows
 * leftward as it is typed (DraggableWrapper's `right: 100 - left`); a comb
 * (`width`) or a box on a detected form cell (`minWidth`) has a span fixed
 * by the paper, so it stays left-anchored and its text merely aligns right
 * inside it. Every place that has to know which physical edge `left` is -
 * the wrapper's CSS, the drag clamps, the exporter's pen - asks this.
 */
export function textAnchorsRightEdge(element) {
  return element?.type === 'text'
    && !element.width
    && !element.minWidth
    && getEffectiveTextDirection(element) === 'rtl';
}

/**
 * A text element's full on-page layout: the outer box (page-percent) and the
 * typography (CSS px, scaled from PDF points), computed the one way
 * DraggableWrapper positions a placed text element and TextNode renders its
 * font. A fill-mode slot (FieldSlot.tsx) calls this on `elementOf(value)` -
 * the exact element the slot becomes - so its preview matches the committed
 * element instead of drifting from its own `slot.placement` (the reported
 * bug: while typing, the preview sat lower, smaller, and higher in its box
 * than the committed text).
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
