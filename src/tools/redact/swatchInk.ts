const lin = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const relativeLuminance = (n: number) =>
  0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);

// The dark ink is the `--color-text` token (#0b4c4c); TS cannot read CSS, so its value lives here.
const DARK_INK_LUMINANCE = relativeLuminance(0x0b4c4c);

/** The ink that reads on a colour swatch: whichever of white and the dark ink
 * has the higher WCAG contrast against it. */
export function swatchInk(hex: string): 'dark' | 'light' {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'dark';
  const l = relativeLuminance(parseInt(m[1], 16));
  const againstWhite = 1.05 / (l + 0.05);
  const againstDark = (l + 0.05) / (DARK_INK_LUMINANCE + 0.05);
  return againstWhite > againstDark ? 'light' : 'dark';
}
