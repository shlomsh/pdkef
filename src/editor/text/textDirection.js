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
