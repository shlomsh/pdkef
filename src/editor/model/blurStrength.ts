// SITE-41 / RED-24: the blur redaction's strength levels, and the one place
// that says how strong each level is. The on-screen paint (redactionSurface.ts),
// the export flatten (redact.js) and the toolbar picker all read this module,
// so the three can never disagree about what "light" means.
//
// This is deliberately strength, not opacity: the export pastes the blurred
// pixels opaquely over the original, and every level must stay unreadable in
// the saved PDF. A fixed pixel radius could not promise that: measured on a
// real export (2026-09-27), a 12px blur left 28pt text plainly readable and
// even the old fixed 24px left its word shapes guessable, while 11pt text was
// gone at both. Readability depends on the blur relative to the text, so the
// radius is a fraction of the box's own height (a box is drawn around the
// text it hides). 0.25 already read as a smear on that export; the lightest
// level keeps a margin above it.
//
// RED-24: before SITE-41, every blur was a fixed 24px at the export's 2.5x
// raster scale, which is 9.6pt of page. SITE-41's plain fraction made
// ordinary text lighter than that old blur, while a large box (a 28pt
// headline) still leaked its word shapes at a fixed radius. One rule keeps
// both findings: radius = factor x max(box height, 24pt). Below the 24pt
// floor a box gets the same absolute radius it always did, whatever the
// level; medium's floor (9.6pt at the export's 2.5x scale) is exactly the
// old fixed blur, which is also what a blur box saved before strength
// existed restores as, so one default serves both. Above the floor the
// radius grows with the box, as SITE-41 intended. Screen and export apply
// the same fraction, so the box looks the same at any zoom as in the saved
// file. Raising a floor is fine; lowering it, like lowering a factor, needs
// a real-export check first.

export type BlurStrength = 'light' | 'medium' | 'strong';

export const BLUR_STRENGTHS: readonly BlurStrength[] = ['light', 'medium', 'strong'];

/** What a blur box saved before strength existed restores as, and what a new box starts at. */
export const DEFAULT_BLUR_STRENGTH: BlurStrength = 'medium';

const FACTORS: { [K in BlurStrength]: number } = {
  light: 0.3,
  medium: 0.4,
  strong: 0.5,
};

/** The pre-SITE-41 fixed blur's height, in page points: every level's floor. */
const FLOOR_PT = 24;

/** Keeps a sliver of a box from getting no blur at all. */
const MIN_BLUR_PX = 1;

export function isBlurStrength(value: unknown): value is BlurStrength {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FACTORS, value);
}

/** A missing or unknown strength reads as the default. */
export function resolveBlurStrength(strength: unknown): BlurStrength {
  return isBlurStrength(strength) ? strength : DEFAULT_BLUR_STRENGTH;
}

/** The blur radius as a plain fraction of the box's height, with no floor applied. */
export function blurFactor(strength: unknown): number {
  return FACTORS[resolveBlurStrength(strength)];
}

/**
 * The blur radius as a fraction of the box's OWN height (RED-24): factor x
 * max(boxHeightPt, FLOOR_PT) / boxHeightPt. A box at or under the floor gets
 * the same absolute radius regardless of size; a taller box's radius grows
 * with it, as SITE-41 intended. A box whose height in page points isn't
 * known yet (still being drawn, or the page's point size hasn't reached the
 * caller) falls back to the plain factor.
 */
export function blurFraction(strength: unknown, boxHeightPt: number): number {
  const factor = blurFactor(strength);
  if (!Number.isFinite(boxHeightPt) || boxHeightPt <= 0) return factor;
  return (factor * Math.max(boxHeightPt, FLOOR_PT)) / boxHeightPt;
}

/**
 * The blur radius, in the same pixels as `boxHeightPx`. `pxPerPt` is the
 * render scale (the export's 2.5x raster, or an on-screen scale factor), so
 * the FLOOR_PT floor above is measured in real page points and doesn't drift
 * with zoom or export resolution.
 */
export function blurRadiusPx(strength: unknown, boxHeightPx: number, pxPerPt: number): number {
  const boxHeightPt = pxPerPt > 0 ? boxHeightPx / pxPerPt : 0;
  return Math.max(MIN_BLUR_PX, blurFraction(strength, boxHeightPt) * boxHeightPx);
}
