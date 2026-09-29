import { h } from 'preact';
import { blurFraction, type BlurStrength } from '../model/blurStrength.ts';
import { strokeSvgInPoints } from '../model/strokeGeometry.ts';
import type { BlurStrokeElement, WhiteoutStrokeElement } from '../model/editorModel.ts';

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
function blurLayer(strength?: BlurStrength, boxHeightPt?: number) {
  // Rounded so boxes of the same size write the same string, whatever float
  // noise their percent geometry carries.
  const fraction = Number(blurFraction(strength, boxHeightPt ?? NaN).toFixed(4));
  const filter = `blur(calc(${fraction} * 100cqh))`;
  return h('div', {
    class: 'redact-surface__blur',
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

/**
 * RED-32: a brush stroke's paint. Both kinds draw the same round-capped,
 * round-joined polyline that redact.js strokes on the export canvas, in page
 * points inside the stroke's own bbox, so the brush stays round at any zoom.
 *
 * A whiteout stroke is an inline SVG path in its color. A blur stroke is the
 * blur box's backdrop-filter, masked to the stroke shape with `mask-image`
 * (an SVG data URI of the same path; img-src already allows `data:`), its
 * radius the blur rule applied to the brush diameter. The page's size in
 * points is needed to convert percent geometry to points; a host that does
 * not know the width yet (Redact once passed 0) gets a US Letter ratio from
 * the height rather than a wrong-shaped brush.
 */
export function renderStrokeSurface(
  stroke: BlurStrokeElement | WhiteoutStrokeElement,
  pageWidthPt?: number,
  pageHeightPt?: number,
) {
  const heightPt = pageHeightPt && pageHeightPt > 0 ? pageHeightPt : 792;
  const widthPt = pageWidthPt && pageWidthPt > 0 ? pageWidthPt : heightPt * (612 / 792);
  const svg = strokeSvgInPoints(stroke, widthPt, heightPt);

  if (stroke.type === 'whiteoutStroke') {
    return h('svg', {
      class: 'redact-surface redact-surface--whiteoutStroke',
      viewBox: svg.viewBox,
      preserveAspectRatio: 'none',
      'aria-hidden': 'true',
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' },
    }, h('path', {
      d: svg.d,
      fill: 'none',
      stroke: stroke.color || '#ffffff',
      'stroke-width': svg.strokeWidth,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }));
  }

  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${svg.viewBox}" preserveAspectRatio="none">`
    + `<path d="${svg.d}" fill="none" stroke="#000" stroke-width="${svg.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const mask = `url("data:image/svg+xml,${encodeURIComponent(maskSvg)}")`;
  // Radius = blurFraction(strength, diameter) x diameter, in points; the
  // container's height in points turns it into the fraction of 100cqh.
  const bboxHeightPt = (stroke.height / 100) * heightPt;
  const radiusPt = blurFraction(stroke.strength, stroke.sizePt) * stroke.sizePt;
  const fraction = bboxHeightPt > 0 ? Number((radiusPt / bboxHeightPt).toFixed(4)) : 0;
  const filter = `blur(calc(${fraction} * 100cqh))`;
  return h('div', {
    class: 'redact-surface redact-surface--blurStroke',
    style: { position: 'absolute', inset: 0, pointerEvents: 'none', containerType: 'size' },
  }, h('div', {
    class: 'redact-surface__blur',
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      backgroundColor: 'rgba(255,255,255,0.1)',
      backdropFilter: filter,
      WebkitBackdropFilter: filter,
      maskImage: mask,
      WebkitMaskImage: mask,
      maskSize: '100% 100%',
      WebkitMaskSize: '100% 100%',
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
    },
  }));
}
