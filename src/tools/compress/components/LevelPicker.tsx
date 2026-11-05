import OptionRow, { type Option } from '#shell/pageWorkspace/OptionRow.tsx';
import rowStyles from '#shell/pageWorkspace/OptionRow.module.css';
import type { CompressMessages } from '../messages';
import styles from './LevelPicker.module.css';

export type Level = 'high' | 'medium' | 'low' | 'target';

export type OnTargetChange = (kb: number, opts: { immediate: boolean }) => void;

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
        {/* The whole box takes the press, unit and padding included. */}
        <div class={styles['target-input-row']} onClick={(e) => e.currentTarget.querySelector('input')?.focus()}>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={min}
            step={step}
            value={targetKB}
            // As wide as its digits: three hold the common sizes, a five-digit one still shows whole.
            style={{ width: `${Math.max(3, String(targetKB).length) + 0.5}ch` }}
            onInput={(e) => {
              const n = Number(e.currentTarget.value);
              if (Number.isFinite(n) && n > 0) onChange(n, { immediate: false });
            }}
          />
          <span class={styles['target-unit']}>KB</span>
        </div>
        {/* Not a radiogroup: a typed size leaves no shortcut pressed. The levels' track all the same. */}
        <div class={`${rowStyles.seg} ${styles['target-presets']}`} data-look="raised">
          {presets.map((kb) => (
            <button
              key={kb}
              type="button"
              aria-pressed={targetKB === kb}
              class={rowStyles.option}
              onClick={() => onChange(kb, { immediate: true })}
            >
              {/* The number is what tells the shortcuts apart; the unit repeats, so it stays small. */}
              <span class={styles['preset-number']}>{kb >= 1000 ? kb / 1000 : kb}</span>{' '}
              <span class={styles['preset-unit']}>{kb >= 1000 ? 'MB' : 'KB'}</span>
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
  const options: Option<Level>[] = [
    { value: 'high', label: t.levelHighShort, hint: t.levelHighDesc },
    { value: 'medium', label: t.levelMediumShort, hint: t.levelMediumDesc },
    { value: 'low', label: t.levelLowShort, hint: t.levelLowDesc },
    { value: 'target', label: t.targetShort, hint: t.targetDesc },
  ];

  return (
    <div>
      <OptionRow id="level-picker" label={t.levelPickerLabel} options={options} value={value} onChange={onChange} dir={t.dir} look="raised" />
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
