import { HighlightIcon } from '#editor-ui/toolIcons.tsx';
import ColorPickerMenu from '#editor-ui/ColorPickerMenu.tsx';
import ThicknessPickerMenu from '#editor-ui/ThicknessPickerMenu.tsx';
import { highlightColorNames } from '#editor-ui/highlight/highlightColorNames.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { HIGHLIGHT_COLORS, type Marker } from '../lib/marker/markerState.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import controls from '#editor-ui/EditorControls.module.css';
import UnderlineGlyph from './UnderlineGlyph.tsx';
import OpacityMenu from './OpacityMenu.tsx';
import styles from './LookControls.module.css';

const SIX_PRESETS = HIGHLIGHT_COLORS.map((c) => c.hex);
const THICKNESS_OPTIONS = [1, 1.5, 2, 3, 4];
const COLOR_NAMES = highlightColorNames(englishSignMessages);

/**
 * The controls that choose a look, on the dark bar of a mark or of the pen: a color menu, then the Highlight | Underline toggle with
 * the highlight's opacity caret and the underline's thickness caret. Every change is the caller's.
 */
export default function LookControls({ look, onChange }: { look: Marker; onChange(change: Partial<Marker>): void }) {
  return (
    <>
      <ColorPickerMenu
        value={look.color} title={t.markColors} presets={SIX_PRESETS} names={COLOR_NAMES} custom="wheel"
        onChange={(color) => onChange({ color })}
      />
      <div class={controls.divider} />
      <StyleToggle look={look} onChange={onChange} />
    </>
  );
}

/** Highlight | Underline, each with its caret (opacity, thickness); `light` is for a light popover (the Marker panel), not a dark bar. */
export function StyleToggle({ look, onChange, tone = 'dark' }: { look: Marker; onChange(change: Partial<Marker>): void; tone?: 'dark' | 'light' }) {
  const underline = look.style === 'underline';
  const toggleUnderline = () => onChange({ style: underline ? 'highlight' : 'underline' });
  return (
    <span class={tone === 'light' ? `${styles.toggle} ${styles.light}` : styles.toggle} data-style-toggle>
      {/* Each segment owns its caret: icon and caret are one pill, filled together. */}
      <span class={styles.segment} data-on={underline ? undefined : true}>
        <button
          type="button" class={controls['element-button']}
          aria-label={t.markHighlight} aria-pressed={!underline} title={t.markHighlight}
          onClick={() => { if (underline) toggleUnderline(); }}
        >
          <HighlightIcon />
        </button>
        <OpacityMenu value={look.opacity} onChange={(opacity) => onChange({ style: 'highlight', opacity })} />
      </span>
      <span class={styles.segment} data-on={underline || undefined}>
        <button
          type="button" class={controls['element-button']}
          aria-label={t.markUnderline} aria-pressed={underline} aria-keyshortcuts="U" title={t.markUnderline}
          onClick={() => { if (!underline) toggleUnderline(); }}
        >
          <UnderlineGlyph bar={look.strokeWidth ?? UNDERLINE_WIDTH.default} />
        </button>
        <ThicknessPickerMenu
          trigger="caret" value={look.strokeWidth ?? UNDERLINE_WIDTH.default} title={t.markThickness} options={THICKNESS_OPTIONS}
          itemTitle={(n) => formatMessage(t.thicknessItem, { n })}
          onChange={(strokeWidth) => onChange({ style: 'underline', strokeWidth })}
        />
      </span>
    </span>
  );
}
