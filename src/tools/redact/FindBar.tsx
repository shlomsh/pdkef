import { useEffect, useRef } from 'preact/hooks';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-preact';
import ToolbarMenu from '../../editor-ui/ToolbarMenu.tsx';
import type { PresetKey } from './find/types.ts';
import styles from './FindBar.module.css';

/** What a found match becomes. Whiteout is left out on purpose: it hides
 * text on a white page only, and a search result is exactly where that
 * assumption would go unchecked. */
export type FindRedactStyle = 'blackout' | 'blur';

export const PRESET_LABELS: Record<PresetKey, string> = {
  email: 'Email addresses',
  phone: 'Phone numbers',
  idNumber: 'ID and card numbers',
};

export interface FindSummary {
  /** Matches not yet under a redaction box. */
  open: number;
  /** Matches already covered. */
  covered: number;
  /** 1-based position of the current match among all matches, or 0. */
  position: number;
  total: number;
  pages: number;
  /** Pages read so far, while the text is still being read. */
  reading: { done: number; of: number } | null;
  failed: boolean;
  currentCovered: boolean;
}

/**
 * RED-02: the find row under Redact's toolbar. Presentational only - the
 * island owns the query, the matches and every edit. It proposes; the person
 * decides which matches become boxes, one at a time or all at once.
 */
export default function FindBar({
  term,
  preset,
  onTermChange,
  onPresetChange,
  summary,
  onPrev,
  onNext,
  redactStyle,
  onRedactStyleChange,
  onRedactCurrent,
  onRedactAll,
  onClose,
}: {
  term: string;
  preset: PresetKey | null;
  onTermChange: (term: string) => void;
  onPresetChange: (preset: PresetKey | null) => void;
  summary: FindSummary;
  onPrev: () => void;
  onNext: () => void;
  redactStyle: FindRedactStyle;
  onRedactStyleChange: (style: FindRedactStyle) => void;
  onRedactCurrent: () => void;
  onRedactAll: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const searching = preset !== null || term.trim() !== '';
  const hasMatches = summary.total > 0;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) onPrev(); else onNext();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  let status = '';
  if (summary.failed) status = 'Could not read this file\'s text';
  else if (!searching) status = summary.reading ? `Reading page ${summary.reading.done} of ${summary.reading.of}` : '';
  else if (!hasMatches) status = summary.reading ? `Reading page ${summary.reading.done} of ${summary.reading.of}` : 'No matches';
  else {
    status = `${summary.position} of ${summary.total}`;
    if (summary.pages > 1) status += ` on ${summary.pages} pages`;
    if (summary.covered > 0) status += `, ${summary.covered} covered`;
  }

  // A phone has room for the count alone; the full sentence stays for
  // screen readers and wider screens.
  const shortStatus = searching && hasMatches ? `${summary.position}/${summary.total}` : status;

  return (
    <div className={styles['find-bar']} role="search" aria-label="Find and redact" data-redact-find-bar>
      <div className={styles.field}>
        <Search size={16} aria-hidden="true" className={styles['field-icon']} />
        {preset ? (
          <span className={styles.chip} data-redact-find-preset-chip>
            {PRESET_LABELS[preset]}
            <button type="button" className={styles['chip-clear']} onClick={() => { onPresetChange(null); inputRef.current?.focus(); }} aria-label="Clear">
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ) : null}
        <input
          ref={inputRef}
          type="search"
          dir="auto"
          className={styles.input}
          value={preset ? '' : term}
          placeholder={preset ? '' : 'Find text to redact'}
          aria-label="Find text to redact"
          onInput={(event) => {
            if (preset) onPresetChange(null);
            onTermChange((event.target as HTMLInputElement).value);
          }}
          onKeyDown={onKeyDown}
          spellcheck={false}
          autocomplete="off"
          data-redact-find-input
        />
        <ToolbarMenu
          title="Find a kind of detail"
          triggerClassName={styles['preset-trigger']}
          triggerAttrs={{ 'data-redact-find-presets': true }}
          triggerContent={<><span>Find</span><ChevronDown size={14} aria-hidden="true" /></>}
          items={(Object.keys(PRESET_LABELS) as PresetKey[]).map((key) => ({
            label: PRESET_LABELS[key],
            onSelect: () => { onPresetChange(key); inputRef.current?.focus(); },
            attrs: { 'data-redact-find-preset': key },
          }))}
        />
      </div>

      <span className={styles.status} data-redact-find-status-box>
        <span className={styles['status-long']} aria-live="polite" data-redact-find-status>{status}</span>
        <span className={styles['status-short']} aria-hidden="true">{shortStatus}</span>
      </span>

      <div className={styles.nav}>
        <button type="button" className={styles['icon-button']} onClick={onPrev} disabled={!hasMatches} title="Previous match" aria-label="Previous match">
          <ChevronUp size={18} aria-hidden="true" />
        </button>
        <button type="button" className={styles['icon-button']} onClick={onNext} disabled={!hasMatches} title="Next match" aria-label="Next match">
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </div>

      <div className={styles.segmented} role="group" aria-label="Redact matches with">
        {(['blackout', 'blur'] as const).map((style) => (
          <button
            key={style}
            type="button"
            aria-pressed={redactStyle === style}
            className={`${styles.segment}${redactStyle === style ? ` ${styles.selected}` : ''}`}
            onClick={() => onRedactStyleChange(style)}
          >
            {style === 'blackout' ? 'Blackout' : 'Blur'}
          </button>
        ))}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          onClick={onRedactCurrent}
          disabled={!hasMatches || summary.currentCovered}
          data-redact-find-this
        >
          Redact this
        </button>
        <button
          type="button"
          className={`${styles.action} ${styles.primary}`}
          onClick={onRedactAll}
          disabled={summary.open === 0}
          data-redact-find-all
        >
          {summary.open > 0 ? `Redact all ${summary.open}` : 'Redact all'}
        </button>
      </div>

      <button type="button" className={`${styles['icon-button']} ${styles.close}`} onClick={onClose} title="Close find" aria-label="Close find" data-redact-find-close>
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
