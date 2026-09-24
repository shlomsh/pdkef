import { useRef, useState, useEffect, useCallback } from 'preact/hooks';

/** How close together two taps on the same tool have to land to count as a
 * double-tap - iOS's own double-tap window is about this. */
export const DOUBLE_TAP_MS = 400;

const isCoarsePointer = () => Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);

/**
 * The one-shot-with-lock arming gesture, owned in one place so the Sign and
 * Redact toolbars cannot drift apart on it.
 *
 * A tool arms for a single placement and disarms itself once that placement is
 * committed, so the click *after* a placement means "deselect" rather than
 * "make another one". Repeat placement is opt-in: double-clicking the tool's own
 * button locks it on, the Figma/Illustrator convention.
 *
 * With a mouse, `detail` is the click count on the same button, so the second
 * click of a double-click locks instead of toggling the tool back off - no
 * `ondblclick` handler needed. A real dblclick handler cannot be used on a
 * toggle button: it fires only after two clicks, and the second one would have
 * already disarmed the tool before the lock landed.
 *
 * A touch screen needs its own rule, because iOS Safari never counts taps:
 * measured in the iOS 26 simulator, every tap arrives as a click with
 * `detail: 1` (and `pointerType: "mouse"`, so the event cannot say it was a
 * finger either). On a coarse pointer, a second tap on the tool the first tap
 * just armed, within DOUBLE_TAP_MS, locks it (SIGN-30: Redact's double-tap
 * armed and then disarmed). `touch-action: manipulation` on `.toolbar`
 * (SignToolbar.module.css) is the other half: without it Safari reads the same
 * two taps as its zoom gesture.
 *
 * @param {object} params
 * @param {string|null} params.selectedTool - the currently armed tool, if any
 * @param {(tool: string|null) => void} params.arm - arm this tool for one placement, or null to disarm
 * @param {(tool: string) => void} params.lock - keep this tool armed across placements
 * @param {{tool: string|null, at: number}} params.lastTap - which tool the last tap armed, and when; mutated
 * @param {() => boolean} [params.isTouch] - whether taps are the input (the coarse-pointer query by default)
 * @returns {(tool: string) => (event: MouseEvent) => void} a click-handler factory
 */
export function makeArmTool({ selectedTool, arm, lock, lastTap, isTouch = isCoarsePointer }) {
  return (tool) => (e) => {
    // Still armed by that last tap: a placement disarms the tool, and the tap
    // after one is a fresh arm however soon it comes.
    const doubleTap = selectedTool === tool && lastTap.tool === tool
      && e.timeStamp - lastTap.at < DOUBLE_TAP_MS && isTouch();
    lastTap.tool = null;
    if (e.detail >= 2 || doubleTap) {
      lock(tool);
      return;
    }
    const next = selectedTool === tool ? null : tool;
    if (next) {
      lastTap.tool = next;
      lastTap.at = e.timeStamp;
    }
    arm(next);
  };
}

/** `makeArmTool` with its tap memory kept across renders - what the toolbars call. */
export function useArmTool(params) {
  const lastTap = useRef({ tool: null, at: 0 }).current;
  return makeArmTool({ ...params, lastTap });
}

/**
 * The same double-tap window for the menu tools (Shapes, Sign; SIGN-31), whose
 * single tap opens a menu rather than arming, so `makeArmTool`'s "the first
 * tap armed it" test cannot apply. Returns whether this click is the second of
 * two taps on `key` within DOUBLE_TAP_MS; always false with a mouse, where
 * those buttons lock through a real `ondblclick`. A hit consumes the pair, so
 * a third quick tap starts over. `canLock` is the caller's own condition (the
 * menu from the first tap still open); when it fails, this tap starts a new
 * pair rather than spending the old one.
 *
 * @param {{key: string|null, at: number}} lastTap - mutated
 * @param {() => boolean} [isTouch]
 * @returns {(key: string, event: MouseEvent, canLock?: boolean) => boolean}
 */
export function makeDoubleTap(lastTap, isTouch = isCoarsePointer) {
  return (key, e, canLock = true) => {
    const hit = canLock && lastTap.key === key && e.timeStamp - lastTap.at < DOUBLE_TAP_MS && isTouch();
    lastTap.key = hit ? null : key;
    lastTap.at = e.timeStamp;
    return hit;
  };
}

export function useDoubleTap() {
  const lastTap = useRef({ key: null, at: 0 }).current;
  return makeDoubleTap(lastTap);
}

/** Set the first time the touch bubble shows, so a phone sees it once, ever. */
const TOUCH_HINT_KEY = 'pdf-toolkit:double-tap-hint-seen';

function touchHintSeen() {
  try {
    return localStorage.getItem(TOUCH_HINT_KEY) === '1';
  } catch {
    return true;
  }
}

function markTouchHintSeen() {
  try {
    localStorage.setItem(TOUCH_HINT_KEY, '1');
  } catch {
    // Blocked storage only means the bubble can show again on a later visit.
  }
}

/**
 * Teaches the lock shortcut once, at the button it belongs to, instead of
 * leaving it to a `title` attribute that needs a hover and a wait to find.
 * The first time any tool arms, its button's hint bubble (see `ArmHint.tsx`)
 * is forced open for a few seconds, then it reverts to ordinary hover/focus.
 *
 * With a mouse that is once per session and says "double-click". On touch it
 * says "double-tap" (SIGN-31: a double-tap locks there too since SIGN-30) and
 * shows once per device, remembered in localStorage: a phone has no hover to
 * find it again, and a bubble that returned on every visit would be nagging.
 * It floats, so it costs the phone's row no space.
 *
 * `shownRef`, not state, for "has this fired yet" - flipping it must not itself
 * cause a render, only the timer's two edges (show, then hide) should.
 *
 * @returns {{ autoShowTool: string|null, noteArmed: (tool: string|null) => void }}
 */
export function useAutoArmHint() {
  const [autoShowTool, setAutoShowTool] = useState(null);
  const shownRef = useRef(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const noteArmed = useCallback((tool) => {
    if (!tool || shownRef.current) return;
    const canHover = Boolean(globalThis.matchMedia?.('(hover: hover) and (pointer: fine)').matches);
    shownRef.current = true;
    if (!canHover) {
      if (touchHintSeen()) return;
      markTouchHintSeen();
    }
    setAutoShowTool(tool);
    timerRef.current = setTimeout(() => setAutoShowTool(null), 2600);
  }, []);

  return { autoShowTool, noteArmed };
}
