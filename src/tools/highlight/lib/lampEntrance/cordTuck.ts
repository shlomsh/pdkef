/** Whether the pull cord is tucked into the toolbar: scrolling away from where it last hung tucks it, a pop (or the lamp hiding it) re-anchors. */
type CordTuck = { tucked: boolean; anchor: number };
export type CordTuckEvent = { type: 'scroll' | 'pop' | 'hidden'; y: number };

const TUCK_DISTANCE = 12;

export const initialCordTuck = (y: number): CordTuck => ({ tucked: false, anchor: y });

export function cordTuck(state: CordTuck, event: CordTuckEvent): CordTuck {
  if (event.type === 'scroll') {
    const tucked = Math.abs(event.y - state.anchor) > TUCK_DISTANCE;
    return tucked === state.tucked ? state : { tucked, anchor: state.anchor };
  }
  return !state.tucked && state.anchor === event.y ? state : { tucked: false, anchor: event.y };
}
