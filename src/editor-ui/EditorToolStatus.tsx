import type { ComponentChildren } from 'preact';
import styles from './SignToolbar.module.css';
import { formatMessage } from '../i18n/toolMessages';

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
 * @param {Array<{action: string, button: string}>} [props.reserveCopies] - every other tool
 *   this toolbar can arm, rendered hidden purely to hold the row's height steady - see the
 *   comment on `.help` in SignToolbar.module.css for why arming needs this at all.
 * @param {any} [props.override] - something that takes the slot over for a while (Redact's
 *   undo chip). It is rendered *inside* the same stack, over the same reservations, rather
 *   than in place of this component: a chip mounted instead of the stack was a row of its own
 *   height, so the toolbar under it moved when the chip appeared and again, 5s later with no
 *   input to excuse it, when the chip went.
 * @param {object|null} [props.fieldNav] - Sign's Next/Previous across detected fields
 *   (MOBI-06), null for Redact. Unlike `override` it is not part of the stack at all: it sits
 *   beside whichever row the stack is showing, present for as long as the document has any
 *   detected field, so the control's own mount state never changes underfoot - only its two
 *   buttons' `disabled` does, as the person reaches either end of the order.
 */
export default function EditorToolStatus({
  copy,
  locked,
  onToggleKeepOn,
  idle,
  reserveCopies = [],
  override = null,
  // LOC-09 stage 1: individual label props, not a whole message catalogue -
  // this component is shared with Redact, which stays English by not passing
  // any of these, so every default here is the exact literal this file used
  // to hardcode. SignToolbar.tsx is the only caller passing its own values,
  // read from src/i18n/toolMessages.ts's SignMessages.
  keepOnLabel = 'Keep {button} on',
  // The phone-width label, where the pill sits beside the sentence that has
  // just named the tool ("...draw a blackout box.") and every character of it
  // is a character the sentence has to wrap around - see `.keep-short`.
  keepOnShort = 'Keep on',
  keepOnTitleOn = 'Switch off to go back to one at a time. {button} stays selected either way.',
  keepOnTitleOff = 'Keep {button} on to use it several times. Double-clicking {button} does the same.',
  hintEsc = 'or press Esc to stop entirely',
  hintDoubleClick = 'or double-click {button}',
  fieldNav = null,
  lang = 'en',
  dir = 'ltr',
}: {
  copy: any;
  locked: boolean;
  onToggleKeepOn: () => void;
  idle: string;
  reserveCopies?: Array<{ action: string; button: string }>;
  override?: ComponentChildren;
  keepOnLabel?: string;
  keepOnShort?: string;
  keepOnTitleOn?: string;
  keepOnTitleOff?: string;
  hintEsc?: string;
  hintDoubleClick?: string;
  /** MOBI-06: Next/Previous across the document's own detected fields - Sign's
   * only caller, so Redact gets its current behaviour by leaving this null.
   * Present (non-null) for the whole session once the document has any
   * detected field at all, same as the "Keep on" switch is always in the DOM
   * either way - only the two buttons' own `disabled` moves as the person
   * reaches either end of the order, so the control itself never mounts or
   * unmounts under a finger that is about to tap it again. */
  fieldNav?: {
    hasNext: boolean;
    hasPrevious: boolean;
    onNext: () => void;
    onPrevious: () => void;
    nextLabel: string;
    previousLabel: string;
  } | null;
  lang?: string;
  dir?: 'ltr' | 'rtl';
}) {
  // Both labels are always in the DOM and CSS picks one by width (`.keep-long`
  // / `.keep-short` in SignToolbar.module.css), so the pill's width - and with
  // it the row's wrap - is settled by the stylesheet, never by a resize
  // listener. `display: none` keeps the unused one out of the accessible name.
  const keepOnText = (button: string) => (
    <>
      <span className={styles['keep-long']}>{formatMessage(keepOnLabel, { button })}</span>
      <span className={styles['keep-short']}>{formatMessage(keepOnShort, { button })}</span>
    </>
  );

  // The interactive row for whichever tool is actually armed. Pulled out so the
  // hidden reservations below (real copy text, no live handlers) can share its
  // markup instead of drifting from it.
  const armedRow = (rowCopy: { action: string; button: string }, interactive: boolean) => (
    <>
      <svg className={styles['help-icon']} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className={styles['help-text']}>{rowCopy.action}</span>
      {/* aria-checked, not a second sentence: the knob says "on" to the eye and
          this says it to a screen reader, so the line does not have to spend a
          phone's scarce vertical space stating a state the control is already
          showing. The pill itself only tints - the knob is what moves, because
          a switch whose whole row changes colour reads as a button that swapped
          identity rather than as one setting that changed value. A hidden
          reservation renders a plain span here, never a second real switch. */}
      {interactive ? (
        <button
          type="button"
          role="switch"
          className={`${styles['status-action']}${locked ? ` ${styles['status-action-on']}` : ''}`}
          onClick={onToggleKeepOn}
          aria-checked={locked}
          title={formatMessage(locked ? keepOnTitleOn : keepOnTitleOff, { button: rowCopy.button })}
        >
          <span className={styles['status-switch']} aria-hidden="true" />
          {keepOnText(rowCopy.button)}
        </button>
      ) : (
        <span className={styles['status-action']}>
          <span className={styles['status-switch']} aria-hidden="true" />
          {keepOnText(rowCopy.button)}
        </span>
      )}
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
          span and needs no measured width to keep in sync.

          A hidden reservation row (`interactive` false) pins both to
          `status-hint-spare`, never `status-hint-shown`: `visibility` is only
          inherited until something sets it explicitly, and `status-hint-shown`
          does exactly that - inside a row its own ancestor `.help-row` has just
          set to `visibility: hidden`, that one span's `visible` won a fight the
          ancestor should have won, and every reservation row's "or double-click
          <button>" painted on screen at once, stacked on top of the real one. */}
      <span className={styles['status-hint']}>
        <span className={interactive && locked ? styles['status-hint-shown'] : styles['status-hint-spare']}>
          {hintEsc}
        </span>
        <span className={interactive && !locked ? styles['status-hint-shown'] : styles['status-hint-spare']}>
          {formatMessage(hintDoubleClick, { button: rowCopy.button })}
        </span>
      </span>
    </>
  );

  return (
    // `data-status-active` is how the shell (ToolShell.module.css) knows this
    // line has something live to say. On a phone the identity line and this one
    // share a single fixed-height row, and that attribute is what swaps the
    // filename out for the armed row. It is an attribute rather than a class
    // because the two live in different CSS modules.
    <div className={styles.help} dir={dir} lang={lang} data-status-active={copy || override || fieldNav ? '' : undefined}>
      {/* Everything this toolbar could ever show lives here at once - the idle
          tip, whichever tool is actually armed, and a hidden copy of every other
          tool's row - stacked in one grid cell (`.help-stack`/`.help-row` in
          SignToolbar.module.css) so the tallest of them, at the current width
          and in the current language, sets the row's real height permanently.
          `role="status"` moves with the armed row itself, since that is the one
          state change worth announcing; the idle tip is standing advice, not a
          change, and a hidden reservation is not a state at all. */}
      <div className={`${styles['help-stack']}`}>
        <div className={`${styles['help-row']} ${styles['help-idle']} ${!copy && !override ? styles['help-shown'] : styles['help-spare']}`}>
          <span>{idle}</span>
        </div>
        {override ? (
          <div className={`${styles['help-row']} ${styles['help-shown']}`} role="status">
            {override}
          </div>
        ) : copy && (
          <div className={`${styles['help-row']} ${styles['help-shown']}`} role="status">
            {armedRow(copy, true)}
          </div>
        )}
        {reserveCopies.map((rowCopy) => (
          <div
            key={rowCopy.button + rowCopy.action}
            className={`${styles['help-row']} ${styles['help-spare']}`}
            aria-hidden="true"
          >
            {armedRow(rowCopy, false)}
          </div>
        ))}
      </div>
      {/* Outside the stack on purpose: the stack's job is picking one of
          several mutually-exclusive rows and reserving room for the tallest,
          and this is neither - it is a fixed-size control that sits beside
          whichever row the stack is showing, present for the whole document
          (see the prop doc above) rather than swapped per tool. Sitting here,
          after the stack, means it never counts toward the stack's own
          reserved-row bookkeeping and is never duplicated into a reservation. */}
      {fieldNav && (
        <div className={styles['field-nav']}>
          <button
            type="button"
            className={styles['field-nav-button']}
            onClick={fieldNav.onPrevious}
            disabled={!fieldNav.hasPrevious}
            aria-label={fieldNav.previousLabel}
            title={fieldNav.previousLabel}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            type="button"
            className={styles['field-nav-button']}
            onClick={fieldNav.onNext}
            disabled={!fieldNav.hasNext}
            aria-label={fieldNav.nextLabel}
            title={fieldNav.nextLabel}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
