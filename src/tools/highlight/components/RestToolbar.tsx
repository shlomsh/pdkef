import { useLayoutEffect, useRef } from 'preact/hooks';
import { CommentIcon, HighlightIcon, TrashIcon } from '#editor-ui/toolIcons.tsx';
import ColorPickerMenu from '#editor-ui/ColorPickerMenu.tsx';
import ThicknessPickerMenu from '#editor-ui/ThicknessPickerMenu.tsx';
import { highlightColorNames } from '#editor-ui/highlight/highlightColorNames.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { HIGHLIGHT_COLORS, type Marker } from '../lib/marker/markerState.ts';
import { markOf } from '../lib/marker/markEdit.ts';
import { nextFocusIndex } from '../lib/marker/roving.ts';
import { useToolbarDismissal, type HintAnchor } from '../hooks/useRestToolbar.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import useMarkToolbarPlacement from '../hooks/useMarkToolbarPlacement.ts';
import controls from '#editor-ui/EditorControls.module.css';
import elementStyles from '#editor-ui/EditorElement.module.css';
import UnderlineGlyph from './UnderlineGlyph.tsx';
import OpacitySlider from './OpacitySlider.tsx';
import styles from './RestToolbar.module.css';

const SIX_PRESETS = HIGHLIGHT_COLORS.map((c) => c.hex);
const THICKNESS_OPTIONS = [1, 1.5, 2, 3, 4];
const COLOR_NAMES = highlightColorNames(englishSignMessages);

/**
 * The toolbar a highlight opens on a rest or a tap, built from Sign's own element toolbar pieces: a color
 * menu with opacity, the Highlight | Underline toggle (icons, with the underline's thickness caret), Comment and Delete.
 * It is placed by Sign's floating hook, above the mark, and every change is the caller's to apply.
 */
export default function RestToolbar({ mark, onChange, onDelete, onComment, onClose }: {
  mark: HighlightElement;
  onChange(change: Partial<Marker>): void;
  onDelete(): void;
  /** R27: open this highlight's comment (a blank one first if it has none). */
  onComment(): void;
  onClose(): void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rtl = mark.direction === 'rtl';
  const look = markOf(mark);
  const underline = look.style === 'underline';

  // The latest of everything the document listeners need, so they subscribe once.
  const live = useRef({ mark, onChange, onDelete, onComment, onClose, look });
  live.current = { mark, onChange, onDelete, onComment, onClose, look };

  const toggleUnderline = () => live.current.onChange({ style: live.current.look.style === 'underline' ? 'highlight' : 'underline' });

  // Sign's placement: above the mark, start edge (end for RTL), inside the page wrapper and the visual viewport.
  const placement = useMarkToolbarPlacement(rootRef, mark.id, rtl);

  useToolbarDismissal(rootRef, live, { toggleUnderline });

  const onArrow = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'BUTTON') return;
    const buttons = [...(rootRef.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    // Arrows follow the interface direction, never the mark's text direction.
    const interfaceRtl = !!rootRef.current && getComputedStyle(rootRef.current).direction === 'rtl';
    const next = nextFocusIndex(buttons.indexOf(target), e.key, buttons.length, interfaceRtl);
    if (next === null) return;
    e.preventDefault();
    buttons[next].focus();
  };

  return (
    <div
      ref={placement.setRoot} class={`${elementStyles.actions} ${styles.bar}`} style={placement.style} role="toolbar" aria-label={t.markToolbar}
      data-rest-toolbar data-side="above" onKeyDown={onArrow}
    >
      <ColorPickerMenu
        value={look.color} title={t.markColors} presets={SIX_PRESETS} names={COLOR_NAMES} custom="wheel"
        onChange={(color) => live.current.onChange({ color })}
      >
        {!underline && <OpacitySlider value={look.opacity} onChange={(opacity) => live.current.onChange({ opacity })} />}
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
            onChange={(strokeWidth) => live.current.onChange({ style: 'underline', strokeWidth })}
          />
        </span>
      </span>
      <div class={controls.divider} />
      <button type="button" class={controls['element-button']} aria-label={t.markComment} aria-keyshortcuts="C" title={t.markComment} onClick={() => live.current.onComment()}>
        <CommentIcon size={18} />
      </button>
      <button
        type="button" class={`${controls['element-button']} ${controls['element-button-danger']}`} aria-label={t.markDelete} aria-keyshortcuts="Delete" title={t.markDelete}
        onClick={() => live.current.onDelete()}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

/** R8: a quiet pill beside the end of the first mark's ink, never over the line being read. */
export function MarkHint({ anchor, text }: { anchor: HintAnchor; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Kept inside the screen and the page card (which clips it), once, as it appears.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const card = el.closest('[data-page-wrapper]')?.getBoundingClientRect();
    const min = Math.max(0, card?.left ?? 0) + 8;
    const max = Math.min(document.documentElement.clientWidth, card?.right ?? Infinity) - 8;
    const shift = r.left < min ? min - r.left : r.right > max ? max - r.right : 0;
    if (shift) el.style.translate = `${shift}px 0`;
  }, []);
  return (
    <div
      ref={ref} data-mark-hint class={`${styles.hint} ${anchor.rtl ? styles.hintRtl : ''}`}
      style={{ left: `${anchor.x}%`, top: `${anchor.bottom}%` }}
    >
      {text}
    </div>
  );
}
