import { h } from 'preact';
import { blurFraction, type BlurStrength } from '../model/blurStrength.ts';

/**
 * Visual interior for a Redact box. Geometry, handles, and toolbars stay in
 * the workspace adapter; per-type fill/filter/border treatment belongs to the
 * type (E7.4 - this is the sole paint owner for fill/blur/border, so a host
 * component must never re-derive these from `element.type` itself).
 *
 * Whiteout's border is intentionally omitted here: unlike blackout/blur's
 * static border, whiteout's border color is selection/hover-state-dependent
 * (highlighted while selected or hovered, transparent at rest) - that's
 * workspace-interaction chrome, not a redaction-surface visual, so it's owned
 * by the host's own CSS Module via `.active`/`.selected` classes instead.
 *
 * Blur's radius is a fraction of the box's own height, from blurStrength.ts.
 * Applying it in container query units (`cqh`, against a `containerType:
 * 'size'` ancestor) means the on-screen blur scales with the box exactly as
 * the export does, at any zoom, instead of a fixed pixel radius that only
 * matched at one size.
 *
 * RED-24: the fraction itself now depends on the box's height in page
 * points (`boxHeightPt`), not just its strength, because of the 24pt floor
 * in blurStrength.ts - a box under the floor needs a bigger fraction of
 * itself blurred to reach the same absolute radius. When the caller doesn't
 * know the box's height in points yet, `boxHeightPt` is left undefined and
 * `blurFraction` falls back to the plain, unfloored factor.
 */
function blurFilter(strength: unknown, boxHeightPt?: number): string {
  // Rounded so boxes of the same size write the same string, whatever float
  // noise their percent geometry carries.
  const fraction = Number(blurFraction(strength, boxHeightPt ?? NaN).toFixed(4));
  return `blur(calc(${fraction} * 100cqh))`;
}

/**
 * RED-30: the slider's live paint. While the knob moves, the box's blur layer
 * is rewritten straight in the DOM (the gesture golden rule: no state, no
 * store per input event); the one commit on release re-renders the same
 * string. The box is found by `data-redact-box-id`, so it works from a
 * toolbar portalled out of the box. Returns whether a layer was painted.
 */
export function paintBlurStrength(root: ParentNode, elementId: string, strength: number): boolean {
  const box = Array.from(root.querySelectorAll<HTMLElement>('[data-redact-box-id]'))
    .find((node) => node.dataset.redactBoxId === elementId);
  const layer = box?.querySelector<HTMLElement>('.redact-surface__blur');
  if (!layer) return false;
  const pt = Number(layer.dataset.boxHeightPt);
  const filter = blurFilter(strength, Number.isFinite(pt) && layer.dataset.boxHeightPt ? pt : undefined);
  layer.style.backdropFilter = filter;
  layer.style.setProperty('-webkit-backdrop-filter', filter);
  return true;
}

function blurLayer(strength?: BlurStrength, boxHeightPt?: number) {
  const filter = blurFilter(strength, boxHeightPt);
  return h('div', {
    class: 'redact-surface__blur',
    'data-box-height-pt': boxHeightPt === undefined ? undefined : String(boxHeightPt),
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      backdropFilter: filter,
      WebkitBackdropFilter: filter,
    },
  });
}

export function renderRedactionSurface(kind: 'blackout' | 'blur' | 'whiteout', color?: string, strength?: BlurStrength, boxHeightPt?: number) {
  const isBlur = kind === 'blur';
  const isWhiteout = kind === 'whiteout';
  return h('div', {
    class: `redact-surface redact-surface--${kind}`,
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      containerType: 'size',
      backgroundColor: isBlur ? 'rgba(255,255,255,0.1)' : (color || (isWhiteout ? '#ffffff' : '#000000')),
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
      border: isBlur ? '1px solid rgba(0,0,0,0.2)' : (isWhiteout ? 'none' : '1px solid #333'),
    },
  }, isBlur ? blurLayer(strength, boxHeightPt) : null);
}

/**
 * Paint for the in-progress drag-draw preview, before a box becomes a real
 * element - deliberately not identical to renderRedactionSurface's committed
 * look (translucent, dashed, reads as "not final yet"), but the same module
 * should decide that for every type. This used to be a second copy living in
 * PdfRedactTool.tsx that re-derived fill/blur/border from `drawingState.type`
 * with its own raw color literals, in the one file the sole-owner comment
 * above does not reach.
 */
export function redactionDrawingPreviewStyle(kind: 'blackout' | 'blur' | 'whiteout', color?: string) {
  const isBlur = kind === 'blur';
  const isWhiteout = kind === 'whiteout';
  return {
    backgroundColor: isBlur ? 'rgba(255,255,255,0.1)' : (isWhiteout ? color : 'rgba(0, 0, 0, 0.7)'),
    opacity: isWhiteout && color !== '#000000' ? 0.7 : 1,
    containerType: isBlur ? 'size' : undefined,
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    border: isBlur || isWhiteout ? '2px dashed #000' : '2px dashed #ff4757',
  };
}

/**
 * The preview's blur layer content, or null for non-blur kinds.
 *
 * `boxHeightPt` is normally left undefined here: the drag-draw preview's own
 * geometry is written straight to the DOM during the gesture (the golden
 * rule - see controller.ts), never through this component's own re-render,
 * so no render of this preview ever has a live, correct box height to give
 * `blurFraction`. `blurFraction` reads that absence as "not known yet" and
 * falls back to the plain factor, which is what the preview showed before
 * RED-24 too.
 */
export function renderRedactionDrawingPreviewContent(kind: 'blackout' | 'blur' | 'whiteout', strength?: BlurStrength, boxHeightPt?: number) {
  return kind === 'blur' ? blurLayer(strength, boxHeightPt) : null;
}
