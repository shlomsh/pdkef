import { useEffect } from 'preact/hooks';
import { boxPixelRect, medianColor, ringStrips, type PercentBox } from './pageColor.ts';

const toHex = (n: number) => n.toString(16).padStart(2, '0');

/** The colour of the rendered page pixel under a client point, as #rrggbb, or
 * null if the canvas cannot be read. Samples the canvas, never the DOM. */
export function sampleCanvasColor(canvas: HTMLCanvasElement, clientX: number, clientY: number): string | null {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * canvas.width)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * canvas.height)));
  try {
    const data = canvas.getContext('2d')?.getImageData(x, y, 1, 1).data;
    return data ? `#${toHex(data[0])}${toHex(data[1])}${toHex(data[2])}` : null;
  } catch {
    // expected: getImageData can throw on a tainted or empty canvas, null means no colour
    return null;
  }
}

/** The Redact island deselects a selected box on a document click on blank page
 * area, and a box's eyedropper pick must keep it selected, so the click that
 * follows a mouse pick is swallowed. It outlives the effect (onDone flips
 * `active`) and is dropped after 600 ms if it never came. On touch,
 * preventDefault on touchstart already suppresses the click. */
function swallowNextClick() {
  const onClick = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    cleanup();
  };
  const timer = setTimeout(() => cleanup(), 600);
  function cleanup() {
    clearTimeout(timer);
    window.removeEventListener('click', onClick, true);
  }
  window.addEventListener('click', onClick, true);
}

/** The ring's width in CSS px, converted to canvas px by the canvas's own
 * backing-store-to-CSS ratio, so device pixel ratio and zoom are both accounted for. */
export const RING_CSS_PX = 4;

/** The page render's colour just outside the box, read from the page canvas
 * only, never an overlay. Null if there is no canvas or nothing readable. */
export function sampleRingColor(canvas: HTMLCanvasElement | null | undefined, box: PercentBox): string | null {
  if (!canvas || !canvas.width || !canvas.height) return null;
  const W = canvas.width;
  const H = canvas.height;
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width > 0 ? W / rect.width : 1;
  const thickness = Math.max(1, Math.round(RING_CSS_PX * scale));
  const inner = boxPixelRect(box, W, H);
  let strips = ringStrips(inner, thickness, W, H);
  // A box covering the whole page has no ring: sample its own area.
  if (!strips.length && inner.width > 0 && inner.height > 0) strips = [inner];
  if (!strips.length) return null;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    return medianColor(strips.map((s) => ctx.getImageData(s.x, s.y, s.width, s.height).data));
  } catch {
    // expected: getImageData throws on a tainted or zero-size canvas; null means no colour
    return null;
  }
}

/** While `active`, the next press on a page picks that pixel's colour instead
 * of painting: it is swallowed in the capture phase so no stroke starts. Esc
 * cancels. */
export function useEyedropper(active: boolean, onPick: (color: string) => void, onDone: () => void) {
  useEffect(() => {
    if (!active) return undefined;
    const point = (e: MouseEvent | TouchEvent) => ('touches' in e && e.touches?.length ? e.touches[0] : (e as MouseEvent));
    const onPress = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Element | null;
      // The eyedropper button and the rest of the chrome keep working.
      const card = target?.closest?.('[data-editor-page-card]');
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      const canvas = card.querySelector<HTMLCanvasElement>('canvas');
      const p = point(e);
      const color = canvas ? sampleCanvasColor(canvas, p.clientX, p.clientY) : null;
      if (e.type === 'mousedown') swallowNextClick();
      if (color) onPick(color);
      onDone();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onDone();
    };
    window.addEventListener('mousedown', onPress, true);
    window.addEventListener('touchstart', onPress, { capture: true, passive: false });
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onPress, true);
      window.removeEventListener('touchstart', onPress, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [active, onPick, onDone]);
}

