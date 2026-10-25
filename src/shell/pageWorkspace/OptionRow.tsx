import { useRef } from 'preact/hooks';
import styles from './OptionRow.module.css';

export interface Option<T extends string | number> {
  value: T;
  label: string;
  /** The one-line description shown under the row while this option is selected. */
  hint?: string;
}

interface OptionRowProps<T extends string | number> {
  /** Prefix for the label and note ids. */
  id: string;
  /** The group's accessible name; also shown above the control unless `showLabel` is false. */
  label: string;
  showLabel?: boolean;
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
  dir: 'ltr' | 'rtl';
  /** The line under the control; defaults to the selected option's hint. */
  note?: string;
  /** The phone bar's version: shares the line with Download, labels may wrap. */
  compact?: boolean;
}

/** A labelled radiogroup shown as one segmented row, 44px tall. Arrows, Home and End move the choice. */
export default function OptionRow<T extends string | number>({
  id, label, showLabel = true, options, value, onChange, dir, note, compact = false,
}: OptionRowProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.find((o) => o.value === value) ?? options[0];
  // The compact form lives in the phone bar, which stays one line: no note there.
  const noteText = compact ? undefined : note ?? selected.hint;

  const onKeyDown = (e: KeyboardEvent) => {
    const rtl = dir === 'rtl';
    const i = options.findIndex((o) => o.value === value);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = i + (rtl ? -1 : 1);
    else if (e.key === 'ArrowLeft') next = i + (rtl ? 1 : -1);
    else if (e.key === 'ArrowDown') next = i + 1;
    else if (e.key === 'ArrowUp') next = i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next === null) return;
    e.preventDefault();
    const target = (next + options.length) % options.length;
    if (options[target].value !== value) onChange(options[target].value);
    refs.current[target]?.focus();
  };

  return (
    <div class={styles.row} data-compact={compact || undefined}>
      {showLabel && <p id={`${id}-label`} class={styles.label}>{label}</p>}
      <div
        role="radiogroup"
        {...(showLabel ? { 'aria-labelledby': `${id}-label` } : { 'aria-label': label })}
        aria-describedby={noteText ? `${id}-note` : undefined}
        class={styles.seg}
        onKeyDown={onKeyDown}
      >
        {options.map((option, index) => (
          <button
            key={option.value}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            tabIndex={value === option.value ? 0 : -1}
            class={styles.option}
            onClick={() => { if (value !== option.value) onChange(option.value); }}
          >
            {option.label}
          </button>
        ))}
      </div>
      {noteText && <p id={`${id}-note`} class={styles.note} data-option-note>{noteText}</p>}
    </div>
  );
}
