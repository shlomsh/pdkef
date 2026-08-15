import styles from './SignTool/SignToolbar.module.css';

/**
 * The editor hint line, shared by the Sign and Redact toolbars: what the armed
 * tool is waiting for, and the one control that turns repeat placement on and
 * off again.
 *
 * The chip is not decoration. A locked tool used to be escapable only by
 * pressing Escape or by knowing that clicking its button again disarms it, and
 * a phone has neither an Escape key nor any way to discover the second one -
 * so on touch, "keep adding" was a state you could enter by accident and not
 * get out of. One visible control, in the line that is already explaining the
 * tool, says both halves out loud on every device.
 *
 * It is a real switch - `role="switch"`, one stable label, state carried by the
 * knob - and the three things that made it one are each worth not undoing:
 *   - **It toggles one setting, and toggling it back undoes it.** Two earlier
 *     versions ("Keep adding" / "Stop", then "Keep X on" / "Turn X off") only
 *     looked like toggles: pressing the second one disarmed the tool *entirely*
 *     rather than returning it to one-shot, so pressing twice did not put you
 *     back where you started. It was worse than asymmetric - disarming drops
 *     this whole line for the idle tip, so the control deleted itself from
 *     under the pointer that had just clicked it, with nothing to click to get
 *     back. Switching off now leaves the tool armed for one placement, which is
 *     the state it was in before you switched on. Stopping entirely is a
 *     statement about the tool, and belongs where the tool does: its own
 *     toolbar button, or Escape.
 *   - **Never a bare verb.** "Keep adding" was simply wrong on Redact's Delete
 *     tool, which adds nothing - it takes a run out of the file. Naming the
 *     button instead of the action sidesteps every per-tool verb, and it is
 *     also the only version that says *which* of the eight tools the chip is
 *     about, which "Stop" never did. As a switch label it reads the way
 *     "Keep me signed in" does: the setting, not the next action, so it can
 *     hold still while the knob moves.
 *   - **The shortcut is visible, not just in a title.** Double-click was
 *     discoverable only by accident, and a `title` is not an affordance - it
 *     needs a hover the device may not have. See `.status-hint`, which is why
 *     the hint renders only where the gesture it describes actually exists.
 *
 * The caller owns every tool-facing string (`copy`), so a rename of an internal
 * tool id can never rewrite the UI copy - see TOOL_COPY in each toolbar.
 *
 * @param {object|null} props.copy - { action, button } for the armed tool, or null when idle
 * @param {boolean} props.locked - whether the armed tool stays on across placements
 * @param {function} props.onToggleKeepOn - flip that setting, leaving the tool armed either way
 * @param {any} props.idle - what to say when no tool is armed
 */
export default function EditorToolStatus({ copy, locked, onToggleKeepOn, idle }) {
  // No tool armed: standing advice, and deliberately not a live region. It is
  // not reporting a change, and announcing it on every state change would talk
  // over whatever actually did change.
  if (!copy) {
    return (
      <div className={styles.help}>
        <span>{idle}</span>
      </div>
    );
  }

  return (
    <div className={styles.help} role="status">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span>{copy.action}</span>
      {/* aria-checked, not a second sentence: the knob says "on" to the eye and
          this says it to a screen reader, so the line does not have to spend a
          phone's scarce vertical space stating a state the control is already
          showing. The pill itself only tints - the knob is what moves, because
          a switch whose whole row changes colour reads as a button that swapped
          identity rather than as one setting that changed value. */}
      <button
        type="button"
        role="switch"
        className={`${styles['status-action']}${locked ? ` ${styles['status-action-on']}` : ''}`}
        onClick={onToggleKeepOn}
        aria-checked={locked}
        title={
          locked
            ? `Switch off to go back to one at a time. ${copy.button} stays selected either way.`
            : `Keep ${copy.button} on to use it several times. Double-clicking ${copy.button} does the same.`
        }
      >
        <span className={styles['status-switch']} aria-hidden="true" />
        Keep {copy.button} on
      </button>
      {/* Shown only on a device that has the gesture it names: a double-tap is
          the browser's zoom and a phone has no Escape key, so on touch both of
          these would be advice you cannot follow. `.status-hint` is display:none
          there, which also keeps it out of the accessibility tree.
          The two are deliberately not a matched pair. Double-click is the same
          action as switching on; Escape is not the inverse - it drops the tool
          altogether - so it says "entirely", and it is here at all because the
          switch no longer offers that and it is worth one visible mention.

          Both are always rendered, stacked in one grid cell, with the inactive
          one hidden rather than dropped. This whole line is pinned to the
          trailing edge of the identity row (`.status`, ToolShell.module.css), so
          its left edge is a function of its total width - and a hint that grew
          or shrank on toggle dragged the switch sideways with it, out from under
          the pointer mid-click. Reserving the wider of the two costs a hidden
          span and needs no measured width to keep in sync. */}
      <span className={styles['status-hint']}>
        <span className={locked ? styles['status-hint-shown'] : styles['status-hint-spare']}>
          or press Esc to stop entirely
        </span>
        <span className={locked ? styles['status-hint-spare'] : styles['status-hint-shown']}>
          or double-click {copy.button}
        </span>
      </span>
    </div>
  );
}
