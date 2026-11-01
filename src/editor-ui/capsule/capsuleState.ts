export type CapsuleMode = 'dozing' | 'awake';

export interface CapsuleState {
  mode: CapsuleMode;
  hovered: boolean;
  focused: boolean;
  menuOpen: boolean;
  /** Sum of abs(dy) since the capsule woke. */
  scrolledSinceWake: number;
}

export type CapsuleEvent =
  | { type: 'pointerEnter' }
  | { type: 'pointerLeave' }
  | { type: 'focusIn' }
  | { type: 'focusOut' }
  | { type: 'menuOpen' }
  | { type: 'menuClose' }
  | { type: 'scroll'; dy: number }
  | { type: 'pagePress' };

/** A little trackpad drift is not reading; past this much scrolling the reader has gone back to the page. */
export const DOZE_SCROLL_PX = 24;

export const initialCapsule: CapsuleState = { mode: 'dozing', hovered: false, focused: false, menuOpen: false, scrolledSinceWake: 0 };

const held = (s: CapsuleState) => s.hovered || s.focused || s.menuOpen;
const wake = (s: CapsuleState): CapsuleState => ({ ...s, mode: 'awake', scrolledSinceWake: 0 });
const doze = (s: CapsuleState): CapsuleState => (held(s) ? s : { ...s, mode: 'dozing', scrolledSinceWake: 0 });

/** Wakes when reached for; dozes only when the reader goes back to the page (R16 to R18). No timers. */
export function capsuleReducer(s: CapsuleState, e: CapsuleEvent): CapsuleState {
  switch (e.type) {
    case 'pointerEnter': return wake({ ...s, hovered: true });
    case 'focusIn': return wake({ ...s, focused: true });
    case 'menuOpen': return wake({ ...s, menuOpen: true });
    case 'pointerLeave': return { ...s, hovered: false };
    case 'focusOut': return { ...s, focused: false };
    case 'menuClose': return { ...s, menuOpen: false };
    case 'pagePress': return doze(s);
    case 'scroll': {
      if (s.mode === 'dozing') return s;
      const sum = s.scrolledSinceWake + Math.abs(e.dy);
      return sum > DOZE_SCROLL_PX ? doze({ ...s, scrolledSinceWake: sum }) : { ...s, scrolledSinceWake: sum };
    }
  }
}
