import { pageAnchorAt } from '../zoom/pageAnchor.ts';
import { beadStart, circleOf, flipTransform, type Circle, type Rect, type Size } from './geometry.ts';
import { enterPlan, exitPlan, reducedPlan, type Part, type Plan } from './timeline.ts';

/** The DOM side of the lamp's choreography: finds the parts, measures them, and picks the plan. Reads layout only. */

type Direction = 'enter' | 'exit';

/** What is measured at the press, before the view changes. */
export interface Before {
  direction: Direction;
  viewport: Size;
  pageIndex: number;
  page: Rect | null;
  /** Entering: the bead at rest and the top of its cord. */
  bead: Circle | null;
  cordTop: number | null;
  /** Leaving: the capsule's pill. */
  capsule: Rect | null;
}

/** The tool's parent holds the tile row's cord as well as the workspace, so the parts are found from there. */
const rootOf = (ws: HTMLElement): ParentNode => ws.parentElement ?? ws;
const rectOf = (el: Element): Rect => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
const viewportNow = (): Size => ({ width: window.innerWidth, height: window.innerHeight });

/** The nodes a part names; the site is whatever the tile row's wrapper holds. */
export function partsIn(ws: HTMLElement): (part: Part) => Element[] {
  const root = rootOf(ws);
  return (part) => [...root.querySelectorAll(part === 'site' ? '[data-lamp-part="site"] > *' : `[data-lamp-part="${part}"]`)];
}

function capsuleRect(ws: HTMLElement): Rect | null {
  const pill = ws.querySelector('[data-lamp-part="capsule"] [role="toolbar"]');
  return pill ? rectOf(pill) : null;
}

const beadOf = (ws: HTMLElement): Circle | null => {
  const bead = rootOf(ws).querySelector('[data-lamp-bead]');
  return bead ? circleOf(rectOf(bead)) : null;
};

const pageRects = (ws: HTMLElement): Rect[] => [...ws.querySelectorAll('[data-page-wrapper]')].map(rectOf);

/** The page the reader is looking at: it is the one that flies, so it must be the same page before and after. */
export function measureBefore(direction: Direction, ws: HTMLElement): Before {
  const viewport = viewportNow();
  const rects = pageRects(ws);
  const view = direction === 'enter' ? { x: viewport.width / 2, y: viewport.height / 2 } : { x: rectOf(ws).left + rectOf(ws).width / 2, y: rectOf(ws).top + rectOf(ws).height / 2 };
  const pageIndex = pageAnchorAt(rects, view)?.pageIndex ?? 0;
  const cord = rootOf(ws).querySelector('[data-lamp-part="cord"]');
  return {
    direction, viewport, pageIndex, page: rects[pageIndex] ?? null,
    bead: direction === 'enter' ? beadOf(ws) : null,
    cordTop: direction === 'enter' && cord ? rectOf(cord).top : null,
    capsule: direction === 'exit' ? capsuleRect(ws) : null,
  };
}

/** The reduced-motion preference, read when the lamp turns. */
function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true; } catch { return false; // expected: matchMedia is missing where there is no window, and then motion is welcome
  }
}

const boardFlip = (ws: HTMLElement, before: Before | null): string | undefined => {
  const after = before?.page && pageRects(ws)[before.pageIndex];
  return before?.page && after && after.width > 0 ? flipTransform(before.page, after) : undefined;
};

/**
 * Called once the other view has laid out: the plan for the way in or out, and the capsule's pill to remember for a
 * way out nobody pressed (Esc). Anything missing from the measuring falls back to the crossfade.
 */
export function planAfter(direction: Direction, ws: HTMLElement, before: Before | null, remembered: Rect | null): { plan: Plan; capsule: Rect | null } {
  const viewport = viewportNow();
  const planned = before?.direction === direction ? before : null;
  if (prefersReducedMotion()) return { plan: reducedPlan(direction), capsule: remembered };
  if (direction === 'enter') {
    const capsule = capsuleRect(ws);
    if (!capsule || !planned?.bead || planned.cordTop === null) return { plan: reducedPlan('enter'), capsule };
    const capsuleCx = capsule.left + capsule.width / 2;
    const resized = planned.viewport.width !== viewport.width || planned.viewport.height !== viewport.height;
    const bead = beadStart({ bead: planned.bead, before: planned.viewport, viewport, capsuleCx });
    const cordTop = resized ? bead.cy - bead.r : planned.cordTop;
    return { plan: enterPlan({ bead, capsule, cordTop, viewport, board: boardFlip(ws, planned) }), capsule };
  }
  const capsule = planned?.capsule ?? remembered;
  const bead = beadOf(ws);
  if (!capsule || !bead) return { plan: reducedPlan('exit'), capsule };
  return { plan: exitPlan({ bead, capsule, cordTop: 0, viewport, board: boardFlip(ws, planned) }), capsule };
}
