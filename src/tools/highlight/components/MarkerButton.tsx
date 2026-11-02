import { useEffect, useRef, useState } from 'preact/hooks';
import { autoUpdate, flip, offset, shift, useDismiss, useFloating, useInteractions } from '@floating-ui/react';
import { CommentIcon, HighlightIcon, TrashIcon } from '#editor-ui/toolIcons.tsx';
import { TOP_COLORS, type Marker } from '../lib/marker/markerState.ts';
import { markerBadge } from '../lib/marker/markerBadge.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import controls from '#editor-ui/EditorControls.module.css';
import toolbarStyles from '#editor-ui/SignToolbar.module.css';
import { StyleToggle } from './LookControls.tsx';
import MoreColors, { ColorCells } from './MoreColors.tsx';
import styles from './MarkerButton.module.css';

const coarsePointer = () => Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);

interface MarkerButtonProps {
  marker: Marker;
  /** Every change is a re-arm (R5). */
  onChange(change: Partial<Marker>): void;
  /** On touch: the marker is armed, so a tap on it puts it away (and closes the panel). */
  armed?: boolean;
  /** On touch: the tap that arms the marker. A fine pointer never calls it (the marker is always armed, R1). */
  onTap?(): void;
  /** On touch: the tap that disarms an armed marker. A mark's panel is the exception: that tap releases the mark. */
  onDisarm?(): void;
  /** The capsule listens, so an open menu keeps it awake. */
  onOpenChange?(open: boolean): void;
  /** Whether taps are the input; the coarse-pointer query by default. */
  isCoarse?(): boolean;
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
 * The marker in the hand, as a button (R19): it shows the armed marker, a dot in its color or the underline
 * glyph, and opens the panel of the look, one row: the three top colors, More (the rest and the color wheel), and the Highlight | Underline toggle, whose carets hold the opacity and the thickness. On touch a tap only arms and disarms it. Given a `mark`, the panel is that highlight's: it edits it, adds Comment and Delete, and a dismissal releases it.
 */
export default function MarkerButton({ marker, onChange, armed = false, onTap, onDisarm, onOpenChange, isCoarse = coarsePointer, mark, buttonClass }: MarkerButtonProps) {
  const [penOpen, setOpen] = useState(false);
  const open = penOpen || Boolean(mark);
  const look = mark ? mark.look : marker;
  const apply = mark ? mark.onChange : onChange;
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusColors = useRef(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const badge = markerBadge(marker);

  const toggle = (next: boolean) => {
    setOpen(next);
    if (!next) setMoreOpen(false);
    onOpenChange?.(next);
  };
  // Closing a mark's panel by any way lets the mark go.
  const close = () => {
    toggle(false);
    mark?.onRelease();
  };
  const hasMark = Boolean(mark);
  // A mark's panel keeps the capsule awake like the pen's, and tells it when the mark goes.
  useEffect(() => {
    if (!hasMark) return;
    onOpenChange?.(true);
    return () => { setOpen(false); setMoreOpen(false); onOpenChange?.(false); };
  }, [hasMark]);

  // Floating UI places the menu inside the wrapper (so it stays in a fullscreen element) and keeps it on screen;
  // its dismiss hook owns Escape and the outside press.
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => (next ? toggle(true) : close()),
    placement: 'bottom-start',
    strategy: 'absolute',
    middleware: [offset(8), flip(), shift({ padding: 16 })],
    whileElementsMounted: autoUpdate,
  });
  // The More popover is portaled out of the panel: a press in it is not an outside press, and Escape closes it first.
  const dismiss = useDismiss(context, {
    escapeKey: !moreOpen,
    outsidePress: (e) => !(e.target as Element | null)?.closest?.('[data-editor-popover]'),
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  // A keyboard open puts focus on the armed color, so the colors can be walked without a pointer.
  useEffect(() => {
    if (!open || !focusColors.current) return;
    focusColors.current = false;
    const root = rootRef.current;
    (root?.querySelector<HTMLElement>('[data-highlight-swatch][aria-pressed="true"]') ?? root?.querySelector<HTMLElement>('[data-highlight-swatch]'))?.focus();
  }, [open]);

  return (
    <span
      class={buttonClass ? `${styles.wrap} ${toolbarStyles.dropdown}` : styles.wrap} ref={rootRef} data-marker-button data-tile={buttonClass ? '' : undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open || moreOpen) return;
        e.stopPropagation();
        close();
        buttonRef.current?.focus();
      }}
    >
      <button
        ref={(el: HTMLButtonElement | null) => { buttonRef.current = el; refs.setReference(el); }}
        {...getReferenceProps()}
        type="button" class={buttonClass ?? styles.button} aria-haspopup="true" aria-expanded={open}
        aria-label={t.marker} title={t.marker} data-armed={armed && isCoarse() ? '' : undefined}
        onClick={(e) => {
          // On touch a tap only arms the marker and the next one disarms it; the panel is a tapped highlight's.
          if (isCoarse() && !mark) { if (armed) onDisarm?.(); else onTap?.(); return; }
          focusColors.current = !open && e.detail === 0;
          if (open) close(); else toggle(true);
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
      {open && (
        <div
          ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}
          class={`${styles.menu} ${controls.popover} ${controls['toolbar-menu']}`} role="group" aria-label={t.marker}
        >
          <div class={styles.bar} data-marker-row>
            <ColorCells colors={TOP_COLORS} color={look.color} onChange={(color) => { apply({ color }); if (!mark) toggle(false); }} />
            <MoreColors
              color={look.color} open={moreOpen} onOpenChange={setMoreOpen}
              onPick={(color) => { apply({ color }); if (!mark) toggle(false); }}
            />
            <div class={styles.divider} />
            <StyleToggle look={look} onChange={apply} tone="light" />
            {mark && (
              <span class={styles.acts}>
                <button
                  type="button" class={styles.act} aria-label={t.markComment} title={t.markComment}
                  onClick={() => { mark.onComment(); close(); }}
                >
                  <CommentIcon size={18} />
                </button>
                <button
                  type="button" class={`${styles.act} ${styles.danger}`} aria-label={t.markDelete} title={t.markDelete}
                  onClick={() => { mark.onDelete(); close(); }}
                >
                  <TrashIcon />
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
