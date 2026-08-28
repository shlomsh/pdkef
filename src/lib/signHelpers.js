// "First strong character", per UAX #9: a run's direction comes from its first
// character that has an inherent one, and *every* letter has one - not just the
// Latin and Hebrew/Arabic ranges this used to list. Devanagari, Thai, Cyrillic,
// Greek and CJK were all missing, so they matched nothing here, detection
// returned null, and the element silently inherited the direction of whatever
// was edited before it. Typing Hebrew and then Devanagari left the new box
// right-anchored, right-aligned and the RTL toggle lit up for no visible reason.
const STRONG_DIRECTION_CHAR = /\p{L}/u;
const RTL_CHAR = /[\u0591-\u07FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
// Digits and the punctuation an ID number or date is made of (327-69-8221,
// 27/05/2008). None of it has an inherent direction, so without this a field
// like that would silently inherit whatever direction the *previous* element
// on the page happened to be \u2014 e.g. always landing right-anchored and
// right-aligned after a Hebrew field, even though nothing about "27/05/2008"
// is Hebrew.
const NEUTRAL_ONLY = /^[0-9\s/\-.:,()+]*$/;

export function detectTextDirection(text) {
  const value = text || '';
  const firstStrong = value.match(STRONG_DIRECTION_CHAR)?.[0];
  if (firstStrong) return RTL_CHAR.test(firstStrong) ? 'rtl' : 'ltr';
  if (value && NEUTRAL_ONLY.test(value)) return 'ltr';
  return null;
}

export function getEffectiveTextDirection(element) {
  // `textDirection` is retained on elements for backwards-compatible draft
  // data and the creation model, but it must not become an inherited language
  // choice. A blank, punctuation-only, or digit-only field has no typed
  // language to follow, so product policy makes it English/LTR even if an
  // older saved element happens to carry `textDirection: 'rtl'`.
  return detectTextDirection(element.text) || 'ltr';
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
