import { UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';
import { DEFAULT_MARKER, OPACITY_MIN, type Marker } from './markerState.ts';

const HEX = /^#[0-9a-f]{6}$/i;

/** The marker as the text a draft's details and the remembered default keep. */
export function serializeMarker(marker: Marker): string {
  return JSON.stringify({ color: marker.color, style: marker.style, opacity: marker.opacity, ...(marker.strokeWidth === undefined ? {} : { strokeWidth: marker.strokeWidth }), ...(marker.stroke === 'sketch' ? { stroke: 'sketch' } : {}) });
}

/** A stored marker, or null for anything that is not one (color hex, style, opacity 0.3 to 1). */
export function parseMarker(value: unknown): Marker | null {
  if (typeof value !== 'string') return null;
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    // expected: a stored value that does not parse is simply not a marker
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { color, style, opacity, strokeWidth, stroke } = raw as Record<string, unknown>;
  if (typeof color !== 'string' || !HEX.test(color)) return null;
  if (style !== 'highlight' && style !== 'underline') return null;
  if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < OPACITY_MIN || opacity > 1) return null;
  if (strokeWidth !== undefined && (typeof strokeWidth !== 'number' || !Number.isFinite(strokeWidth) || strokeWidth < UNDERLINE_WIDTH.min || strokeWidth > UNDERLINE_WIDTH.max)) return null;
  if (stroke !== undefined && stroke !== 'sketch') return null;
  return { color: color.toUpperCase(), style, opacity, ...(strokeWidth === undefined ? {} : { strokeWidth }), ...(stroke === 'sketch' ? { stroke } : {}) };
}

/** The document's own marker beats the remembered default, which beats the yellow marker. */
export function initialMarker(fromDraft: unknown, fromDefault: unknown): Marker {
  return parseMarker(fromDraft) ?? parseMarker(fromDefault) ?? DEFAULT_MARKER;
}

export function sameMarker(a: Marker, b: Marker): boolean {
  return a.color.toUpperCase() === b.color.toUpperCase() && a.style === b.style && a.opacity === b.opacity && a.strokeWidth === b.strokeWidth && a.stroke === b.stroke;
}
