import { HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';

/** The two plastic shades a color cell's marker is drawn in; the nib and the band are the ink itself. */
interface MarkerShades { cap: string; barrel: string }

/** The palette's markers as drawn. Document content colors, so they live in the model, not in global.css. */
const DRAWN: Record<string, MarkerShades> = {
  '#FFF34D': { cap: '#F5CF14', barrel: '#FFE83A' },
  '#FF8FCF': { cap: '#F45FB4', barrel: '#FF85C8' },
  '#9CF27A': { cap: '#58C935', barrel: '#8BE868' },
  '#FFB15C': { cap: '#FF9330', barrel: '#FFA548' },
  '#FF8080': { cap: '#EE5252', barrel: '#FF7373' },
  '#7FDBFF': { cap: '#2CB5EE', barrel: '#6CD2FB' },
};

/** The color wheel's marker before a custom color is in force: a blank body under a rainbow cap. */
export const BLANK_BARREL = '#F3EFE6';
const hexOf = (id: string) => HIGHLIGHT_COLORS.find((c) => c.id === id)!.hex;
export const WHEEL_CAP = `linear-gradient(90deg, ${hexOf('red')}, ${hexOf('orange')} 18%, ${hexOf('yellow')} 36%, ${hexOf('green')} 54%, ${hexOf('blue')} 72%, #A99CFF 88%, ${hexOf('pink')})`;

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v: number) => Math.min(1, Math.max(0, v));

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, d / (1 - Math.abs(2 * l - 1)), l];
}

function toHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** Any ink's marker: the cap a deeper, less saturated shade of the ink, the barrel a touch darker than it. The drawn six sit within a small step of this. @testSeam */
export function deriveShades(ink: string): MarkerShades {
  const [h, s, l] = toHsl(ink);
  return { cap: toHex(h, clamp(s * 0.85), clamp(l - 0.16)), barrel: toHex(h, clamp(s * 0.96), clamp(l - 0.035)) };
}

/** The marker a color cell draws for an ink: the drawn shades for the palette, derived ones for a custom color. */
export function markerShades(ink: string): MarkerShades {
  if (!HEX.test(ink)) return { cap: BLANK_BARREL, barrel: BLANK_BARREL };
  return DRAWN[ink.toUpperCase()] ?? deriveShades(ink);
}
