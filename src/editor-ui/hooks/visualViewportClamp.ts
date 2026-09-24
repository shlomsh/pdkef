import type { Middleware, Placement } from '@floating-ui/react';
import { VISUAL_VIEWPORT_CLAMP_MARGIN_PX } from '../../constants/signGeometry.js';
import { currentScale } from './useVisualViewportScale.ts';

/**
 * MOBI-17: the fraction of the floating bar's own box, on each axis, that
 * the counter-scale `scale()` transform in DraggableWrapper.tsx/RedactBox.tsx
 * holds fixed (its `transformOrigin`) - 0 is the leading/top edge, 1 the
 * trailing/bottom edge, 0.5 the center. Both components already compute this
 * for their own CSS `transformOrigin` string; this is the single source of
 * that mapping so the clamp below can never disagree with what actually
 * renders. `side`/`align` are Floating UI's own placement vocabulary
 * (`'top-start'`, `'bottom'`, ...): a bar placed `'top-*'` sits above its
 * element, so its *bottom* edge is the one flush against it (origin y = 1);
 * `'bottom-*'` is the mirror (origin y = 0). `align` only ever matters on the
 * horizontal axis here - neither tool ever places a bar to the left/right of
 * its element.
 */
export function originFromPlacement(placement: Placement | string): { x: number; y: number } {
  const [side, align] = placement.split('-');
  const x = align === 'end' ? 1 : align === 'start' ? 0 : 0.5;
  const y = side === 'bottom' ? 0 : 1;
  return { x, y };
}

/** The same mapping, as the CSS percentage string `transformOrigin` wants. */
export function toolbarScaleOriginCss(placement: Placement | string): string {
  const { x, y } = originFromPlacement(placement);
  return `${x * 100}% ${y * 100}%`;
}

/**
 * The sticky tool card (`ToolShell.module.css`'s `.editor` variant, tagged
 * `data-tool-shell` - see ToolShell.tsx) that Sign and Redact both mount
 * their workspace inside. It is `position: sticky`, so its rendered rect
 * already reflects however far the page has scrolled; a floating bar must
 * never render under it, whatever the current pan/zoom, or it is reachable
 * only by scrolling the sticky strip out of the way first - not a tap away
 * at all. Returns `null` when there is nothing on the page to avoid (no
 * sticky strip, or `document` unavailable).
 */
export function getStickyToolShellRect(): DOMRect | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector('[data-tool-shell]')?.getBoundingClientRect() ?? null;
}

/**
 * MOBI-17: keeps the element toolbar's actual on-screen rect inside
 * `window.visualViewport` - the slice of the page a pinch-zoomed, panned
 * phone can actually show - while staying anchored as close as possible to
 * the element it belongs to.
 *
 * Placed *after* `shift()`/`size()` in the middleware list. Those two already
 * hold the bar's physical size and row count constant under zoom by
 * measuring against the page wrapper's own static layout rect
 * (`rootBoundary: 'document'`, see the long comment beside `useFloating` in
 * DraggableWrapper.tsx) - deliberately ignoring `visualViewport`, which is
 * exactly what makes that cap zoom-invariant. The trade-off that leaves
 * unhandled: at real zoom the page wrapper can be far wider than what is
 * currently panned into view, so a bar `shift()` placed validly *within the
 * whole wrapper* is not guaranteed to sit within the visible slice of it.
 * This middleware is that missing piece, aimed only at containment, not at
 * physical size (which stays `shift()`/`size()`'s job).
 *
 * Two things make the math here different from a plain "clamp x/y between 0
 * and the viewport size":
 *
 * 1. `rects.floating.width/height` (Floating UI's own measurement, via
 *    `offsetWidth`/`offsetHeight`) is the bar's *layout* size - it does not
 *    know about the CSS counter-scale transform at all, because a CSS
 *    transform never changes an element's own layout box. What a person can
 *    actually see is that layout size divided by the live zoom
 *    (`currentScale()`, the same value published as `--vv-scale`) - smaller,
 *    at any zoom past 1x, than the box Floating UI thinks it is placing.
 * 2. The counter-scale's `transformOrigin` is not the box's top-left corner
 *    (see `originFromPlacement` above), so shrinking the layout size down to
 *    the visible size does not move the box's `x`/`y` (its top-left, in
 *    Floating UI's own coordinate space) - it moves whichever edge is
 *    *opposite* the anchored corner. Both are accounted for below before any
 *    overflow is measured, or the "is it inside the viewport" question would
 *    be asked of a box bigger than the one actually rendered.
 *
 * Once the true visible rect is known, `elements.reference`'s two rects -
 * `rects.reference` (Floating UI's own, in its internal offsetParent-relative
 * coordinate space) and a fresh `getBoundingClientRect()` (viewport-relative)
 * - give a delta between those two coordinate spaces for free, without
 * reaching into Floating UI's own platform internals: neither the offset
 * parent nor the reference element carries a CSS transform in this app, so
 * the two spaces differ only by a constant translation (scroll position and
 * the offset parent's own placement), which cancels out of that delta
 * regardless of what it is.
 *
 * A `getExcludedRect` beyond `window.visualViewport` itself - here, the
 * sticky tool strip - narrows the usable top edge the same way: the strip's
 * own rect is already in the same viewport-relative frame, so it composes
 * with no extra conversion. Floating UI's `flip()` (swap to the opposite
 * side of the element) would be the more common answer to "something covers
 * the chosen spot", but DraggableWrapper.tsx deliberately never flips
 * vertically (`editor.md`: it visibly jumped the bar under the text in real
 * use) - so this clamps the bar down to just below the strip instead of
 * flipping it, which can put it slightly over the element itself at extreme
 * zoom. That is the documented trade-off, not an oversight: see this
 * middleware's own `README`-style note in DraggableWrapper.tsx and
 * RedactBox.tsx for where it is invoked.
 */
export default function visualViewportClamp({
  margin = VISUAL_VIEWPORT_CLAMP_MARGIN_PX,
  getExcludedRect,
}: {
  margin?: number;
  getExcludedRect?: () => DOMRect | null;
} = {}): Middleware {
  return {
    name: 'visualViewportClamp',
    fn(state) {
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      if (!vv) return {};
      const { x, y, rects, elements, placement } = state;
      const referenceEl = elements.reference;
      if (!(referenceEl instanceof Element)) return {};

      // offsetParent-relative (Floating UI's own `x`/`y`, `rects.reference`)
      // -> viewport-relative (`visualViewport`, `getBoundingClientRect()`):
      // established from the one element Floating UI already placed in both.
      const refViewportRect = referenceEl.getBoundingClientRect();
      const deltaX = refViewportRect.left - rects.reference.x;
      const deltaY = refViewportRect.top - rects.reference.y;

      const scale = currentScale();
      const layoutWidth = rects.floating.width;
      const layoutHeight = rects.floating.height;
      const visibleWidth = layoutWidth / scale;
      const visibleHeight = layoutHeight / scale;
      const origin = originFromPlacement(placement);

      // The visible box, anchored at the transform-origin corner - see the
      // file header on why this is not simply `{ x, y, visibleWidth,
      // visibleHeight }`.
      const left = x + deltaX + origin.x * (layoutWidth - visibleWidth);
      const top = y + deltaY + origin.y * (layoutHeight - visibleHeight);

      let minLeft = vv.offsetLeft + margin;
      const maxRight = vv.offsetLeft + vv.width - margin;
      let minTop = vv.offsetTop + margin;
      const maxBottom = vv.offsetTop + vv.height - margin;

      const excluded = getExcludedRect ? getExcludedRect() : null;
      if (excluded && excluded.bottom > minTop) {
        minTop = Math.min(excluded.bottom + margin, maxBottom);
      }

      // A box wider/taller than the room available cannot satisfy both
      // edges; pin it to the leading edge rather than let the two bounds of
      // `Math.min(Math.max(...))` fight each other.
      const clampedLeft = maxRight - visibleWidth >= minLeft
        ? Math.min(Math.max(left, minLeft), maxRight - visibleWidth)
        : minLeft;
      const clampedTop = maxBottom - visibleHeight >= minTop
        ? Math.min(Math.max(top, minTop), maxBottom - visibleHeight)
        : minTop;

      const shiftX = clampedLeft - left;
      const shiftY = clampedTop - top;
      if (!shiftX && !shiftY) return {};
      // The transform-origin term above is linear in `x`/`y` with
      // coefficient 1 regardless of which corner is anchored, so shifting
      // the *visible* box by (shiftX, shiftY) is always exactly shifting the
      // underlying, pre-scale Floating UI coordinates by the same amount.
      return { x: x + shiftX, y: y + shiftY };
    },
  };
}
