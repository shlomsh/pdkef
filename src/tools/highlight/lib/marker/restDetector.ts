export const REST = { awayPx: 12, stillPx: 3, restMs: 700 } as const;

interface Point { x: number; y: number }
export interface RestState {
  blockedFrom: Point | null;
  candidate: { id: string; x: number; y: number; since: number } | null;
  opened: string | null;
}
export type RestEvent =
  | { type: 'strokeEnd'; x: number; y: number }
  | { type: 'move'; x: number; y: number; t: number; overId: string | null }
  | { type: 'tick'; t: number }
  | { type: 'leave' }
  | { type: 'closed' };

export const initialRest: RestState = { blockedFrom: null, candidate: null, opened: null };

export function restReducer(s: RestState, e: RestEvent): RestState {
  switch (e.type) {
    case 'strokeEnd':
      return { ...s, blockedFrom: { x: e.x, y: e.y }, candidate: null };
    case 'move': {
      if (s.blockedFrom) {
        if (Math.hypot(e.x - s.blockedFrom.x, e.y - s.blockedFrom.y) <= REST.awayPx) return s;
        s = { ...s, blockedFrom: null };
      }
      if (e.overId === null) return s.candidate ? { ...s, candidate: null } : s;
      const c = s.candidate;
      if (c && c.id === e.overId && Math.hypot(e.x - c.x, e.y - c.y) <= REST.stillPx) return s;
      return { ...s, candidate: { id: e.overId, x: e.x, y: e.y, since: e.t } };
    }
    case 'tick':
      if (!s.candidate || s.opened !== null || e.t - s.candidate.since < REST.restMs) return s;
      return { ...s, opened: s.candidate.id };
    case 'leave':
      return { ...s, candidate: null, opened: null };
    case 'closed':
      return s.opened === null ? s : { ...s, opened: null };
  }
}

/** When the component should next send a tick, or null when nothing is waiting. */
export function nextTickAt(s: RestState): number | null {
  return s.candidate && s.opened === null ? s.candidate.since + REST.restMs : null;
}
