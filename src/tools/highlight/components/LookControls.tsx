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
import OpacitySlider from './OpacitySlider.tsx';
import styles from './LookControls.module.css';

const SIX_PRESETS = HIGHLIGHT_COLORS.map((c) => c.hex);
const THICKNESS_OPTIONS = [1, 1.5, 2, 3, 4];
const COLOR_NAMES = highlightColorNames(englishSignMessages);

/**
 * The controls that choose a look, on the dark bar of a mark or of the pen: a color menu with opacity (none for an
 * underline), then the Highlight | Underline toggle with the underline's thickness caret. Every change is the caller's.
 */
export default function LookControls({ look, onChange }: { look: Marker; onChange(change: Partial<Marker>): void }) {
  const underline = look.style === 'underline';
  const toggleUnderline = () => onChange({ style: underline ? 'highlight' : 'underline' });
  return (
    <>
      <ColorPickerMenu
        value={look.color} title={t.markColors} presets={SIX_PRESETS} names={COLOR_NAMES} custom="wheel"
        onChange={(color) => onChange({ color })}
      >
        {!underline && <OpacitySlider value={look.opacity} onChange={(opacity) => onChange({ opacity })} />}
      </ColorPickerMenu>
      <div class={controls.divider} />
      <span class={styles.toggle} data-style-toggle>
        <button
          type="button" class={`${controls['element-button']}${underline ? '' : ` ${controls.active}`}`}
          aria-label={t.markHighlight} aria-pressed={!underline} title={t.markHighlight}
          onClick={() => { if (underline) toggleUnderline(); }}
        >
          <HighlightIcon />
        </button>
        {/* The Underline segment owns its thickness: U and caret are one pill, filled together. */}
        <span class={styles.underline} data-on={underline || undefined}>
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
    </>
  );
}
