import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import Popover from '#shell/Popover.tsx';
import useCoarsePointer from '#editor-ui/hooks/useCoarsePointer.ts';
import { menuLeft } from '../lib/print/menuPlacement.ts';
import { printMenuItems, type PrintNotes } from '../lib/print/printMenu.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import { PrintIcon } from './capsule/ReadingCapsule.tsx';
import controls from '#editor-ui/EditorControls.module.css';
import toolbarStyles from '#editor-ui/SignToolbar.module.css';
import styles from './PrintMenu.module.css';

const icon = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true } as const;
const ITEM_ICONS: Record<PrintNotes, preact.JSX.Element> = {
  none: <svg {...icon}><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>,
  beside: <svg {...icon}><rect x="3" y="3" width="11" height="18" rx="1.5" /><path d="M18 7h3M18 12h3M18 17h3" /></svg>,
  end: <svg {...icon}><rect x="5" y="2" width="14" height="11" rx="1.5" /><path d="M5 17h14M5 21h14" /></svg>,
};

/** The three ways to print, as Sign's Shapes menu draws its items: a 14 px icon, then the word. One list for the row and the lamp. */
function PrintMenuList({ withComments, onChoose }: { withComments: boolean; onChoose(notes: PrintNotes): void }) {
  return (
    <div className={`${controls['dropdown-list']} ${controls.clean}`}>
      {printMenuItems(withComments, t).map((item) => (
        <button key={item.id} type="button" role="menuitem" class={`${controls['menu-item']} ${styles.item}`} onClick={() => onChoose(item.notes)}>
          {ITEM_ICONS[item.notes]}
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * READ-06 in the tool row: with a comment Print is a dropdown like Sign's Shapes (hover or click opens it,
 * a fine pointer only hovers); without one it is a plain button that prints at once.
 */
export function PrintDropdown({ open, onOpenChange, withComments, onChoose }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  withComments: boolean;
  onChoose(notes: PrintNotes): void;
}) {
  const coarse = useCoarsePointer();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverOpen = () => { clearTimeout(closeTimer.current); onOpenChange(true); };
  const scheduleClose = () => { clearTimeout(closeTimer.current); closeTimer.current = setTimeout(() => onOpenChange(false), 180); };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  const label = (
    <>
      <PrintIcon />
      <span className={toolbarStyles.label}>{t.capsule.print}</span>
    </>
  );
  if (!withComments) {
    return (
      <button type="button" className={toolbarStyles.button} aria-label={t.capsule.print} onClick={() => onChoose('none')}>{label}</button>
    );
  }
  const choose = (notes: PrintNotes) => { onOpenChange(false); onChoose(notes); };
  return (
    <div className={toolbarStyles.dropdown} onMouseEnter={coarse ? undefined : hoverOpen} onMouseLeave={coarse ? undefined : scheduleClose}>
      <Popover
        open={open}
        onOpenChange={onOpenChange}
        placement="bottom-start"
        trigger={
          <button type="button" className={toolbarStyles.button} aria-label={t.capsule.print} aria-haspopup="menu" aria-expanded={open}>
            {label}
            <svg className={toolbarStyles.chevron} width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        }
        content={
          <div className={`${controls.popover} ${styles.rowMenu}`} role="menu" aria-label={t.capsule.print} onMouseEnter={coarse ? undefined : hoverOpen} onMouseLeave={coarse ? undefined : scheduleClose}>
            <PrintMenuList withComments={withComments} onChoose={choose} />
          </div>
        }
      />
    </div>
  );
}

interface PrintMenuProps {
  open: boolean;
  onChoose(notes: PrintNotes): void;
  onClose(): void;
  /** The capsule's Print button's box in viewport px (top is where the menu's top edge goes); the menu aligns its start edge to it. */
  anchor?: { top: number; left: number; right: number };
}

/**
 * READ-06 in the Reading lamp: the same list hung under the capsule's own Print button. It stays in the tree rather than
 * portalling to the body, or it would be invisible in real fullscreen. Closes on Esc, on a press outside and on a choice.
 */
export default function PrintMenu({ open, onChoose, onClose, anchor }: PrintMenuProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const live = useRef({ onClose });
  live.current = { onClose };
  const [left, setLeft] = useState<number | undefined>();

  useLayoutEffect(() => {
    if (!open || !anchor) { setLeft(undefined); return; }
    const menu = rootRef.current?.querySelector<HTMLElement>('[role="menu"]');
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    setLeft(menuLeft({ triggerLeft: anchor.left, triggerRight: anchor.right, menuWidth: menu?.offsetWidth ?? 0, viewportWidth: window.innerWidth, rtl }));
  }, [open, anchor?.top, anchor?.left, anchor?.right]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: Event) => { if (!rootRef.current?.contains(e.target as Node)) live.current.onClose(); };
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      if (opener?.isConnected && opener !== document.body) opener.focus();
    };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    const buttons = [...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step || buttons.length === 0) return;
    e.preventDefault();
    buttons[(buttons.indexOf(e.target as HTMLElement) + step + buttons.length) % buttons.length].focus();
  };

  return (
    <span class={`${styles.wrap} ${styles.floating}`} ref={rootRef} onKeyDown={onKeyDown}
      style={anchor ? { top: `${anchor.top}px`, left: left === undefined ? undefined : `${left}px`, visibility: open && left === undefined ? 'hidden' : undefined } : undefined}>
      {open && (
        <div class={`${controls.popover} ${controls['toolbar-menu']} ${styles.menu}`} role="menu" aria-label={t.capsule.print}>
          <PrintMenuList withComments onChoose={(notes) => { onClose(); onChoose(notes); }} />
        </div>
      )}
    </span>
  );
}
