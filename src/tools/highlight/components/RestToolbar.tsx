import { useLayoutEffect, useRef } from 'preact/hooks';
import { CommentIcon, TrashIcon } from '#editor-ui/toolIcons.tsx';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { markOf } from '../lib/marker/markEdit.ts';
import { nextFocusIndex } from '../lib/marker/roving.ts';
import { useToolbarDismissal, type HintAnchor } from '../hooks/useRestToolbar.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import useMarkToolbarPlacement from '../hooks/useMarkToolbarPlacement.ts';
import controls from '#editor-ui/EditorControls.module.css';
import elementStyles from '#editor-ui/EditorElement.module.css';
import LookControls from './LookControls.tsx';
import styles from './RestToolbar.module.css';

/**
 * The toolbar a highlight opens on a rest or a tap, built from Sign's own element toolbar pieces: a color
 * menu with opacity, the Highlight | Underline toggle (icons, with the underline's thickness caret; LookControls), Comment and Delete.
 * It is placed by Sign's floating hook, above the mark, and every change is the caller's to apply.
 */
export default function RestToolbar({ mark, onChange, onDelete, onComment, onClose, lookControls = true }: {
  mark: HighlightElement;
  onChange(change: Partial<Marker>): void;
  onDelete(): void;
  /** R27: open this highlight's comment (a blank one first if it has none). */
  onComment(): void;
  onClose(): void;
  /** The color and style controls; a finger sets the look on the pen bar, so the mark's bar there is Comment and Delete only. */
  lookControls?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rtl = mark.direction === 'rtl';
  const look = markOf(mark);

  // The latest of everything the document listeners need, so they subscribe once.
  const live = useRef({ mark, onChange, onDelete, onComment, onClose, look });
  live.current = { mark, onChange, onDelete, onComment, onClose, look };

  const toggleUnderline = () => live.current.onChange({ style: live.current.look.style === 'underline' ? 'highlight' : 'underline' });

  // Sign's placement: above the mark, start edge (end for RTL), inside the page wrapper and the visual viewport.
  const placement = useMarkToolbarPlacement(rootRef, mark.id, rtl);

  useToolbarDismissal(rootRef, live, { toggleUnderline });

  const onArrow = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'BUTTON') return;
    const buttons = [...(rootRef.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    // Arrows follow the interface direction, never the mark's text direction.
    const interfaceRtl = !!rootRef.current && getComputedStyle(rootRef.current).direction === 'rtl';
    const next = nextFocusIndex(buttons.indexOf(target), e.key, buttons.length, interfaceRtl);
    if (next === null) return;
    e.preventDefault();
    buttons[next].focus();
  };

  return (
    <div
      ref={placement.setRoot} class={`${elementStyles.actions} ${styles.bar}`} style={placement.style} role="toolbar" aria-label={t.markToolbar}
      data-rest-toolbar data-side="above" onKeyDown={onArrow}
    >
      {lookControls && (
        <>
          <LookControls look={look} onChange={(change) => live.current.onChange(change)} />
          <div class={controls.divider} />
        </>
      )}
      <button type="button" class={controls['element-button']} aria-label={t.markComment} aria-keyshortcuts="C" title={t.markComment} onClick={() => live.current.onComment()}>
        <CommentIcon size={18} />
      </button>
      <button
        type="button" class={`${controls['element-button']} ${controls['element-button-danger']}`} aria-label={t.markDelete} aria-keyshortcuts="Delete" title={t.markDelete}
        onClick={() => live.current.onDelete()}
      >
        <TrashIcon />
      </button>
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
