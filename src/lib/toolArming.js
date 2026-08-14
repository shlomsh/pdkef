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
