/**
 * SNG-04: the one-gesture-at-a-time interaction sub-machine.
 *
 * docs/sign-next-gen-guidelines.md §2.1 ("gesture: exactly one of drag, resize,
 * create or pinch at a time") and §2.2 (touch), §2.3 (mouse); sign-next-gen.md
 * §5.3-5.4. Pure and synchronous: `transition` has no clock, DOM or framework,
 * and `createGestureMachine().send` runs the effects in the caller's stack (the
 * MOBI-24 rule: never useReducer plus useEffect). The state is a discriminated
 * union, so "two gestures at once" and "a pinch with a drag" cannot be built.
 */
import { SLOP_PX, TAP_MAX_DURATION_MS } from './constants.ts';
import { touchClaimsElement } from '../gestures/touchClaim.ts';

export type PointerKind = 'touch' | 'mouse' | 'pen';
export interface Point {
  x: number;
  y: number;
}

/** What is under the finger at pointer down, as the router measured it. */
export type Under =
  | {
      kind: 'blank';
      /** a tool that draws by dragging is armed */ armedCreate: boolean;
    }
  /** `wasSelected`: selected BEFORE this touch began (§2.2). */
  | { kind: 'element'; wasSelected: boolean }
  /** A resize handle; handles only exist on a selected element. */
  | { kind: 'handle' };

interface PointerSample extends Point {
  pointerId: number;
  pointerType: PointerKind;
  /** ms, any monotonic clock. */
  t: number;
}
export type GestureEvent =
  | ({ type: 'down'; under: Under } & PointerSample)
  | ({ type: 'move' } & PointerSample)
  | ({ type: 'up' } & PointerSample)
  | ({ type: 'cancel' } & PointerSample);

export type OneFingerGesture = 'drag' | 'resize' | 'create';
interface Finger {
  pointerId: number;
  pointerType: PointerKind;
  origin: Point;
  at: Point;
}
export interface Contact extends Point {
  pointerId: number;
}

export type GestureState =
  | { kind: 'idle' }
  /** Down, not yet classified: a tap, or a move past the slop. */
  | { kind: 'pending'; finger: Finger; under: Under; startedAt: number }
  /** The finger belongs to the browser's native scroll; the machine only watches. */
  | { kind: 'scroll'; finger: Finger }
  | { kind: OneFingerGesture; finger: Finger }
  | PinchState;
type PinchState = { kind: 'pinch'; a: Contact; b: Contact };

export type GestureEffect =
  | { type: 'tap'; under: Under; x: number; y: number }
  /** Mouse only: an unselected element is selected as the same gesture moves it (§2.3). */
  | { type: 'select' }
  | { type: 'begin'; gesture: OneFingerGesture; origin: Point }
  | { type: 'update'; gesture: OneFingerGesture; origin: Point; at: Point }
  | { type: 'commit'; gesture: OneFingerGesture }
  /** Restore the DOM, commit nothing. */
  | { type: 'cancel'; gesture: OneFingerGesture }
  | { type: 'pinch-start'; a: Contact; b: Contact }
  | { type: 'pinch-update'; a: Contact; b: Contact }
  | { type: 'pinch-end' };

export interface Transition {
  state: GestureState;
  effects: GestureEffect[];
}

export const IDLE: GestureState = { kind: 'idle' };
const stay = (state: GestureState): Transition => ({ state, effects: [] });

/**
 * What a moving finger turns into. `null`: nothing to claim (a mouse dragging
 * the blank page), so the sequence stays a pending click.
 * §2.2: a touch never moves an element that was not selected before it began;
 * that rule is `touchClaimsElement`, which this module only asks.
 */
function claim(under: Under, pointerType: PointerKind): OneFingerGesture | 'scroll' | null {
  const touch = pointerType === 'touch';
  if (under.kind === 'handle') return 'resize';
  if (under.kind === 'element') {
    const claimed = touchClaimsElement({
      touchNeedsSelection: true,
      wasSelected: under.wasSelected,
    });
    return touch && !claimed ? 'scroll' : 'drag';
  }
  if (under.armedCreate) return 'create';
  return touch ? 'scroll' : null;
}

/** §2.5 slop for touch; §2.3 a mouse starts on the first pixel. */
function crossedSlop(finger: Finger): boolean {
  const moved = Math.hypot(finger.at.x - finger.origin.x, finger.at.y - finger.origin.y);
  return moved > 0 && moved >= (finger.pointerType === 'touch' ? SLOP_PX : 0);
}

/** The one finger a one-finger state follows. */
type FingerState = Exclude<GestureState, { kind: 'idle' } | PinchState>;
function fingerState(state: GestureState): FingerState | undefined {
  return state.kind === 'idle' || state.kind === 'pinch' ? undefined : state;
}
/** Events from any other pointer are not this gesture's business. */
const isOwn = (state: FingerState, event: GestureEvent) =>
  state.finger.pointerId === event.pointerId;

function onDown(state: GestureState, event: GestureEvent & { type: 'down' }): Transition {
  if (state.kind === 'idle') {
    const at = { x: event.x, y: event.y };
    const finger = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      origin: at,
      at,
    };
    return {
      state: {
        kind: 'pending',
        finger,
        under: event.under,
        startedAt: event.t,
      },
      effects: [],
    };
  }
  // §2.2: a second finger at any phase, before commit, cancels the one-finger
  // claim and the two contacts pinch. Touch only: a mouse is unaffected (§2.3).
  const live = fingerState(state);
  const first = live?.finger;
  if (
    live &&
    first &&
    first.pointerType === 'touch' &&
    event.pointerType === 'touch' &&
    first.pointerId !== event.pointerId
  ) {
    const a: Contact = { pointerId: first.pointerId, ...first.at };
    const b: Contact = { pointerId: event.pointerId, x: event.x, y: event.y };
    // Pending and scroll have painted nothing, so only a live gesture needs undoing.
    const undo: GestureEffect[] =
      live.kind === 'pending' || live.kind === 'scroll'
        ? []
        : [{ type: 'cancel', gesture: live.kind }];
    return {
      state: { kind: 'pinch', a, b },
      effects: [...undo, { type: 'pinch-start', a, b }],
    };
  }
  // A third pointer, a duplicate down, or a mouse beside a touch: ignored.
  return stay(state);
}

/** One contact of a pinch moved. */
function movePinch(state: PinchState, event: GestureEvent): Transition {
  const a =
    state.a.pointerId === event.pointerId ? { ...state.a, x: event.x, y: event.y } : state.a;
  const b =
    state.b.pointerId === event.pointerId ? { ...state.b, x: event.x, y: event.y } : state.b;
  if (a === state.a && b === state.b) return stay(state);
  return {
    state: { kind: 'pinch', a, b },
    effects: [{ type: 'pinch-update', a, b }],
  };
}

/**
 * One contact of a pinch lifted or was cancelled. Nothing is committed (§2.2:
 * a pinch only zooms). The finger left down is handed back to native scroll
 * rather than becoming a drag, so it can never move an element mid-lift.
 */
function endPinch(state: PinchState, event: GestureEvent): Transition {
  const lifted = [state.a, state.b].find((contact) => contact.pointerId === event.pointerId);
  if (!lifted) return stay(state);
  const left = lifted === state.a ? state.b : state.a;
  const at = { x: left.x, y: left.y };
  const finger: Finger = {
    pointerId: left.pointerId,
    pointerType: 'touch',
    origin: at,
    at,
  };
  return {
    state: { kind: 'scroll', finger },
    effects: [{ type: 'pinch-end' }],
  };
}

function onMove(state: GestureState, event: GestureEvent & { type: 'move' }): Transition {
  if (state.kind === 'pinch') return movePinch(state, event);
  const live = fingerState(state);
  if (!live || !isOwn(live, event)) return stay(state);
  const finger: Finger = { ...live.finger, at: { x: event.x, y: event.y } };
  switch (live.kind) {
    case 'pending': {
      if (!crossedSlop(finger)) return stay({ ...live, finger });
      const gesture = claim(live.under, finger.pointerType);
      if (gesture === null) return stay({ ...live, finger });
      if (gesture === 'scroll') return stay({ kind: 'scroll', finger });
      const select: GestureEffect[] =
        finger.pointerType !== 'touch' && live.under.kind === 'element' && !live.under.wasSelected
          ? [{ type: 'select' }]
          : [];
      return {
        state: { kind: gesture, finger },
        effects: [
          ...select,
          { type: 'begin', gesture, origin: finger.origin },
          { type: 'update', gesture, origin: finger.origin, at: finger.at },
        ],
      };
    }
    case 'scroll':
      return stay({ ...live, finger });
    default:
      return {
        state: { kind: live.kind, finger },
        effects: [
          {
            type: 'update',
            gesture: live.kind,
            origin: finger.origin,
            at: finger.at,
          },
        ],
      };
  }
}

function onUp(state: GestureState, event: GestureEvent & { type: 'up' }): Transition {
  if (state.kind === 'pinch') return endPinch(state, event);
  const live = fingerState(state);
  if (!live || !isOwn(live, event)) return stay(state);
  switch (live.kind) {
    case 'pending': {
      // §2.5: a touch held past the tap limit is a press, which is unbound (§2.2).
      const held = event.t - live.startedAt > TAP_MAX_DURATION_MS;
      if (live.finger.pointerType === 'touch' && held) return stay(IDLE);
      return {
        state: IDLE,
        effects: [{ type: 'tap', under: live.under, x: event.x, y: event.y }],
      };
    }
    case 'scroll':
      return stay(IDLE);
    default:
      return { state: IDLE, effects: [{ type: 'commit', gesture: live.kind }] };
  }
}

function onCancel(state: GestureState, event: GestureEvent & { type: 'cancel' }): Transition {
  if (state.kind === 'pinch') return endPinch(state, event);
  const live = fingerState(state);
  if (!live || !isOwn(live, event)) return stay(state);
  if (live.kind === 'pending' || live.kind === 'scroll') return stay(IDLE);
  return { state: IDLE, effects: [{ type: 'cancel', gesture: live.kind }] };
}

export function transition(state: GestureState, event: GestureEvent): Transition {
  switch (event.type) {
    case 'down':
      return onDown(state, event);
    case 'move':
      return onMove(state, event);
    case 'up':
      return onUp(state, event);
    case 'cancel':
      return onCancel(state, event);
  }
}

/**
 * The interpreter. State is committed before the effects run, so an effect
 * (focus(), a DOM paint) that re-enters `send` sees the new state.
 */
export function createGestureMachine(onEffect: (effect: GestureEffect) => void = () => {}) {
  let state: GestureState = IDLE;
  return {
    get state() {
      return state;
    },
    send(event: GestureEvent): GestureEffect[] {
      const result = transition(state, event);
      state = result.state;
      result.effects.forEach(onEffect);
      return result.effects;
    },
  };
}
