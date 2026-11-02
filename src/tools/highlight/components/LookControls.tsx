import { HighlightIcon } from '#editor-ui/toolIcons.tsx';
import ThicknessPickerMenu from '#editor-ui/ThicknessPickerMenu.tsx';
import { UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import type { Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import Chevron from './Chevron.tsx';
import { onRadioKeyDown, radioTabIndex } from './radioKeys.ts';
import StrokeChoice, { StrokeInk } from './StrokeChoice.tsx';
import UnderlineGlyph from './UnderlineGlyph.tsx';
import OpacityMenu from './OpacityMenu.tsx';
import { useToolbarScaled } from './toolbarScale.ts';
import styles from './LookControls.module.css';

const THICKNESS_OPTIONS = [1, 1.5, 2, 3, 4];

type Look = { look: Marker; onChange(change: Partial<Marker>): void };

/** Highlight | Underline: two plain segments, the current one pressed. Only the other one acts. */
export function StyleToggle({ look, onChange }: Look) {
  const underline = look.style === 'underline';
  return (
    <span class={styles.toggle} data-style-toggle role="radiogroup" aria-label={t.markStyle} onKeyDown={onRadioKeyDown}>
      <button
        type="button" class={styles.segment} role="radio"
        aria-label={t.markHighlight} aria-checked={!underline} tabIndex={radioTabIndex(!underline, 0, true)} title={t.markHighlight}
        onClick={() => { if (underline) onChange({ style: 'highlight' }); }}
      >
        <HighlightIcon />
      </button>
      <button
        type="button" class={styles.segment} role="radio"
        aria-label={t.markUnderline} aria-checked={underline} tabIndex={radioTabIndex(underline, 1, true)} aria-keyshortcuts="U" title={t.markUnderline}
        onClick={() => { if (!underline) onChange({ style: 'underline' }); }}
      >
        <UnderlineGlyph bar={look.strokeWidth ?? UNDERLINE_WIDTH.default} />
      </button>
    </span>
  );
}

/** The active style's one setting, beside the switch: the highlight's opacity (its percent, marked in the current color and stroke) or the underline's thickness (the line it lays). */
export function StyleSetting({ look, onChange }: Look) {
  const sketch = look.stroke === 'sketch';
  const counterScaled = useToolbarScaled();
  if (look.style === 'underline') {
    const width = look.strokeWidth ?? UNDERLINE_WIDTH.default;
    return (
      <ThicknessPickerMenu
        value={width} title={t.markThickness} options={THICKNESS_OPTIONS} triggerClass={styles.setting} counterScaled={counterScaled}
        itemTitle={(n) => formatMessage(t.thicknessItem, { n })}
        onChange={(strokeWidth) => onChange({ style: 'underline', strokeWidth })}
        header={<StrokeChoice stroke={look.stroke} underline color={look.color} onChange={onChange} />}
        renderLine={(n) => (
          <span class={styles.thicknessLine}>
            <StrokeInk underline sketch={sketch} color="currentColor" width={n} w={80} h={n + 4} seed={n} />
          </span>
        )}
      >
        <span class={`${styles.face} ${styles.faceLine}`} data-setting-line data-setting-face>
          <StrokeInk underline sketch={sketch} color="currentColor" width={width} w={40} h={14} />
        </span>
        <Chevron />
      </ThicknessPickerMenu>
    );
  }
  return (
    <OpacityMenu
      value={look.opacity} triggerClass={styles.setting} onChange={(opacity) => onChange({ style: 'highlight', opacity })}
      stroke={look.stroke} color={look.color} onStroke={onChange}
    >
      <span class={`${styles.face} ${styles.paper}`} data-setting-face>
        <StrokeInk underline={false} sketch={sketch} color={look.color} opacity={look.opacity} w={40} h={16} />
        <span class={styles.percent}>{Math.round(look.opacity * 100)}%</span>
      </span>
      <Chevron />
    </OpacityMenu>
  );
}
