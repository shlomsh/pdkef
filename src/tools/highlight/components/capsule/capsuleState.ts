type CapsuleMode = 'dozing' | 'awake';
/** The capsule's own menus and the two it hosts: the zoom menu and the Marker's panel. */
export type CapsuleMenu = 'jump' | 'more' | 'zoom' | 'marker';

/** @testSeam */
export interface CapsuleState {
  mode: CapsuleMode;
  hovered: boolean;
  focused: boolean;
  /** Each open menu once: one closing never lets the capsule doze while another is open. */
  openMenus: readonly CapsuleMenu[];
  /** Sum of abs(dy) since the capsule woke. */
  scrolledSinceWake: number;
}

/** @testSeam */
export type CapsuleEvent =
  | { type: 'pointerEnter' }
  | { type: 'pointerLeave' }
  | { type: 'focusIn' }
  | { type: 'focusOut' }
  | { type: 'menuOpen'; menu: CapsuleMenu }
  | { type: 'menuClose'; menu: CapsuleMenu }
  | { type: 'scroll'; dy: number }
  | { type: 'pagePress' };

/** A little trackpad drift is not reading; past this much scrolling the reader has gone back to the page. @testSeam */
export const DOZE_SCROLL_PX = 24;

export const initialCapsule: CapsuleState = { mode: 'dozing', hovered: false, focused: false, openMenus: [], scrolledSinceWake: 0 };

const held = (s: CapsuleState) => s.hovered || s.focused || s.openMenus.length > 0;
const wake = (s: CapsuleState): CapsuleState => ({ ...s, mode: 'awake', scrolledSinceWake: 0 });
const doze = (s: CapsuleState): CapsuleState => (held(s) ? s : { ...s, mode: 'dozing', scrolledSinceWake: 0 });

/** Wakes when reached for; dozes only when the reader goes back to the page (R16 to R18). No timers. */
export function capsuleReducer(s: CapsuleState, e: CapsuleEvent): CapsuleState {
  switch (e.type) {
    case 'pointerEnter': return wake({ ...s, hovered: true });
    case 'focusIn': return wake({ ...s, focused: true });
    case 'menuOpen': return wake({ ...s, openMenus: s.openMenus.includes(e.menu) ? s.openMenus : [...s.openMenus, e.menu] });
    case 'pointerLeave': return { ...s, hovered: false };
    case 'focusOut': return { ...s, focused: false };
    case 'menuClose': return { ...s, openMenus: s.openMenus.filter((m) => m !== e.menu) };
    case 'pagePress': return doze(s);
    case 'scroll': {
      if (s.mode === 'dozing') return s;
      const sum = s.scrolledSinceWake + Math.abs(e.dy);
      return sum > DOZE_SCROLL_PX ? doze({ ...s, scrolledSinceWake: sum }) : { ...s, scrolledSinceWake: sum };
    }
  }
}
