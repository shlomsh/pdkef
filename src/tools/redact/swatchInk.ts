/** The ink that reads on a colour swatch: dark on a light colour, light on a dark one. */
export function swatchInk(hex: string): 'dark' | 'light' {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'dark';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return luminance > 0.5 ? 'dark' : 'light';
}
