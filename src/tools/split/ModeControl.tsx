import { useRef } from 'preact/hooks';
import type { SplitMessages } from '../../i18n/toolMessages';
import type { SplitMode } from './splitOutput.ts';
import styles from './ModeControl.module.css';

const MODES: SplitMode[] = ['combined', 'separate'];

interface ModeControlProps {
  mode: SplitMode;
  onChange: (mode: SplitMode) => void;
  messages: Pick<SplitMessages, 'modeGroupLabel' | 'modeCombined' | 'modeSeparate'>;
  /** The one-line note under the control (the rail has it; the phone bar does not). */
  note?: string;
  /** The phone bar's version: shares the line with Download, labels may wrap. */
  compact?: boolean;
}

/** What to save: one PDF, or one per page. A two-way radiogroup, 44px tall, arrows and Home/End move the choice. */
export default function ModeControl({ mode, onChange, messages, note, compact = false }: ModeControlProps) {
  const radios = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: KeyboardEvent) => {
    const current = MODES.indexOf(mode);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current + 1) % 2;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    if (next === null) return;
    event.preventDefault();
    if (MODES[next] !== mode) onChange(MODES[next]);
    radios.current[next]?.focus();
  };

  return (
    <div class={`${styles.setting}${compact ? ` ${styles.compact}` : ''}`}>
      <div class={styles.segmented} role="radiogroup" aria-label={messages.modeGroupLabel} onKeyDown={onKeyDown}>
        {MODES.map((m, index) => (
          <button
            key={m}
            ref={(el) => { radios.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={mode === m}
            tabIndex={mode === m ? 0 : -1}
            class={`${styles.segment}${mode === m ? ` ${styles['is-active']}` : ''}`}
            onClick={() => { if (m !== mode) onChange(m); }}
          >
            {m === 'combined' ? messages.modeCombined : messages.modeSeparate}
          </button>
        ))}
      </div>
      {note && <p class={styles.note}>{note}</p>}
    </div>
  );
}
