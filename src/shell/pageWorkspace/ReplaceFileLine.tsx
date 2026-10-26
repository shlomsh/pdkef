import { FILE_ACTIONS, useToolShell } from '../ToolShell.tsx';
import { englishShellMessages } from '../../i18n/toolMessages';
import styles from './PageWorkspace.module.css';

/**
 * Replace file as the rail's quiet last line, for every one-file page tool
 * (UX guideline 20: starting over with another file is an ending, not a first
 * step). The rail's last line at every width, since below 1024px the pinned
 * rail sits under the last page, so a tool renders it once and never again in
 * its phone bar or controls. It goes through the shell's own confirmation.
 */
export default function ReplaceFileLine() {
  const { requestReplace, messages = englishShellMessages } = useToolShell();
  return (
    <div class={styles['replace-line']} data-replace-line>
      <button type="button" class={styles['replace-button']} onClick={requestReplace} title={messages.replaceTitle}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d={FILE_ACTIONS.replace.icon} stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {messages.replaceLabel}
      </button>
    </div>
  );
}
