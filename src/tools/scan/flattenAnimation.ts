// The step from corners to result, shown: the processed page lifts out of its photo at the corners
// the person approved and settles onto its paper, while the rest of the photo fades. A short DOM
// overlay over the real result (which waits hidden underneath); the geometry is flatten.ts.
import { cornerPin, easeOutCubic, lerpQuad, rectQuad } from './flatten.ts';
import { scaleQuad, type Quad } from './quad.ts';

const DURATION_MS = 650;

interface Box { left: number; top: number; width: number; height: number }

/** Where the photo was, relative to the host, and the corners on it. Captured before the view changes. */
export interface FlattenFrom { photoUrl: string; frame: Box; quad: Quad }

export const relativeBox = (rect: DOMRect, host: DOMRect): Box =>
  ({ left: rect.left - host.left, top: rect.top - host.top, width: rect.width, height: rect.height });

const layerImage = (src: string, style: Partial<CSSStyleDeclaration>) => {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  Object.assign(img.style, { position: 'absolute', left: '0', top: '0', margin: '0', ...style });
  return img;
};

/** Plays over `host` (positioned) from the photo to `target`, the result's page image. Returns a stop. */
export function playFlatten(host: HTMLElement, from: FlattenFrom, target: HTMLImageElement): () => void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  const to = relativeBox(target.getBoundingClientRect(), host.getBoundingClientRect());
  if (!to.width || !to.height || !from.frame.width) return () => {};

  let layer: HTMLDivElement | null = null;
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    layer?.remove();
    target.style.visibility = '';
  };
  // A near-degenerate quad can make the homography throw: the real page must never stay hidden.
  try {
    const start = scaleQuad(from.quad, from.frame.width, from.frame.height)
      .map((p) => ({ x: p.x + from.frame.left, y: p.y + from.frame.top })) as Quad;
    const end = rectQuad(to);

    layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.flatten = '';
    Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '2' });
    const photo = layerImage(from.photoUrl, {
      left: `${from.frame.left}px`, top: `${from.frame.top}px`, width: `${from.frame.width}px`, height: `${from.frame.height}px`,
    });
    const page = layerImage(target.currentSrc || target.src, {
      width: `${to.width}px`, height: `${to.height}px`, transformOrigin: '0 0', willChange: 'transform',
    });
    layer.append(photo, page);
    host.append(layer);
    target.style.visibility = 'hidden';

    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION_MS);
      try {
        page.style.transform = cornerPin(to.width, to.height, lerpQuad(start, end, easeOutCubic(t))).css;
      } catch {
        // expected: an in-between shape the homography cannot solve; end here rather than freeze
        stop();
        return;
      }
      photo.style.opacity = String(1 - Math.min(1, t / 0.7));
      if (t < 1) frame = requestAnimationFrame(step);
      else stop();
    };
    page.style.transform = cornerPin(to.width, to.height, start).css;
    frame = requestAnimationFrame(step);
  } catch {
    // expected: a sliver the warp would also refuse; skip the animation, the result shows as it is
    stop();
  }
  return stop;
}
