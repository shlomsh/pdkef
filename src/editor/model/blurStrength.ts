// SITE-41: the blur redaction's strength levels, and the one place that maps a
// level to a blur radius. The on-screen paint (redactionSurface.ts), the
// export flatten (redact.js) and the toolbar picker all read this module, so
// the three can never disagree about what "light" means.
//
// This is deliberately strength, not opacity: the export pastes the blurred
// pixels opaquely over the original, and every level must stay unreadable in
// the saved PDF. `exportPx` is at the 2.5x raster redact.js renders a page at;
// `screenPx` is roughly exportPx / 2.5 so the box on screen looks like the
// export. Raising a level's floor is fine; lowering one needs a readability
// check against a real export first.

export type BlurStrength = 'light' | 'medium' | 'strong';

export const BLUR_STRENGTHS: readonly BlurStrength[] = ['light', 'medium', 'strong'];

/** Today's look, and what a blur box saved before strength existed restores as. */
export const DEFAULT_BLUR_STRENGTH: BlurStrength = 'strong';

const RADII: { [K in BlurStrength]: { screenPx: number; exportPx: number } } = {
  light: { screenPx: 4, exportPx: 12 },
  medium: { screenPx: 6, exportPx: 18 },
  strong: { screenPx: 8, exportPx: 24 },
};

export function isBlurStrength(value: unknown): value is BlurStrength {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RADII, value);
}

/** A missing or unknown strength reads as the default. */
export function resolveBlurStrength(strength: unknown): BlurStrength {
  return isBlurStrength(strength) ? strength : DEFAULT_BLUR_STRENGTH;
}

export function blurRadius(strength: unknown): { screenPx: number; exportPx: number } {
  return RADII[resolveBlurStrength(strength)];
}
