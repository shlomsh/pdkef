import { underlineInk } from '#editor/model/underlineInk.ts';
import type { Marker } from './markerState.ts';

export type MarkerBadge = { kind: 'dot'; color: string; opacity: number } | { kind: 'underline'; ink: string };

/** The faintest a dot is drawn, so a 30% marker can still be seen (the rest toolbar's dot does the same). */
const DOT_OPACITY_FLOOR = 0.35;

/** R19: what the marker button shows of the armed marker, a dot in its color or the underline glyph in the darkened ink. */
export function markerBadge(marker: Marker): MarkerBadge {
  if (marker.style === 'underline') return { kind: 'underline', ink: underlineInk(marker.color) };
  return { kind: 'dot', color: marker.color, opacity: Math.max(DOT_OPACITY_FLOOR, marker.opacity) };
}
