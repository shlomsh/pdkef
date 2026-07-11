const STRONG_DIRECTION_CHAR = /[A-Za-z\u0591-\u07FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const RTL_CHAR = /[\u0591-\u07FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

export function detectTextDirection(text) {
  const firstStrong = (text || '').match(STRONG_DIRECTION_CHAR)?.[0];
  if (!firstStrong) return null;
  return RTL_CHAR.test(firstStrong) ? 'rtl' : 'ltr';
}

export function getEffectiveTextDirection(element) {
  return detectTextDirection(element.text) || element.textDirection || 'ltr';
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
