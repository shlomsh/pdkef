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
  // `textDirection` must not become an inherited language choice: a FREE box
  // (no `width`, no `minWidth`) has its own growing edge to anchor, and
  // showing that edge on the right because whatever was typed last happened
  // to be Hebrew - before this field has any typed content of its own to
  // justify it - was a real, reported bug. A blank, punctuation-only, or
  // digit-only free box has no typed language to follow, so product policy
  // makes it English/LTR even if an older saved element happens to carry
  // `textDirection: 'rtl'`.
  //
  // A field-spanned box (a comb's `width`, a detected cell's `minWidth`) is
  // different: it has no growing edge to anchor either way (combPlacement.ts),
  // so there is no equivalent anchor-flip to guard against, and it is sitting
  // on one specific spot on the printed page. useWorkspaceGestures.ts and
  // useFieldNavigation.ts seed its `textDirection` from the FORM's own
  // printed direction, not from whatever was used last - so before anything
  // is typed, honouring that seed here is reading the page back to the
  // person about to type into it, in their own language's alignment, rather
  // than showing an English-page default on a Hebrew form.
  return detectTextDirection(element.text)
    || ((element.width || element.minWidth) && element.textDirection)
    || 'ltr';
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
