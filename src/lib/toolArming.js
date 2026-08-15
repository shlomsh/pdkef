import { useRef, useState, useEffect, useCallback } from 'preact/hooks';

/**
 * The one-shot-with-lock arming gesture, owned in one place so the Sign and
 * Redact toolbars cannot drift apart on it.
 *
 * A tool arms for a single placement and disarms itself once that placement is
 * committed, so the click *after* a placement means "deselect" rather than
 * "make another one". Repeat placement is opt-in: double-clicking the tool's own
 * button locks it on, the Figma/Illustrator convention.
 *
 * `detail` is the click count on the same button, so the second click of a
 * double-click locks instead of toggling the tool back off - no `ondblclick`
 * handler and no timer needed. A real dblclick handler cannot be used on a
 * toggle button: it fires only after two clicks, and the second one would have
 * already disarmed the tool before the lock landed.
 *
 * Double-clicking is a pointer gesture with no touch equivalent worth relying on
 * (a double-tap is the browser's zoom gesture), which is why locking is also
 * reachable from the status line's chip - see EditorToolStatus.jsx.
 *
 * @param {object} params
 * @param {string|null} params.selectedTool - the currently armed tool, if any
 * @param {(tool: string|null) => void} params.arm - arm this tool for one placement, or null to disarm
 * @param {(tool: string) => void} params.lock - keep this tool armed across placements
 * @returns {(tool: string) => (event: MouseEvent) => void} a click-handler factory
 */
export function makeArmTool({ selectedTool, arm, lock }) {
  return (tool) => (e) => {
    if (e.detail >= 2) {
      lock(tool);
      return;
    }
    arm(selectedTool === tool ? null : tool);
  };
}

/**
 * Teaches the double-click shortcut once, at the button it belongs to, instead
 * of leaving it to a `title` attribute that needs a hover and a wait to find.
 * The first time any tool arms this session, its button's hint bubble (see
 * `ArmHint.jsx`) is forced open for a few seconds; after that it reverts to
 * ordinary hover/focus, same as any tooltip.
 *
 * Gated on `(hover: hover) and (pointer: fine)` before ever starting the timer,
 * not just in the CSS that shows the bubble: double-click and hover both do not
 * exist on touch, so auto-showing "double-click to keep this on" there would be
 * advice a phone cannot act on, and would cost a repaint for nothing every time
 * a tool arms on a device that will never see it.
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
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
    shownRef.current = true;
    setAutoShowTool(tool);
    timerRef.current = setTimeout(() => setAutoShowTool(null), 2600);
  }, []);

  return { autoShowTool, noteArmed };
}
