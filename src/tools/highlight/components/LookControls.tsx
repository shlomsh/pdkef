import { HighlightIcon } from '#editor-ui/toolIcons.tsx';
import ThicknessPickerMenu from '#editor-ui/ThicknessPickerMenu.tsx';
import { UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import Chevron from './Chevron.tsx';
import UnderlineGlyph from './UnderlineGlyph.tsx';
import OpacityMenu from './OpacityMenu.tsx';
import styles from './LookControls.module.css';

const THICKNESS_OPTIONS = [1, 1.5, 2, 3, 4];

type Look = { look: Marker; onChange(change: Partial<Marker>): void };

/** Highlight | Underline: two plain segments, the current one pressed. Only the other one acts. */
export function StyleToggle({ look, onChange }: Look) {
  const underline = look.style === 'underline';
  return (
    <span class={styles.toggle} data-style-toggle>
      <button
        type="button" class={styles.segment}
        aria-label={t.markHighlight} aria-pressed={!underline} title={t.markHighlight}
        onClick={() => { if (underline) onChange({ style: 'highlight' }); }}
      >
        <HighlightIcon />
      </button>
      <button
        type="button" class={styles.segment}
        aria-label={t.markUnderline} aria-pressed={underline} aria-keyshortcuts="U" title={t.markUnderline}
        onClick={() => { if (!underline) onChange({ style: 'underline' }); }}
      >
        <UnderlineGlyph bar={look.strokeWidth ?? UNDERLINE_WIDTH.default} />
      </button>
    </span>
  );
}

/** The active style's one setting, beside the switch: the highlight's opacity (a dot and its percent) or the underline's thickness (a line). */
export function StyleSetting({ look, onChange }: Look) {
  if (look.style === 'underline') {
    const width = look.strokeWidth ?? UNDERLINE_WIDTH.default;
    return (
      <ThicknessPickerMenu
        value={width} title={t.markThickness} options={THICKNESS_OPTIONS} triggerClass={styles.setting}
        itemTitle={(n) => formatMessage(t.thicknessItem, { n })}
        onChange={(strokeWidth) => onChange({ style: 'underline', strokeWidth })}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={width} stroke-linecap="round" aria-hidden="true" data-setting-line>
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
        <Chevron />
      </ThicknessPickerMenu>
    );
  }
  return (
    <OpacityMenu value={look.opacity} triggerClass={styles.setting} onChange={(opacity) => onChange({ style: 'highlight', opacity })}>
      <i class={styles.dot} data-setting-dot style={{ background: look.color, opacity: look.opacity }} />
      <span>{Math.round(look.opacity * 100)}%</span>
      <Chevron />
    </OpacityMenu>
  );
}
