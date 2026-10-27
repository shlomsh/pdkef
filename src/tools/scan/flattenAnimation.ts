// The step from corners to result, shown: the page lifts out of its photo at the corners the person
// approved and opens up onto its paper. The photo around the page goes first; the photo's own page,
// cut to the corners, carries the move; the made page fades in over it as it straightens; the paper
// appears as it lands. A short DOM overlay over the real result (which waits hidden underneath);
// the geometry and the timeline are flatten.ts.
import { cornerPin, flattenFrame, lerpQuad, quadPin, rectQuad } from './flatten.ts';
import { scaleQuad, type Quad } from './quad.ts';

const DURATION_MS = 800;

interface Box { left: number; top: number; width: number; height: number }

/** Where the photo was, relative to the host, the corners on it, and the editor's own decoded photo.
 * Captured before the view changes. */
export interface FlattenFrom { photo: HTMLImageElement; frame: Box; quad: Quad }

export const relativeBox = (rect: DOMRect, host: DOMRect): Box =>
  ({ left: rect.left - host.left, top: rect.top - host.top, width: rect.width, height: rect.height });

const px = (v: number) => `${v}px`;

/* The photo drawn into a canvas at once, from the editor's already decoded image: a new <img> of the
   same photo painted a frame late, and the first frame showed the tint alone (Scan QA, Pixel 7). */
const photoCanvas = (photo: HTMLImageElement, frame: Box, style: Partial<CSSStyleDeclaration>) => {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(frame.width * dpr));
  canvas.height = Math.max(1, Math.round(frame.height * dpr));
  (canvas.getContext('2d') as CanvasRenderingContext2D).drawImage(photo, 0, 0, canvas.width, canvas.height);
  Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', width: px(frame.width), height: px(frame.height), ...style });
  return canvas;
};

const layerImage = (src: string, style: Partial<CSSStyleDeclaration>) => {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  Object.assign(img.style, { position: 'absolute', left: '0', top: '0', margin: '0', maxWidth: 'none', ...style });
  return img;
};

/** Plays over `host` (positioned) from the photo to `target`, the result's page image. Returns a stop. */
export function playFlatten(host: HTMLElement, from: FlattenFrom, target: HTMLImageElement): () => void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  const to = relativeBox(target.getBoundingClientRect(), host.getBoundingClientRect());
  if (!to.width || !to.height || !from.frame.width) return () => {};
  // The paper (its edge and shadow) shows only as the page lands on it.
  const paper = target.closest<HTMLElement>('[data-paper]') ?? target;

  let layer: HTMLDivElement | null = null;
  let frame = 0;
  const canvases: HTMLCanvasElement[] = [];
  const stop = () => {
    cancelAnimationFrame(frame);
    layer?.remove();
    // Their pixels go now, not whenever the collector gets to them (a phone's memory).
    canvases.forEach((canvas) => { canvas.width = 0; canvas.height = 0; });
    target.style.visibility = '';
    paper.style.opacity = '';
  };
  // A near-degenerate quad can make the homography throw: the real page must never stay hidden.
  try {
    // The corners in the photo's own box, and where they sit over the host.
    const local = scaleQuad(from.quad, from.frame.width, from.frame.height);
    const start = local.map((p) => ({ x: p.x + from.frame.left, y: p.y + from.frame.top })) as Quad;
    const end = rectQuad(to);

    layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.dataset.flatten = '';
    Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '2' });
    // The photo as the corner editor showed it: its own night tint around the page (CornerEditor's dim).
    const surround = document.createElement('div');
    Object.assign(surround.style, {
      position: 'absolute', left: px(from.frame.left), top: px(from.frame.top), width: px(from.frame.width), height: px(from.frame.height),
    });
    const tint = document.createElement('div');
    Object.assign(tint.style, { position: 'absolute', inset: '0', background: 'var(--color-night)', opacity: '0.45' });
    const surroundPhoto = photoCanvas(from.photo, from.frame, {});
    surround.append(surroundPhoto, tint);
    // The photo itself cut to the corners: the page as photographed, carried to the paper.
    const photoPage = photoCanvas(from.photo, from.frame, {
      transformOrigin: '0 0', willChange: 'transform',
      clipPath: `polygon(${local.map((p) => `${p.x}px ${p.y}px`).join(', ')})`,
    });
    canvases.push(surroundPhoto, photoPage);
    // The made page, pinned to the same corners as they travel, fading in over the photo's.
    const page = layerImage(target.currentSrc || target.src, {
      width: px(to.width), height: px(to.height), transformOrigin: '0 0', willChange: 'transform, opacity', opacity: '0',
    });
    layer.append(surround, photoPage, page);
    host.append(layer);
    target.style.visibility = 'hidden';

    const draw = (t: number) => {
      const f = flattenFrame(t);
      const quad = lerpQuad(start, end, f.move);
      photoPage.style.transform = quadPin(local, quad).css;
      page.style.transform = cornerPin(to.width, to.height, quad).css;
      surround.style.opacity = String(f.surround);
      photoPage.style.opacity = String(f.photoPage);
      page.style.opacity = String(f.page);
      paper.style.opacity = String(f.paper);
    };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION_MS);
      try {
        draw(t);
      } catch {
        // expected: an in-between shape the homography cannot solve; end here rather than freeze
        stop();
        return;
      }
      if (t < 1) frame = requestAnimationFrame(step);
      else stop();
    };
    draw(0);
    frame = requestAnimationFrame(step);
  } catch {
    // expected: a sliver the warp would also refuse; skip the animation, the result shows as it is
    stop();
  }
  return stop;
}
