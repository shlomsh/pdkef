import { useEffect, useRef, useState } from 'preact/hooks';
import Popover from '../../../shell/Popover.tsx';
import styles from './MergeRail.module.css';

export interface SortMenuOption {
  value: string;
  label: string;
}

interface SortMenuProps {
  label: string;
  ariaLabel: string;
  value: string;
  options: SortMenuOption[];
  onChange: (value: string) => void;
}

export default function SortMenu({ label, ariaLabel, value, options, onChange }: SortMenuProps) {
  const [open, setOpen] = useState(false);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, selectedIndex]);

  const focusOption = (index: number) => {
    const next = (index + options.length) % options.length;
    optionRefs.current[next]?.focus();
  };

  return (
    <div class={styles['sort-select-wrap']}>
      <span class={styles['sort-label']}>{label}</span>
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="bottom-start"
        offset={6}
        trigger={(
          <button
            type="button"
            class={styles['sort-trigger']}
            data-open={open || undefined}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`${ariaLabel}: ${selected?.label ?? ''}`}
            onKeyDown={(event: KeyboardEvent) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              event.preventDefault();
              setOpen(true);
            }}
          >
            <span>{selected?.label}</span>
            <svg class={styles['sort-chevron']} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m3.5 6 4.5 4 4.5-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        )}
        content={(
          <div class={styles['sort-menu']} role="listbox" aria-label={ariaLabel}>
            {options.map((option, index) => (
              <button
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="option"
                data-value={option.value}
                aria-selected={option.value === value}
                class={styles['sort-option']}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                onKeyDown={(event: KeyboardEvent) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    focusOption(index + 1);
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    focusOption(index - 1);
                  } else if (event.key === 'Home') {
                    event.preventDefault();
                    focusOption(0);
                  } else if (event.key === 'End') {
                    event.preventDefault();
                    focusOption(options.length - 1);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setOpen(false);
                  }
                }}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <svg class={styles['sort-check']} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="m3.25 8.25 3 3 6.5-6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      />
    </div>
  );
}
