import { h } from 'preact';

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
 */
export function renderRedactionSurface(kind: 'blackout' | 'blur' | 'whiteout', color?: string) {
  const isBlur = kind === 'blur';
  const isWhiteout = kind === 'whiteout';
  return h('div', {
    class: `redact-surface redact-surface--${kind}`,
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      backgroundColor: isBlur ? 'rgba(255,255,255,0.1)' : (color || (isWhiteout ? '#ffffff' : '#000000')),
      backdropFilter: isBlur ? 'blur(8px)' : 'none',
      WebkitBackdropFilter: isBlur ? 'blur(8px)' : 'none',
      border: isBlur ? '1px solid rgba(0,0,0,0.2)' : (isWhiteout ? 'none' : '1px solid #333'),
    },
  });
}
