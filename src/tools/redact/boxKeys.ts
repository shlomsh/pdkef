// Keyboard intent for one redaction box: key + modifiers in, intent out.
// Pure, so the component stays a thin dispatcher. Arrow steps are in page
// points; boxMovePatch turns one into the same percent patch a drag commits.

export type BoxKeyIntent =
  | { kind: 'select' }
  | { kind: 'deselect' }
  | { kind: 'delete' }
  | { kind: 'move'; dx: number; dy: number };

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function boxKeyIntent(
  key: string,
  mods: { shift?: boolean; ctrl?: boolean; meta?: boolean; alt?: boolean },
  opts: { isSelected: boolean; isStroke: boolean },
): BoxKeyIntent | null {
  if (mods.ctrl || mods.meta || mods.alt) return null;
  // Space is the page-wide peek (usePeekAll), so only Enter selects.
  if (key === 'Enter') return { kind: 'select' };
  if (key === 'Escape') return opts.isSelected ? { kind: 'deselect' } : null;
  if (key === 'Delete' || key === 'Backspace') return { kind: 'delete' };
  const arrow = ARROWS[key];
  if (arrow && opts.isSelected && !opts.isStroke) {
    const step = mods.shift ? 10 : 1;
    return { kind: 'move', dx: arrow[0] * step, dy: arrow[1] * step };
  }
  return null;
}

/** Moves a box by (dx, dy) page points, clamped inside the page like a drag. */
export function boxMovePatch(
  el: { left: number; top: number; width: number; height: number },
  dx: number,
  dy: number,
  pageWidthPoints: number,
  pageHeightPoints: number,
): { left: number; top: number } | null {
  if (!(pageWidthPoints > 0) || !(pageHeightPoints > 0)) return null;
  const left = Math.max(0, Math.min(100 - el.width, el.left + (dx / pageWidthPoints) * 100));
  const top = Math.max(0, Math.min(100 - el.height, el.top + (dy / pageHeightPoints) * 100));
  return { left, top };
}

const LABELS: Record<string, string> = {
  blur: 'Blur box',
  blackout: 'Blackout box',
  whiteout: 'Whiteout box',
  blurStroke: 'Blur stroke',
  whiteoutStroke: 'Whiteout stroke',
};

export const boxAriaLabel = (type: string): string => LABELS[type] ?? 'Box';
