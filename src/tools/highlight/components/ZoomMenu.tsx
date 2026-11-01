import { useEffect, useRef, useState } from 'preact/hooks';
import type { FitMode, ZoomSetting } from '../lib/zoom/fit.ts';
import { zoomPercent } from '../lib/zoom/percent.ts';
import type { HighlightMessages } from '../messages.ts';
import styles from './ZoomMenu.module.css';

type Labels = Pick<HighlightMessages, 'zoom' | 'fitWidth' | 'fitText' | 'fitPage' | 'actualSize' | 'zoomIn' | 'zoomOut'>;

interface ZoomMenuProps {
  zoom: number;
  setting: ZoomSetting;
  onSetting(mode: FitMode): void;
  onStep(dir: 1 | -1): void;
  onActual(): void;
  labels: Labels;
  /** The capsule listens, so an open menu keeps it awake. */
  onOpenChange?(open: boolean): void;
}

export default function ZoomMenu({ zoom, setting, onSetting, onStep, onActual, labels, onOpenChange }: ZoomMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const toggle = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const close = () => toggle(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  });

  const modes: [FitMode, string][] = [['width', labels.fitWidth], ['text', labels.fitText], ['page', labels.fitPage]];
  const percent = zoomPercent(zoom);
  return (
    <span class={styles.wrap} ref={rootRef} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(); } }}>
      <button type="button" class={styles.trigger} aria-haspopup="menu" aria-expanded={open} aria-label={`${labels.zoom} ${percent}%`} title={labels.zoom} onClick={() => toggle(!open)}>
        {percent}%
      </button>
      {open && (
        <div class={styles.menu} role="menu" aria-label={labels.zoom}>
          {modes.map(([mode, label]) => (
            <button key={mode} type="button" role="menuitemradio" aria-checked={setting === mode} class={styles.item} onClick={() => { onSetting(mode); close(); }}>
              <span class={styles.check} aria-hidden="true">{setting === mode ? '✓' : ''}</span>{label}
            </button>
          ))}
          <button type="button" role="menuitem" class={styles.item} onClick={() => { onActual(); close(); }}>
            <span class={styles.check} aria-hidden="true" />{labels.actualSize}
          </button>
          <div class={styles.stepRow} role="group" aria-label={labels.zoom}>
            <button type="button" class={styles.step} aria-label={labels.zoomOut} title={labels.zoomOut} onClick={() => onStep(-1)}>−</button>
            <span class={styles.percent}>{percent}%</span>
            <button type="button" class={styles.step} aria-label={labels.zoomIn} title={labels.zoomIn} onClick={() => onStep(1)}>+</button>
          </div>
        </div>
      )}
    </span>
  );
}
