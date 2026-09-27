import { h } from 'preact';
import { blurFactor, type BlurStrength } from '../model/blurStrength.ts';

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
 */
function blurLayer(strength?: BlurStrength) {
  const filter = `blur(calc(${blurFactor(strength)} * 100cqh))`;
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

export function renderRedactionSurface(kind: 'blackout' | 'blur' | 'whiteout', color?: string, strength?: BlurStrength) {
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
  }, isBlur ? blurLayer(strength) : null);
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

/** The preview's blur layer content, or null for non-blur kinds. */
export function renderRedactionDrawingPreviewContent(kind: 'blackout' | 'blur' | 'whiteout', strength?: BlurStrength) {
  return kind === 'blur' ? blurLayer(strength) : null;
}
