// The step from corners to result, shown: the page lifts out of its photo at the corners the person
// approved and opens up onto its paper. The photo around the page goes first; the photo's own page,
// cut to the corners, carries the move; the made page fades in over it as it straightens; the paper
// appears as it lands. A short DOM overlay over the real result (which waits hidden underneath);
// the geometry and the timeline are flatten.ts.
import { cornerPin, flattenFrame, lerpQuad, quadPin, rectQuad } from './flatten.ts';
import { scaleQuad, type Quad } from './quad.ts';

const DURATION_MS = 800;

interface Box { left: number; top: number; width: number; height: number }

/** Where the photo was, relative to the host, and the corners on it. Captured before the view changes. */
export interface FlattenFrom { photoUrl: string; frame: Box; quad: Quad }

export const relativeBox = (rect: DOMRect, host: DOMRect): Box =>
  ({ left: rect.left - host.left, top: rect.top - host.top, width: rect.width, height: rect.height });

const px = (v: number) => `${v}px`;

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
  const stop = () => {
    cancelAnimationFrame(frame);
    layer?.remove();
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
    // The photo as the corner editor showed it: dimmed around the page.
    const surround = layerImage(from.photoUrl, {
      left: px(from.frame.left), top: px(from.frame.top), width: px(from.frame.width), height: px(from.frame.height),
      filter: 'brightness(0.55)',
    });
    // The photo itself cut to the corners: the page as photographed, carried to the paper.
    const photoPage = layerImage(from.photoUrl, {
      width: px(from.frame.width), height: px(from.frame.height), transformOrigin: '0 0', willChange: 'transform',
      clipPath: `polygon(${local.map((p) => `${p.x}px ${p.y}px`).join(', ')})`,
    });
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
