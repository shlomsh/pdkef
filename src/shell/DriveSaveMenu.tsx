import { useEffect, useRef, useState } from 'preact/hooks';
import { Check, ChevronDown } from 'lucide-preact';
import Popover from './Popover.tsx';
import { englishShellMessages } from './shellMessages.ts';
import { useToolShell } from './ToolShell.tsx';
import type { useSaveToDrive } from './pageWorkspace/useSaveToDrive.ts';
import styles from './DriveSaveMenu.module.css';

type Drive = ReturnType<typeof useSaveToDrive>;

/**
 * Save to Google Drive as a small arrow joined to Download (desktop only). One tap builds the file and sends it
 * to Drive; the popup shows the status, opens itself when the save starts and stays until the person closes it.
 * Esc, a press outside and the arrow close it (Popover). Portalled, so the toolbar's overflow never clips it.
 */
export default function DriveSaveMenu({ drive }: { drive: Drive }) {
  const labels = useToolShell().messages?.saveToDrive ?? englishShellMessages.saveToDrive;
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false);
  const { state, link } = drive;

  useEffect(() => { if (state !== 'idle') setOpen(true); }, [state]);
  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  if (!drive.available && state === 'idle') return null;

  const onOpenChange = (next: boolean) => { focusOnOpen.current = next; setOpen(next); };
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (!step || items.length === 0) return;
    e.preventDefault();
    items[(items.indexOf(e.target as HTMLElement) + step + items.length) % items.length].focus();
  };
  const saveItem = (
    <button type="button" role="menuitem" class={styles.item} onClick={drive.save}>
      <img src="/images/brand/google-drive.png" alt="" width="16" height="16" />
      {labels.save}
    </button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      placement="bottom-end"
      trigger={
        <button type="button" class={styles.arrow} aria-haspopup="menu" aria-expanded={open} aria-label={labels.more}>
          <ChevronDown size={14} stroke-width={2.5} aria-hidden="true" />
        </button>
      }
      content={
        <div class={styles.menu} role="menu" aria-label={labels.more} ref={menuRef} onKeyDown={onKeyDown}>
          {state === 'idle' && saveItem}
          {state === 'saving' && <p class={styles.note} role="status">{labels.saving}</p>}
          {state === 'saved' && (
            <div class={styles.saved} data-drive-saved>
              <Check size={16} stroke-width={2.5} aria-hidden="true" />
              <span role="status">{labels.saved}</span>
              {link && <a class={styles.open} href={link} target="_blank" rel="noopener" role="menuitem" aria-label={labels.open}>{labels.openShort}</a>}
            </div>
          )}
          {state === 'failed' && (
            <>
              <p class={styles.note} role="status">{labels.failed}</p>
              {saveItem}
            </>
          )}
        </div>
      }
    />
  );
}
