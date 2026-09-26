// SNG-17: `maximum-scale=1` stops iOS's zoom-on-focus for fields under 16px,
// but it also clamps a pinch zoom the person chose the moment a new field
// takes focus (iOS re-applies the viewport meta on every focus, snapping the
// page back to scale 1). Appending it only while the page is at its resting
// scale keeps that snap-back from ever firing on a pinch the person made;
// past that, iOS just pans to the focused field instead of re-zooming it.
const MAX_SCALE_SUFFIX = ', maximum-scale=1';
const RESTING_SCALE_THRESHOLD = 1.01;

export function viewportContent(original: string, scale: number): string {
  const base = original.endsWith(MAX_SCALE_SUFFIX)
    ? original.slice(0, -MAX_SCALE_SUFFIX.length)
    : original;
  return scale <= RESTING_SCALE_THRESHOLD ? `${base}${MAX_SCALE_SUFFIX}` : base;
}
