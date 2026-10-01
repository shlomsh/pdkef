// SITE-41 / RED-24 / RED-30: the blur redaction's strength, and the one place
// that says how strong a given strength is. The on-screen paint
// (redactionSurface.ts), the export flatten (redact.js) and the toolbar
// slider all read this module, so the three can never disagree.
//
// This is deliberately strength, not opacity: the export pastes the blurred
// pixels opaquely over the original. A fixed pixel radius could not keep
// text unreadable: measured on a real export (2026-09-27), a 12px blur left
// 28pt text plainly readable and even the old fixed 24px left its word
// shapes guessable, while 11pt text was gone at both. Readability depends on
// the blur relative to the text, so the radius is a fraction of the box's
// own height (a box is drawn around the text it hides). 0.25 already read as
// a smear on that export.
//
// RED-24: before SITE-41, every blur was a fixed 24px at the export's 2.5x
// raster scale, which is 9.6pt of page. The floor rule keeps that finding:
// radius = factor x max(box height, 24pt). Below the 24pt floor a box gets
// the same absolute radius it always did, whatever its height; above the
// floor the radius grows with the box. Screen and export apply the same
// fraction, so the box looks the same at any zoom as in the saved file.
//
// RED-30: strength is now a continuous factor from BLUR_MIN to BLUR_MAX.
// 0.4 was the default and exactly the old "medium". Going below the old
// lightest level (0.3) is a deliberate choice the person makes with the
// slider: a vaguely readable blur is allowed, and nothing warns about it.
// The floor rule above is unchanged. The three legacy names still resolve
// (light 0.3, medium 0.4, strong 0.5) so drafts and undo history saved
// before the slider keep rendering and exporting the same.
//
// RED-47: Shlomi's desktop review (2026-10-01) found the lightest still strong
// on a tall box, so the range moved down to 0.05-0.55 and the default to 0.3,
// the old light, which already read as a smear on a real export.

export type BlurStrength = number;

export const BLUR_MIN = 0.05;
export const BLUR_MAX = 0.55;

/** What a blur box saved before strength existed restores as, and what a new box starts at. */
export const DEFAULT_BLUR_STRENGTH: BlurStrength = 0.3;

/** The slider snaps to the default within this distance. */
const SNAP_RADIUS = 0.02;

const LEGACY_FACTORS: Readonly<Record<string, number>> = {
  light: 0.3,
  medium: 0.4,
  strong: 0.5,
};

/** The pre-SITE-41 fixed blur's height, in page points: every level's floor. */
const FLOOR_PT = 24;

/** Keeps a sliver of a box from getting no blur at all. */
const MIN_BLUR_PX = 1;

const clamp = (value: number) => Math.min(BLUR_MAX, Math.max(BLUR_MIN, value));

/** Whether a stored value is one this module can resolve: a legacy name or a finite number. */
export function isBlurStrengthValue(value: unknown): boolean {
  return (typeof value === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_FACTORS, value))
    || (typeof value === 'number' && Number.isFinite(value));
}

/** A legacy name becomes its number, a number is clamped, anything else reads as the default. */
export function resolveBlurStrength(strength: unknown): number {
  if (typeof strength === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_FACTORS, strength)) {
    return LEGACY_FACTORS[strength];
  }
  if (typeof strength === 'number' && Number.isFinite(strength)) return clamp(strength);
  return DEFAULT_BLUR_STRENGTH;
}

/** What the slider commits: the default when within reach of it, else hundredths, clamped. */
export function snapBlurStrength(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BLUR_STRENGTH;
  if (Math.abs(value - DEFAULT_BLUR_STRENGTH) <= SNAP_RADIUS + 1e-9) return DEFAULT_BLUR_STRENGTH;
  return clamp(Math.round(value * 100) / 100);
}

/** The blur radius as a plain fraction of the box's height, with no floor applied. */
export function blurFactor(strength: unknown): number {
  return resolveBlurStrength(strength);
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
