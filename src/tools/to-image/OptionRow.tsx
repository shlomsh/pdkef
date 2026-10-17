import { useRef } from 'preact/hooks';
import styles from './OptionRow.module.css';

export interface Option<T extends string | number> {
  value: T;
  label: string;
  /** The one-line description shown under the row while this option is selected. */
  hint: string;
}

interface OptionRowProps<T extends string | number> {
  /** Prefix for the label and description ids. */
  id: string;
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
  dir: 'ltr' | 'rtl';
}

/** A labelled radiogroup shown as one segmented row, like Compress's LevelPicker. */
export default function OptionRow<T extends string | number>({ id, label, options, value, onChange, dir }: OptionRowProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.find((o) => o.value === value) ?? options[0];

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
    onChange(options[target].value);
    refs.current[target]?.focus();
  };

  return (
    <div class={styles.row}>
      <p id={`${id}-label`} class={styles.label}>{label}</p>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-desc`}
        class={styles.seg}
        data-count={options.length}
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
      <p id={`${id}-desc`} class={styles.desc}>{selected.hint}</p>
    </div>
  );
}
