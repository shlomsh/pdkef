// SNG-17: iOS zooms a focused field until its text reads at about 16px. At
// rest, `maximum-scale=1` stops that zoom-on-focus for fields under 16px.
// Zoomed in, iOS would re-zoom every newly focused field to that same 16px
// level (measured 2026-09-26: 3.97x became 2.12x on a 7.53px field), neither
// the scale the person pinched to nor 1. So while zoomed, the limits hold the
// person's own scale, since iOS's focus zoom stays inside the page's limits.
// A minimum-scale also stops a pinch back out, so a pinch in progress gets no
// limits at all (`pinching`), and they return once the gesture settles.
const LIMITS = /, *(?:minimum|maximum)-scale=[\d.]+/g;
const RESTING_SCALE_THRESHOLD = 1.01;

export function viewportContent(original: string, scale: number, pinching = false): string {
  const base = original.replace(LIMITS, '');
  if (pinching) return base;
  if (scale <= RESTING_SCALE_THRESHOLD) return `${base}, maximum-scale=1`;
  // Rounded down, so the limit never asks for more zoom than the page has.
  const held = Math.floor(scale * 100) / 100;
  return `${base}, minimum-scale=${held}, maximum-scale=${held}`;
}
