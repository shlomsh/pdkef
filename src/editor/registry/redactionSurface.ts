import { h } from 'preact';

/** Visual interior for a Redact box. Geometry, handles, and toolbars stay in
 * the workspace adapter; per-type fill/filter treatment belongs to the type. */
export function renderRedactionSurface(kind: 'blackout' | 'blur' | 'whiteout', color?: string) {
  const isBlur = kind === 'blur';
  return h('div', {
    class: `redact-surface redact-surface--${kind}`,
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      backgroundColor: isBlur ? 'rgba(255,255,255,0.1)' : (color || (kind === 'whiteout' ? '#ffffff' : '#000000')),
      backdropFilter: isBlur ? 'blur(8px)' : 'none',
      WebkitBackdropFilter: isBlur ? 'blur(8px)' : 'none',
    },
  });
}
