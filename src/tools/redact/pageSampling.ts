import { useEffect, useRef } from 'preact/hooks';
import { createLoupe } from './eyedropperLoupe.ts';
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

/** While `active`, a magnifier loupe follows the pointer and the next press picks
 * the centre pixel's colour instead of painting: the press is swallowed in the
 * capture phase so no stroke starts. Mouse picks on press. Touch is press, slide,
 * lift: the loupe rides above the finger and the lift picks; a second finger or a
 * cancel hides it and stays armed. Esc cancels. Handlers write the DOM only (the
 * loupe's transform), never Preact state, per the gesture golden rule. */
export function useEyedropper(active: boolean, onPick: (color: string) => void, onDone: () => void) {
  // Callers pass new closures each render; depending on them would re-run the effect
  // mid-touch, destroy the loupe and drop the tracked gesture. Read the latest instead.
  const pickRef = useRef(onPick);
  const doneRef = useRef(onDone);
  pickRef.current = onPick;
  doneRef.current = onDone;
  useEffect(() => {
    if (!active) return undefined;
    const loupe = createLoupe(document.fullscreenElement ?? document.body);
    document.documentElement.setAttribute('data-redact-eyedropping', '');
    const cardOf = (target: EventTarget | null) => (target as Element | null)?.closest?.('[data-editor-page-card]') ?? null;
    const canvasOf = (card: Element | null) => card?.querySelector<HTMLCanvasElement>('canvas') ?? null;
    let tracked: { id: number; canvas: HTMLCanvasElement | null; x: number; y: number } | null = null;

    const onMouseMove = (e: MouseEvent) => {
      const canvas = canvasOf(cardOf(e.target));
      if (canvas) loupe.update(canvas, e.clientX, e.clientY, false);
      else loupe.hide();
    };
    const onMouseDown = (e: MouseEvent) => {
      // The eyedropper button and the rest of the chrome keep working.
      const card = cardOf(e.target);
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      const canvas = canvasOf(card);
      const color = canvas ? sampleCanvasColor(canvas, e.clientX, e.clientY) : null;
      swallowNextClick();
      if (color) pickRef.current(color);
      doneRef.current();
    };
    const onTouchStart = (e: TouchEvent) => {
      if (tracked) {
        // a second finger is a pinch or a stray touch, not a pick
        tracked = null;
        loupe.hide();
        return;
      }
      const card = cardOf(e.target);
      if (!card) return;
      e.preventDefault();
      e.stopPropagation();
      const t = e.changedTouches[0];
      if (!t) return;
      const canvas = canvasOf(card);
      tracked = { id: t.identifier, canvas, x: t.clientX, y: t.clientY };
      if (canvas) loupe.update(canvas, t.clientX, t.clientY, true);
    };
    const touchOf = (e: TouchEvent) => (tracked ? Array.from(e.changedTouches).find((t) => t.identifier === tracked!.id) : undefined);
    const onTouchMove = (e: TouchEvent) => {
      const t = touchOf(e);
      if (!t || !tracked) return;
      e.preventDefault();
      tracked.x = t.clientX;
      tracked.y = t.clientY;
      if (tracked.canvas) loupe.update(tracked.canvas, t.clientX, t.clientY, true);
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = touchOf(e);
      if (!t || !tracked) return;
      e.preventDefault();
      const { canvas, x, y } = tracked;
      tracked = null;
      loupe.hide();
      const color = canvas ? sampleCanvasColor(canvas, x, y) : null;
      if (color) pickRef.current(color);
      doneRef.current();
    };
    const onTouchCancel = () => {
      tracked = null;
      loupe.hide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      doneRef.current();
    };
    const nonPassive = { capture: true, passive: false } as const;
    window.addEventListener('mousemove', onMouseMove, { capture: true, passive: true });
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('touchstart', onTouchStart, nonPassive);
    window.addEventListener('touchmove', onTouchMove, nonPassive);
    window.addEventListener('touchend', onTouchEnd, nonPassive);
    window.addEventListener('touchcancel', onTouchCancel, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('touchstart', onTouchStart, true);
      window.removeEventListener('touchmove', onTouchMove, true);
      window.removeEventListener('touchend', onTouchEnd, true);
      window.removeEventListener('touchcancel', onTouchCancel, true);
      window.removeEventListener('keydown', onKey, true);
      loupe.destroy();
      document.documentElement.removeAttribute('data-redact-eyedropping');
    };
  }, [active]);
}
