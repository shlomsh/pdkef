import { useLayoutEffect } from 'preact/hooks';
import { useFloating, offset, shift, autoUpdate } from '@floating-ui/react';
import styles from './FontSupportNotice.module.css';

/**
 * Direction-to-position contract kept independent from Floating UI. The text
 * node already owns direction detection; this function only maps that result
 * to physical edges because the reference wrapper itself has no `dir`.
 */
export function getFontNoticePosition(direction: string, isActive: boolean) {
  const isRtl = direction === 'rtl';
  if (isActive) {
    return {
      placement: isRtl ? 'bottom-end' : 'bottom-start',
      offset: 8,
      markerSide: null,
    } as const;
  }
  return {
    placement: isRtl ? 'bottom-start' : 'bottom-end',
    offset: {
      mainAxis: -10,
      crossAxis: isRtl ? -12 : 12,
    },
    markerSide: isRtl ? 'left' : 'right',
  } as const;
}

/** Presentation only: the text node owns compatibility and accessibility. */
export type FontSupportNoticeProps = {
  reference: { current: HTMLElement | null };
  message: string;
  needsAttention: boolean;
  isActive: boolean;
  onEdit: () => void;
  direction: string;
};

export default function FontSupportNotice({ reference, message, needsAttention, isActive, onEdit, direction }: FontSupportNoticeProps) {
  const position = getFontNoticePosition(direction, isActive);
  const { refs, floatingStyles } = useFloating({
    // The compact marker sits at the logical end of the bottom edge: right
    // for LTR and left for RTL. Use physical placements because the reference
    // wrapper itself does not carry a `dir` attribute; its textarea does.
    placement: position.placement,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(position.offset),
      shift({ padding: 10 })
    ],
  });
  useLayoutEffect(() => { refs.setReference(reference.current); }, [reference, refs.setReference]);

  return (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className={`${styles.notice} ${isActive ? styles.detail : styles.marker}${needsAttention ? ` ${styles.warning}` : ''}`}
      data-editor-font-notice
      data-editor-font-placement={position.placement}
      data-editor-font-marker-side={position.markerSide ?? undefined}
      dir="ltr"
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
    >
      {isActive
        ? <p>{message}</p>
        : (
          <button
            type="button"
            className={styles['marker-button']}
            aria-label="Text needs attention. Select for font suggestions."
            title="Text needs attention"
            onClick={onEdit}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2.75v7" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              <circle cx="8" cy="13" r="1.15" fill="currentColor" />
            </svg>
          </button>
        )}
    </div>
  );
}
