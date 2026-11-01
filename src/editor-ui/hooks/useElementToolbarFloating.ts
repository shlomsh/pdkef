import { useFloating, offset, shift, size, autoUpdate } from '@floating-ui/react';
import { TOOLBAR_FLOATING_OFFSET } from '#editor/model/signGeometry.js';
import useVisualViewportScale from './useVisualViewportScale.ts';
import visualViewportClamp, { toolbarScaleOriginCss, getStickyToolShellRect } from './visualViewportClamp.ts';

// How far a coarse-pointer `.element-button`'s 44px hit area overhangs the
// button itself: `::before { inset: -8px }` in EditorControls.module.css. Kept
// beside the offset it corrects rather than exported from the stylesheet,
// because a CSS Module cannot export a number; if that inset ever changes,
// this has to change with it.
const COARSE_HIT_OVERHANG_PX = 8;

/** Sign's element toolbar placement: above the element, anchored to its start edge (end edge for RTL), kept inside the page and the visual viewport, constant physical size under zoom. */
export default function useElementToolbarFloating({ rtl, coarse }: { rtl: boolean; coarse: boolean }): {
  setReference(node: Element | null): void;
  setFloating(node: HTMLElement | null): void;
  /** floatingStyles plus the counter-scale transform and its origin, ready for `style`. */
  style: Record<string, string | number | undefined>;
  update(): void;
} {
  // Keep the toolbar anchored above the selected element. Earlier versions used
  // Floating UI's vertical `flip()`, but a slightly over-eager overflow reading
  // could move the toolbar to `bottom-*`, visually jumping it under the text.
  // We still delegate measurement to Floating UI and still use `shift()` so the
  // toolbar is constrained to the PDF page horizontally, but vertical placement
  // stays stable. This preserves the editor's old mental model: select an
  // element, toolbar appears above it; LTR hugs the left edge, RTL hugs the
  // right edge.
  //
  // Horizontal alignment is driven by Floating UI's `placement` ('top-end'
  // for RTL text, 'top-start' otherwise), not by page-clamp math in this
  // component. That preserves the fundamental anchor: LTR toolbars begin at
  // the element's left edge, RTL toolbars end at its right edge.
  //
  // `shift()` can only slide the toolbar inside the page, never shrink it. A
  // text toolbar's dozen controls are wider than a phone-width page, and since
  // nothing up to <html> clips overflow-x (`.tool-card` must not, for its
  // sticky action row), the spill past the page edge became real document
  // horizontal scroll: the whole app could be dragged sideways on a phone,
  // even before anything was selected, because the bar is always rendered
  // (only its opacity follows selection). `size()` runs after `shift()` so it
  // measures the room from the shifted position, and caps the bar's width to
  // it; `.actions` wraps onto a second row (`flex-wrap`) rather than spilling.
  //
  // MOBI-17: `boundary` pins the clipping element to the page wrapper, but by
  // default Floating UI *also* intersects that with `rootBoundary: 'viewport'`,
  // which `getViewportRect` reads off `visualViewport.width/height` - the
  // *zoomed* size. So on an auto-zoomed or pinched phone the cap shrank with
  // the zoom even though the page wrapper's own CSS width never changed,
  // which is what forced the bar into more rows exactly when it was also
  // being rendered larger (the ticket's "penalised twice"). `rootBoundary:
  // 'document'` drops that intersection, so the cap (and `shift()`'s clamp)
  // is a function of the page wrapper's static layout rect alone - the same
  // rect at every zoom level. Combined with the counter-scale transform below
  // (which shrinks the *rendered* bar back down by 1/scale), a layout-space
  // cap that no longer moves means both the wrap point (row count) and the
  // physical on-screen size stay constant under zoom - the two halves of the
  // acceptance criterion - without needing to recompute anything in JS on
  // every pinch step. The gap this alone does not close: at extreme zoom the
  // page wrapper can be wider than what is currently panned into view, so a
  // toolbar shifted to sit within the *whole* wrapper is not guaranteed to
  // sit within the currently visible slice of it - `visualViewportClamp`
  // below is the middleware that closes it, reading `window.visualViewport`
  // directly after `shift()`/`size()` have done their own zoom-invariant job.
  const getFloatingBoundary = (reference: Element | null) =>
    reference?.closest?.('[data-page-wrapper]') || 'clippingAncestors';
  const floatingBoundary = ({ elements }: { elements: { reference: unknown } }) =>
    getFloatingBoundary(elements.reference instanceof Element ? elements.reference : null);
  // Measured, not derived: at the plain 8px offset a tap aimed at a short text
  // box (5.8px tall on the health-declaration form) landed on the bar above
  // it instead - Delete in one run, destroying what had just been typed,
  // Duplicate in another, cloning the element into the export on every tap.
  // At 16px it does not (touch-edit-reentry.spec.js, proven red-to-green).
  // The geometry alone does not explain it: the bar's 4px padding means a
  // button's 44px hit area overhangs the bar by only 4px, which should stop
  // short of the box. The likely mechanism is the browser's own touch-target
  // adjustment, which moves a touch onto the nearest clickable element
  // within the finger's radius - so a real finger, wider than a test's,
  // may need more clearance still. MOBI-23 tracks proving that on a device.
  // Desktop keeps 8px: a mouse is a point, and nothing is adjusted.
  const toolbarOffsetPx = coarse ? TOOLBAR_FLOATING_OFFSET + COARSE_HIT_OVERHANG_PX : TOOLBAR_FLOATING_OFFSET;
  const { refs, floatingStyles, update } = useFloating({
    placement: rtl ? 'top-end' : 'top-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      // MOBI-17: the gap itself moves out of `offset()` and into a
      // scale-corrected CSS `translateY` below (`toolbarOffsetPx` still
      // carries the measured value above). `offset()`'s own contribution is a
      // literal, unscaled pixel push baked straight into `floatingStyles`'
      // `translate(...)`; under pinch/auto-zoom the browser magnifies that
      // literal push along with everything else on the page, so an unscaled
      // 8px gap grows to `8 * scale` on screen while the counter-scaled bar
      // itself does not - the offset would visibly drift away from the
      // element it is supposed to sit flush against as zoom increases.
      // Floating UI's own `autoUpdate` has no `visualViewport` trigger (it
      // only watches ancestor scroll/resize, `ResizeObserver` and an
      // intersection-based move detector - none of which fire from a pinch
      // that does not scroll), so recomputing `offset()` in JS on zoom would
      // mean this component driving its own extra `visualViewport` listener
      // and calling `update()` on every element's `useFloating` instance on
      // every zoom step - the exact per-element re-render storm
      // `useVisualViewportScale` exists to avoid. A pure CSS `calc()` against
      // `--vv-scale` has no such cost: it is not simply "add extra distance",
      // it is a literal-in-layout-space value like `offset()`'s own was.
      offset(0),
      shift((state) => ({
        boundary: floatingBoundary(state),
        rootBoundary: 'document',
        padding: TOOLBAR_FLOATING_OFFSET,
      })),
      size((state) => ({
        boundary: floatingBoundary(state),
        rootBoundary: 'document',
        padding: TOOLBAR_FLOATING_OFFSET,
        apply({ availableWidth, elements }) {
          elements.floating.style.maxWidth = `${Math.max(0, availableWidth)}px`;
        },
      })),
      // MOBI-17: `shift()`/`size()` above hold the bar's physical size and
      // row count constant by measuring against the page wrapper's own
      // static rect, which is deliberately zoom-invariant - but that means
      // they can place the bar anywhere within the *whole* wrapper, not only
      // within whatever slice of it a pinch-zoomed, panned phone currently
      // shows. This middleware is the missing containment check: it reads
      // `window.visualViewport` directly and clamps into it, after
      // `shift()`/`size()` have already done their own job. Full reasoning
      // in visualViewportClamp.ts's own header.
      visualViewportClamp({ getExcludedRect: getStickyToolShellRect }),
    ]
  });
  // MOBI-17: subscribes this element's toolbar to the shared, ref-counted
  // `--vv-scale` publisher (see the hook's own header) and to its
  // visualViewport change broadcast, which calls this bar's own Floating UI
  // `update()` so `visualViewportClamp` above (and the physical-size cap) are
  // recomputed on every pinch/pan step - `autoUpdate` has no `visualViewport`
  // listener of its own. Every DraggableWrapper on the page calls this - up
  // to 81 on the income-tax-101 fixture - but only one `visualViewport`
  // listener is ever live for all of them, and none of them re-render when
  // it fires (this hook writes CSSOM/calls `update()` directly, never Preact
  // state).
  useVisualViewportScale(update);
  // MOBI-17: the corner of the bar that actually touches the element, so
  // `scale()` below shrinks the bar *away* from that corner rather than from
  // its own center - the placement never flips vertically here (see the
  // comment above `useFloating`), so it is always the bar's bottom edge, and
  // horizontally it is whichever edge `placement` anchors: left for LTR
  // (`top-start`), right for RTL (`top-end`). Shared with
  // `visualViewportClamp`'s own origin math (`visualViewportClamp.ts`) so the
  // two can never disagree about which corner is fixed.
  const toolbarScaleOrigin = toolbarScaleOriginCss(rtl ? 'top-end' : 'top-start');
  // `scale` is last in the transform list, so per the CSS Transforms
  // composition order every translate listed before it (Floating UI's own
  // placement `translate(...)`, and the offset translate added here) is a
  // literal, unscaled displacement applied *after* the scaling, about
  // `transformOrigin` - i.e. it moves the anchored corner itself, which
  // `scale()` then leaves untouched. Dividing by `--vv-scale` is what keeps
  // that corner's placement, and this added gap, at a constant physical
  // distance from the element under zoom (mirrors the `size()`/`shift()`
  // comment above for the cap). This is an inline `style` object, not a
  // literal `style="..."` string, so Preact writes it via per-property
  // CSSOM (`style.setProperty`) the same as every other runtime-geometry
  // write in the editor - exempt from `style-src`, per csp-scripts-pwa.md.
  const toolbarTransform = `${floatingStyles.transform || ''} translateY(calc(-1 * ${toolbarOffsetPx}px / var(--vv-scale, 1))) scale(calc(1 / var(--vv-scale, 1)))`;

  return {
    setReference: refs.setReference,
    setFloating: refs.setFloating,
    style: { ...floatingStyles, transform: toolbarTransform, transformOrigin: toolbarScaleOrigin },
    update,
  };
}
