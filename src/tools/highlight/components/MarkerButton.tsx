import { useEffect, useRef, useState } from 'preact/hooks';
import { autoUpdate, flip, offset, shift, useDismiss, useFloating, useInteractions } from '@floating-ui/react';
import UnderlineGlyph from './UnderlineGlyph.tsx';
import HighlightSwatches from '#editor-ui/highlight/HighlightSwatches.tsx';
import { HighlightIcon } from '#editor-ui/toolIcons.tsx';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { HIGHLIGHT_COLORS, type Marker } from '../lib/marker/markerState.ts';
import { markerBadge } from '../lib/marker/markerBadge.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import controls from '#editor-ui/EditorControls.module.css';
import toolbarStyles from '#editor-ui/SignToolbar.module.css';
import ColorWheelInput from '#editor-ui/ColorWheelInput.tsx';
import OpacitySlider from './OpacitySlider.tsx';
import styles from './MarkerButton.module.css';

const coarsePointer = () => Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);


interface MarkerButtonProps {
  marker: Marker;
  /** Every change is a re-arm (R5). */
  onChange(change: Partial<Marker>): void;
  /** On touch: the marker is armed, so a tap only opens the colors. */
  armed?: boolean;
  /** On touch: the tap that arms the marker. A fine pointer never calls it (the marker is always armed, R1). */
  onTap?(): void;
  /** The capsule listens, so an open menu keeps it awake. */
  onOpenChange?(open: boolean): void;
  /** Whether taps are the input; the coarse-pointer query by default. */
  isCoarse?(): boolean;
  /** The editor row's tile class; the button then takes the toolbar's look instead of the capsule's round one. */
  buttonClass?: string;
}

/**
 * The marker in the hand, as a button (R19): it shows the armed marker, a dot in its color or the underline
 * glyph, and opens the six colors, the color wheel and Underline, with the opacity slider under them on a highlight. On touch a tap also arms the marker.
 */
export default function MarkerButton({ marker, onChange, armed = false, onTap, onOpenChange, isCoarse = coarsePointer, buttonClass }: MarkerButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusColors = useRef(false);
  const badge = markerBadge(marker);
  const underline = marker.style === 'underline';
  const inSix = HIGHLIGHT_COLORS.some((c) => c.hex.toLowerCase() === marker.color.toLowerCase());

  const toggle = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  // Floating UI places the menu inside the wrapper (so it stays in a fullscreen element) and keeps it on screen;
  // its dismiss hook owns Escape and the outside press.
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: toggle,
    placement: 'bottom-start',
    strategy: 'absolute',
    middleware: [offset(8), flip(), shift({ padding: 16 })],
    whileElementsMounted: autoUpdate,
  });
  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true });
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
        if (e.key !== 'Escape' || !open) return;
        e.stopPropagation();
        toggle(false);
        buttonRef.current?.focus();
      }}
    >
      <button
        ref={(el: HTMLButtonElement | null) => { buttonRef.current = el; refs.setReference(el); }}
        {...getReferenceProps()}
        type="button" class={buttonClass ?? styles.button} aria-haspopup="true" aria-expanded={open}
        aria-label={t.marker} title={t.marker} data-armed={armed && isCoarse() ? '' : undefined}
        onClick={(e) => {
          if (!armed && isCoarse()) onTap?.();
          focusColors.current = !open && e.detail === 0;
          toggle(!open);
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
          <div class={styles.row}>
            <HighlightSwatches color={marker.color} t={englishSignMessages} onChange={({ color }) => { onChange({ color }); toggle(false); }} />
            <ColorWheelInput
              value={marker.color} label={t.markColorInput} pressed={!inSix}
              onCommit={(color) => onChange({ color })}
            />
            <button
              type="button" class={styles.ul} aria-label={t.markUnderline} aria-pressed={underline} title={t.markUnderline}
              onClick={() => onChange({ style: underline ? 'highlight' : 'underline' })}
            >
              <UnderlineGlyph />
            </button>
          </div>
          {!underline && <OpacitySlider value={marker.opacity} onChange={(opacity) => onChange({ opacity })} />}
        </div>
      )}
    </span>
  );
}
