import { useRef } from 'preact/hooks';
import type { CompressMessages } from '../messages';
import styles from './LevelPicker.module.css';

export type Level = 'high' | 'medium' | 'low' | 'target';

const ORDER: Level[] = ['high', 'medium', 'low', 'target'];

type OnTargetChange = (kb: number, opts: { immediate: boolean }) => void;

interface TargetSizePanelProps {
  t: CompressMessages;
  targetKB: number;
  presets: number[];
  onChange: OnTargetChange;
  inputId: string;
  min: number;
  step: number;
}

export function TargetSizePanel({ t, targetKB, presets, onChange, inputId, min, step }: TargetSizePanelProps) {
  return (
    <div class={styles['target-panel']}>
      <label class={styles['target-label']} for={inputId}>
        {t.targetSizeLabel}
      </label>
      <div class={styles['target-row']}>
        <div class={styles['target-input-row']}>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={min}
            step={step}
            value={targetKB}
            onInput={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isFinite(n) && n > 0) onChange(n, { immediate: false });
            }}
          />
          <span class={styles['target-unit']}>KB</span>
        </div>
        <div class={styles['target-presets']}>
          {presets.map((kb) => (
            <button
              key={kb}
              type="button"
              aria-pressed={targetKB === kb}
              class={`${styles['target-preset']}${targetKB === kb ? ` ${styles['is-selected']}` : ''}`}
              onClick={() => onChange(kb, { immediate: true })}
            >
              {kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface LevelPickerProps {
  value: Level;
  onChange: (next: Level) => void;
  t: CompressMessages;
  targetKB: number;
  onTargetKBChange: OnTargetChange;
  presets: number[];
}

export default function LevelPicker({ value, onChange, t, targetKB, onTargetKBChange, presets }: LevelPickerProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const labels: Record<Level, string> = {
    high: t.levelHighShort,
    medium: t.levelMediumShort,
    low: t.levelLowShort,
    target: t.targetShort,
  };
  const descs: Record<Level, string> = {
    high: t.levelHighDesc,
    medium: t.levelMediumDesc,
    low: t.levelLowDesc,
    target: t.targetDesc,
  };

  const select = (next: Level) => {
    onChange(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const rtl = t.dir === 'rtl';
    const i = ORDER.indexOf(value);
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = i + (rtl ? -1 : 1);
    else if (e.key === 'ArrowLeft') next = i + (rtl ? 1 : -1);
    else if (e.key === 'ArrowDown') next = i + 1;
    else if (e.key === 'ArrowUp') next = i - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ORDER.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(ORDER[(next + ORDER.length) % ORDER.length]);
  };

  return (
    <div>
      <p id="level-picker-label" class={styles.label}>
        {t.levelPickerLabel}
      </p>
      <div
        role="radiogroup"
        aria-labelledby="level-picker-label"
        aria-describedby="level-picker-desc"
        class={styles.seg}
        data-level-picker
        onKeyDown={onKeyDown}
      >
        {ORDER.map((level) => (
          <button
            key={level}
            ref={(el) => {
              refs.current[level] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === level}
            tabIndex={value === level ? 0 : -1}
            class={styles.option}
            onClick={() => {
              if (value !== level) onChange(level);
            }}
          >
            {labels[level]}
            {level === 'medium' && <span class={styles.pick} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <p id="level-picker-desc" class={styles.desc}>
        {descs[value]}
      </p>
      {value === 'target' && (
        <TargetSizePanel
          t={t}
          targetKB={targetKB}
          presets={presets}
          onChange={onTargetKBChange}
          inputId="target-size-input"
          min={10}
          step={10}
        />
      )}
    </div>
  );
}
