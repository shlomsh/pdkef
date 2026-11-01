import { useEffect, useRef, useState } from 'preact/hooks';
import HighlightSwatches from '#editor-ui/highlight/HighlightSwatches.tsx';
import { HighlightIcon } from '#editor-ui/toolIcons.tsx';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { HIGHLIGHT_COLORS, type Marker } from '../lib/marker/markerState.ts';
import { markerBadge } from '../lib/marker/markerBadge.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import controls from '#editor-ui/EditorControls.module.css';
import styles from './MarkerButton.module.css';

const coarsePointer = () => Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);

const underlineIcon = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true } as const;

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

/** R19: the color input and the opacity slider (30 to 100%) behind the plus. */
function CustomPanel({ marker, onChange }: { marker: Marker; onChange(change: Partial<Marker>): void }) {
  const percent = Math.round(marker.opacity * 100);
  return (
    <div class={styles.panel} role="group" aria-label={t.markCustom}>
      <div class={styles.prow}>
        <span>{t.markColors}</span>
        <input
          type="color" class={styles.pick} aria-label={t.markColorInput} value={marker.color.toLowerCase()}
          onInput={(e) => onChange({ color: (e.target as HTMLInputElement).value.toUpperCase() })}
        />
      </div>
      <div class={styles.prow}>
        <span>{t.markOpacity}</span>
        <input
          type="range" class={styles.range} min={30} max={100} step={5} value={percent} aria-label={t.markOpacity}
          onInput={(e) => onChange({ opacity: Number((e.target as HTMLInputElement).value) / 100 })}
        />
        <span class={styles.val} aria-hidden="true">{percent}%</span>
      </div>
    </div>
  );
}

/**
 * The marker in the hand, as a button (R19): it shows the armed marker, a dot in its color or the underline
 * glyph, and opens the six colors, Underline and the plus. On touch a tap also arms the marker.
 */
export default function MarkerButton({ marker, onChange, armed = false, onTap, onOpenChange, isCoarse = coarsePointer, buttonClass }: MarkerButtonProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusColors = useRef(false);
  const badge = markerBadge(marker);
  const underline = marker.style === 'underline';
  const inSix = HIGHLIGHT_COLORS.some((c) => c.hex.toLowerCase() === marker.color.toLowerCase());

  const toggle = (next: boolean) => {
    setOpen(next);
    if (!next) setCustom(false);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => { if (!rootRef.current?.contains(e.target as Node)) toggle(false); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  });

  // A keyboard open puts focus on the armed color, so the colors can be walked without a pointer.
  useEffect(() => {
    if (!open || !focusColors.current) return;
    focusColors.current = false;
    const root = rootRef.current;
    (root?.querySelector<HTMLElement>('[data-highlight-swatch][aria-pressed="true"]') ?? root?.querySelector<HTMLElement>('[data-highlight-swatch]'))?.focus();
  }, [open]);

  return (
    <span
      class={styles.wrap} ref={rootRef} data-marker-button data-tile={buttonClass ? '' : undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        e.stopPropagation();
        toggle(false);
        buttonRef.current?.focus();
      }}
    >
      <button
        ref={buttonRef} type="button" class={buttonClass ?? styles.button} data-icon-only={buttonClass ? '' : undefined} aria-haspopup="true" aria-expanded={open}
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
      </button>
      {open && (
        <div class={`${styles.menu} ${controls.popover} ${controls['toolbar-menu']}`} role="group" aria-label={t.marker}>
          <div class={styles.row}>
            <HighlightSwatches color={marker.color} t={englishSignMessages} onChange={({ color }) => { onChange({ color }); toggle(false); }} />
            <button
              type="button" class={styles.plus} aria-label={t.markCustom} aria-haspopup="true" aria-expanded={custom}
              onClick={() => setCustom((c) => !c)}
            >
              <i class={`${styles.plusMark} ${inSix ? '' : styles.plusCustom}`} style={inSix ? undefined : { '--c': marker.color }} />
            </button>
            <button
              type="button" class={styles.ul} aria-label={t.markUnderline} aria-pressed={underline} title={t.markUnderline}
              onClick={() => onChange({ style: underline ? 'highlight' : 'underline' })}
            >
              <svg {...underlineIcon}><path d="M6 4v7a6 6 0 0 0 12 0V4" /><path d="M4 21h16" /></svg>
            </button>
          </div>
          {custom && <CustomPanel marker={marker} onChange={onChange} />}
        </div>
      )}
    </span>
  );
}
