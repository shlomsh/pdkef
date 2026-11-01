import { useLayoutEffect, useRef } from 'preact/hooks';
import { CommentIcon, TrashIcon } from '#editor-ui/toolIcons.tsx';
import ColorPickerMenu from '#editor-ui/ColorPickerMenu.tsx';
import ThicknessPickerMenu from '#editor-ui/ThicknessPickerMenu.tsx';
import HighlightSwatches from '#editor-ui/highlight/HighlightSwatches.tsx';
import type { HighlightElement } from '#editor/model/editorModel.ts';
import { EXTRA_HIGHLIGHT_COLORS } from '#editor/model/highlightColors.ts';
import { UNDERLINE_WIDTH } from '#editor/model/underlineInk.ts';
import { englishSignMessages } from '#editor/registry/signMessages.ts';
import { formatMessage } from '#lib/text/formatMessage.ts';
import { OPACITY_MIN, type Marker } from '../lib/marker/markerState.ts';
import { markOf } from '../lib/marker/markEdit.ts';
import { nextFocusIndex } from '../lib/marker/roving.ts';
import { useToolbarDismissal, type HintAnchor } from '../hooks/useRestToolbar.ts';
import { englishHighlightMessages as t } from '../messages.ts';
import useMarkToolbarPlacement from '../hooks/useMarkToolbarPlacement.ts';
import controls from '#editor-ui/EditorControls.module.css';
import elementStyles from '#editor-ui/EditorElement.module.css';
import styles from './RestToolbar.module.css';

const EXTRA_PRESETS = EXTRA_HIGHLIGHT_COLORS.map((c) => c.hex);
const THICKNESS_OPTIONS = [1, 1.5, 2, 3, 4];

/**
 * The toolbar a highlight opens on a rest or a tap, built from Sign's own element toolbar pieces: swatches, a color
 * menu with opacity, the Highlight and Underline toggles, an underline's thickness, Comment and Delete.
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

  const styleButton = (kind: Marker['style'], label: string, shortcut?: string) => (
    <button
      type="button" class={`${controls['element-button']}${look.style === kind ? ` ${controls.active}` : ''}`}
      aria-label={label} aria-pressed={look.style === kind} aria-keyshortcuts={shortcut} title={label}
      onClick={() => live.current.onChange({ style: kind })}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={placement.setRoot} class={`${elementStyles.actions} ${styles.bar}`} style={placement.style} role="toolbar" aria-label={t.markToolbar}
      data-rest-toolbar data-side="above" onKeyDown={onArrow}
    >
      <HighlightSwatches color={look.color} t={englishSignMessages} onChange={({ color }) => live.current.onChange({ color })} />
      <ColorPickerMenu
        value={look.color} title={t.markColors} presets={EXTRA_PRESETS}
        onChange={(color) => live.current.onChange({ color })}
      >
        {!underline && (
          <label class={styles.opacity}>
            <input
              type="range" min={OPACITY_MIN} max={1} step={0.05} value={look.opacity} aria-label={t.markOpacity}
              onInput={(e) => live.current.onChange({ opacity: Number((e.target as HTMLInputElement).value) })}
            />
            <span aria-hidden="true">{Math.round(look.opacity * 100)}%</span>
          </label>
        )}
      </ColorPickerMenu>
      <div class={controls.divider} />
      {styleButton('highlight', t.markHighlight)}
      {styleButton('underline', t.markUnderline, 'U')}
      {underline && (
        <ThicknessPickerMenu
          value={look.strokeWidth ?? UNDERLINE_WIDTH.default} title={t.markThickness} options={THICKNESS_OPTIONS}
          itemTitle={(n) => formatMessage(t.thicknessItem, { n })}
          onChange={(strokeWidth) => live.current.onChange({ strokeWidth })}
        />
      )}
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
  // Kept inside the screen, once, as it appears.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const shift = r.left < 8 ? 8 - r.left : r.right > vw - 8 ? vw - 8 - r.right : 0;
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
