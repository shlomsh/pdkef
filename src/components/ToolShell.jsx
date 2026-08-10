import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import styles from './ToolShell.module.css';

/* The file-level actions, keyed by what the tool takes. Label, short label,
   glyph and viewBox live together so a future mode is one entry here instead of
   several conditionals threaded through the markup that renders them.

   `replace` is the united action: one control that means "I want a different
   file", replacing the two that used to say it at once (a Replace button in the
   file bar and a Start over button in the tool below). Multi-file tools are the
   exception rather than drift - a list genuinely has two intents, so they get
   `add` and `clear` side by side. */
export const FILE_ACTIONS = {
  add: {
    label: 'Add files',
    shortLabel: 'Add',
    title: 'Add more files',
    // A plain plus: there will be more files than there are now.
    icon: 'M8 3.5v9M3.5 8h9',
  },
  replace: {
    label: 'Replace file',
    shortLabel: 'Replace',
    title: 'Replace the current file',
    /* Two arrows trading places. Deliberately not the arrow-out-of-a-tray glyph
       this used to carry: that is the universal "upload" icon, and uploading is
       the one thing this app never does, so it misrepresented the action on the
       page where the privacy promise matters most. Circular arrows were the
       other obvious candidate and are also out - they would collide with the
       editor toolbar's Undo icon directly beside it. */
    icon: 'M3 6h10M10.5 3.5 13 6l-2.5 2.5M13 10H3M5.5 7.5 3 10l2.5 2.5',
  },
  clear: {
    label: 'Clear all',
    shortLabel: 'Clear',
    title: 'Remove every file and start again',
    icon: 'M2.5 4.5h11M12 4.5V13a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 13V4.5m2 0V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5',
  },
};

// A control rendered without a real provider (an isolated unit test, a stray
// future usage) should still mount cleanly - but if it's clicked, that click
// silently doing nothing is worse than an error, since a passing test can't
// tell "wired to a live action" from "wired to nothing" any other way.
function missingProvider(action) {
  return () => {
    throw new Error(
      `useToolShell(): ${action} was called with no <ToolShellContext.Provider> above it. ` +
        'Mount this control inside BasePdfTool, or wrap the render in ToolShellContext.Provider.',
    );
  };
}

/* Everything a tool's controls need to know about the loaded file and how to
   act on it. BasePdfTool is the single provider: it owns the file input, the
   confirmations and the per-tool configuration, so no control anywhere has to
   re-derive any of it, and two tools cannot end up disagreeing about what
   "replace" means. The default value keeps a control renderable in isolation
   (a unit test mounting just a toolbar) instead of throwing - but only until
   one of its actions is actually invoked. */
export const ToolShellContext = createContext({
  requestReplace: missingProvider('requestReplace'),
  requestClear: missingProvider('requestClear'),
});

export function useToolShell() {
  return useContext(ToolShellContext);
}

/**
 * The loaded file's identity line and the tool's control row, joined into one
 * object: same card, same line on desktop, stacked on phones.
 *
 * The identity line is read-only by design. It states which file is open, how
 * big it is and whether a draft is saved, and carries no buttons of any kind -
 * every action a tool offers lives in the control row beside it. That is what
 * stops a tool growing a second, half-different copy of an action in the file
 * bar, which is how Replace and Start over came to sit on screen together
 * meaning the same thing.
 *
 * `editor` is for the Sign and Redact toolbars: their row wants the whole line
 * and has to stay stuck to the top while the document scrolls under it. Those
 * two mount this shell themselves, inside the element that goes full screen,
 * because a toolbar rendered outside it would vanish the moment full screen
 * started. Every other tool gets the shell from BasePdfTool.
 *
 * `status` is the tool's live hint line. It rides in the identity row rather
 * than under the toolbar because that row is mostly empty space past the
 * filename, and a hint on a line of its own cost 53px of the most valuable band
 * on the page - directly above the document - to say one short sentence.
 *
 * `data-tool-shell` is the page's "a file is open" signal. This component is
 * rendered only once a file is loaded, in every tool, so it is the one honest
 * hook for that state; the hero uses it to fold its marketing copy away while
 * you work (see ToolHero.astro). Keep the attribute even if nothing local reads
 * it.
 */
export default function ToolShell({ editor = false, status = null, children }) {
  const { fileLabel, fileMeta, draftSaved, multiple } = useToolShell();

  return (
    <div class={`${styles.shell}${editor ? ` ${styles.editor}` : ''}`} data-tool-shell>
      <div class={styles.identity}>
        <span class={styles.icon} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M6 3.5h8l5 5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5A1.5 1.5 0 0 1 6.5 3.5Z"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linejoin="round"
            />
            <path d="M14 3.5V8a1 1 0 0 0 1 1h4.5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          </svg>
        </span>

        <span class={styles.text}>
          <span class={styles.name}>
            {fileLabel || (multiple ? 'Files loaded' : 'PDF loaded')}
          </span>
          {(fileMeta || draftSaved) && (
            <span class={styles.meta}>
              {fileMeta && <span class={styles['meta-text']}>{fileMeta}</span>}
              {draftSaved && (
                <span class={styles.saved}>
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8.5l3 3 7-7.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  Draft saved
                </span>
              )}
            </span>
          )}
        </span>

        {status && <div class={styles.status}>{status}</div>}
      </div>

      <div class={styles.controls}>{children}</div>
    </div>
  );
}

/**
 * The default control row: the file-level actions, for every tool that does not
 * have an editor toolbar of its own. Single-file tools get the one united
 * Replace; list tools get Add and Clear all, because for a list those really are
 * two different intents.
 */
export function FileActions() {
  const { multiple, requestReplace, requestClear } = useToolShell();

  return (
    <>
      <ActionButton action={FILE_ACTIONS[multiple ? 'add' : 'replace']} onClick={requestReplace} />
      {multiple && <ActionButton action={FILE_ACTIONS.clear} onClick={requestClear} highlight />}
    </>
  );
}

function ActionButton({ action, onClick, highlight = false }) {
  return (
    <button
      type="button"
      class={`${styles.action}${highlight ? ` ${styles.highlight}` : ''}`}
      onClick={onClick}
      title={action.title}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d={action.icon} stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class={styles['action-full']}>{action.label}</span>
      <span class={styles['action-short']}>{action.shortLabel}</span>
    </button>
  );
}
