import { useEffect, useRef, useState } from 'preact/hooks';
import { autoUpdate, flip, offset, shift, useDismiss, useFloating, useInteractions } from '@floating-ui/react';
import { HighlightIcon } from '#editor-ui/toolIcons.tsx';
import type { Marker } from '../lib/marker/markerState.ts';
import { isTypingTarget } from '#lib/history/isTypingTarget.ts';
import { keyAction, markKeyIntent } from '../lib/marker/keys.ts';
import { markerBadge } from '../lib/marker/markerBadge.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import controls from '#editor-ui/EditorControls.module.css';
import toolbarStyles from '#editor-ui/SignToolbar.module.css';
import MarkPanel from './MarkPanel.tsx';
import styles from './MarkerButton.module.css';

interface MarkerButtonProps {
  marker: Marker;
  /** For any pointer: the marker is armed, so a click or tap on it puts it down (and closes the panel). */
  armed?: boolean;
  /** The click or tap that arms the marker. */
  onTap?(): void;
  /** The click or tap that disarms an armed marker. A mark's panel is the exception: that tap releases the mark. */
  onDisarm?(): void;
  /** The capsule listens, so an open menu keeps it awake. */
  onOpenChange?(open: boolean): void;
  /** A tapped highlight: the panel is open on its look and edits it (Comment and Delete too) until it is released. */
  mark?: {
    look: Marker;
    onChange(change: Partial<Marker>): void;
    onComment(): void;
    onDelete(): void;
    onRelease(): void;
  };
  /** The editor row's tile class; the button then takes the toolbar's look instead of the capsule's round one. */
  buttonClass?: string;
}

/**
 * The marker in the hand, as a button (R19): it shows the armed marker, a dot in its color or the underline glyph.
 * A click or tap only arms it and, armed, puts it away; it never opens a panel of the pen. Given a `mark`, the panel
 * opens under the button for that highlight (MarkPanel: its look, Comment, Delete), and a dismissal releases it.
 */
export default function MarkerButton({ marker, armed = false, onTap, onDisarm, onOpenChange, mark, buttonClass }: MarkerButtonProps) {
  const open = Boolean(mark);
  const [moreOpen, setMoreOpen] = useState(false);
  const badge = markerBadge(marker);

  // Closing a mark's panel by any way lets the mark go.
  const close = () => {
    setMoreOpen(false);
    mark?.onRelease();
  };
  // A mark's panel keeps the capsule awake, and tells it when the mark goes.
  useEffect(() => {
    if (!open) return;
    onOpenChange?.(true);
    return () => { setMoreOpen(false); onOpenChange?.(false); };
  }, [open]);

  // R9: a touch screen with a keyboard answers the desktop keys while the panel is open. The latest mark is read
  // through a ref, so the listener is added once per open. Escape stays with the dismiss hook below.
  const live = useRef(mark);
  live.current = mark;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const current = live.current;
      if (!current) return;
      const action = keyAction(e, { typing: isTypingTarget(e.target), layers: ['toolbar'] });
      const intent = action && markKeyIntent(action, current.look);
      if (!intent) return;
      e.preventDefault();
      if ('change' in intent) { current.onChange(intent.change); return; }
      if ('comment' in intent) current.onComment();
      else current.onDelete();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Floating UI places the menu inside the wrapper (so it stays in a fullscreen element) and keeps it on screen;
  // its dismiss hook owns Escape and the outside press. Fixed, so the first frame never widens the page's scroll width.
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => { if (!next) close(); },
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [offset(8), flip(), shift({ padding: 16 })],
    whileElementsMounted: autoUpdate,
  });
  // The More popover is portaled out of the panel: a press in it is not an outside press, and Escape closes it first.
  const dismiss = useDismiss(context, {
    escapeKey: !moreOpen,
    outsidePress: (e) => !(e.target as Element | null)?.closest?.('[data-editor-popover]'),
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  return (
    <span
      class={buttonClass ? `${styles.wrap} ${toolbarStyles.dropdown}` : styles.wrap} data-marker-button data-tile={buttonClass ? '' : undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open || moreOpen) return;
        e.stopPropagation();
        close();
        (e.currentTarget as HTMLElement).querySelector<HTMLElement>('button')?.focus();
      }}
    >
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        type="button" class={buttonClass ?? styles.button} aria-haspopup={mark ? 'true' : undefined} aria-expanded={open}
        aria-label={t.marker} title={t.marker} data-armed={armed ? '' : undefined}
        onClick={() => {
          // A mark's panel is open: the button releases it. Otherwise a click arms the marker and the next one puts it away.
          if (mark) close();
          else if (armed) onDisarm?.();
          else onTap?.();
        }}
      >
        <span class={styles.face}>
          <HighlightIcon size={18} />
          {badge.kind === 'dot' ? (
            <i class={styles.dot} data-marker-dot style={{ background: badge.color, opacity: badge.opacity }} />
          ) : (
            <i class={styles.glyph} data-marker-underline style={{ background: badge.ink }} />
          )}
        </span>
        {buttonClass && <span class={toolbarStyles.label}>{t.marker}</span>}
      </button>
      {mark && (
        <div
          ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}
          class={`${styles.menu} ${controls.popover} ${controls['toolbar-menu']}`} role="group" aria-label={t.marker}
        >
          <MarkPanel
            look={mark.look} onChange={mark.onChange} moreOpen={moreOpen} onMoreOpenChange={setMoreOpen}
            onComment={() => { mark.onComment(); close(); }} onDelete={() => { mark.onDelete(); close(); }}
          />
        </div>
      )}
    </span>
  );
}
