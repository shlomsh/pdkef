// SITE-41: the blur redaction's strength levels, and the one place that says
// how strong each level is. The on-screen paint (redactionSurface.ts), the
// export flatten (redact.js) and the toolbar picker all read this module, so
// the three can never disagree about what "light" means.
//
// This is deliberately strength, not opacity: the export pastes the blurred
// pixels opaquely over the original, and every level must stay unreadable in
// the saved PDF. A fixed pixel radius could not promise that: measured on a
// real export (2026-09-27), a 12px blur left 28pt text plainly readable and
// even the old fixed 24px left its word shapes guessable, while 11pt text was
// gone at both. Readability depends on the blur relative to the text, so the
// radius is a fraction of the box's own height (a box is drawn around the
// text it hides). 0.25 already read as a smear on that export; the lightest
// level keeps a margin above it. Screen and export apply the same fraction,
// so the box looks the same at any zoom as in the saved file. Lowering a
// factor needs the same real-export check first.

export type BlurStrength = 'light' | 'medium' | 'strong';

export const BLUR_STRENGTHS: readonly BlurStrength[] = ['light', 'medium', 'strong'];

/** What a blur box saved before strength existed restores as. */
export const DEFAULT_BLUR_STRENGTH: BlurStrength = 'strong';

const FACTORS: { [K in BlurStrength]: number } = {
  light: 0.3,
  medium: 0.4,
  strong: 0.5,
};

/** Keeps a sliver of a box from getting no blur at all. */
const MIN_BLUR_PX = 1;

export function isBlurStrength(value: unknown): value is BlurStrength {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FACTORS, value);
}

/** A missing or unknown strength reads as the default. */
export function resolveBlurStrength(strength: unknown): BlurStrength {
  return isBlurStrength(strength) ? strength : DEFAULT_BLUR_STRENGTH;
}

/** The blur radius as a fraction of the box's height. */
export function blurFactor(strength: unknown): number {
  return FACTORS[resolveBlurStrength(strength)];
}

/** The blur radius, in the same pixels as `boxHeightPx`. */
export function blurRadiusPx(strength: unknown, boxHeightPx: number): number {
  return Math.max(MIN_BLUR_PX, blurFactor(strength) * boxHeightPx);
}
