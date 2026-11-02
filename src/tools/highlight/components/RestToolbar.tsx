import { useLayoutEffect, useRef } from 'preact/hooks';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { markOf } from '../lib/marker/markEdit.ts';
import { nextFocusIndex } from '../lib/marker/roving.ts';
import { useToolbarDismissal, type HintAnchor } from '../hooks/useRestToolbar.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import useMarkToolbarPlacement from '../hooks/useMarkToolbarPlacement.ts';
import MarkPanel from './MarkPanel.tsx';
import styles from './RestToolbar.module.css';

/**
 * The panel a highlight opens on a rest or a click on a fine pointer: MarkPanel, the same row touch shows under the top
 * toolbar. It is placed by Sign's floating hook, above the mark, and every change is the caller's to apply.
 */
export default function RestToolbar({ mark, onChange, onDelete, onComment, onClose }: {
  mark: HighlightElement;
  onChange(change: Partial<Marker>): void;
  onDelete(): void;
  /** R27: open this highlight's comment (a blank one first if it has none). */
  onComment(): void;
  onClose(): void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rtl = mark.direction === 'rtl';
  const look = markOf(mark);

  // The latest of everything the document listeners need, so they subscribe once.
  const live = useRef({ mark, onChange, onDelete, onComment, onClose, look });
  live.current = { mark, onChange, onDelete, onComment, onClose, look };

  // Sign's placement: above the mark, start edge (end for RTL), inside the page wrapper and the visual viewport.
  const placement = useMarkToolbarPlacement(rootRef, mark.id, rtl);

  useToolbarDismissal(rootRef, live);

  const onArrow = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'BUTTON') return;
    // A radio group is one stop, at its checked radio; its own handler moves within it.
    const buttons = [...(rootRef.current?.querySelectorAll<HTMLElement>('button') ?? [])].filter((b) => !(b.getAttribute('role') === 'radio' && b.tabIndex === -1));
    // Arrows follow the interface direction, never the mark's text direction.
    const interfaceRtl = !!rootRef.current && getComputedStyle(rootRef.current).direction === 'rtl';
    const next = nextFocusIndex(buttons.indexOf(target), e.key, buttons.length, interfaceRtl);
    if (next === null) return;
    e.preventDefault();
    buttons[next].focus();
  };

  return (
    <div
      ref={placement.setRoot} class={styles.bar} style={placement.style} role="toolbar" aria-label={t.markToolbar}
      data-rest-toolbar data-side="above" onKeyDown={onArrow}
    >
      <MarkPanel
        look={look} onChange={(change) => live.current.onChange(change)}
        onComment={() => live.current.onComment()} onDelete={() => live.current.onDelete()}
      />
    </div>
  );
}

/** R8: a quiet pill beside the end of the first mark's ink, never over the line being read. */
export function MarkHint({ anchor, text }: { anchor: HintAnchor; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Kept inside the screen and the page card (which clips it), once, as it appears.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const card = el.closest('[data-page-wrapper]')?.getBoundingClientRect();
    const min = Math.max(0, card?.left ?? 0) + 8;
    const max = Math.min(document.documentElement.clientWidth, card?.right ?? Infinity) - 8;
    const shift = r.left < min ? min - r.left : r.right > max ? max - r.right : 0;
    if (shift) el.style.translate = `${shift}px 0`;
  }, []);
  return (
    <div
      ref={ref} data-mark-hint class={`${styles.hint} ${anchor.rtl ? styles.hintRtl : ''}`}
      style={{ left: `${anchor.x}%`, top: `${anchor.bottom}%` }}
    >
      {text}
    </div>
  );
}
