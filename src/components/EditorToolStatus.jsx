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
 * tool, says both halves out loud on every device. Escape and the button's own
 * double-click still work; they are shortcuts for this, not the only way in.
 *
 * The caller owns every tool-facing string (`copy`), so a rename of an internal
 * tool id can never rewrite the UI copy - see TOOL_COPY in each toolbar.
 *
 * @param {object|null} props.copy - { action, button } for the armed tool, or null when idle
 * @param {boolean} props.locked - whether the armed tool stays on across placements
 * @param {function} props.onKeepAdding - lock the armed tool on
 * @param {function} props.onStop - disarm the tool entirely
 * @param {any} props.idle - what to say when no tool is armed
 */
export default function EditorToolStatus({ copy, locked, onKeepAdding, onStop, idle }) {
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
      <span>
        {copy.action}
        {locked && <> <strong>{copy.button}</strong> stays on.</>}
      </span>
      <button
        type="button"
        className={styles['status-action']}
        onClick={locked ? onStop : onKeepAdding}
        title={
          locked
            ? `Stop adding with ${copy.button}. Pressing Escape does the same.`
            : `Keep ${copy.button} on to add several. Double-clicking ${copy.button} does the same.`
        }
      >
        {locked ? 'Stop' : 'Keep adding'}
      </button>
    </div>
  );
}
